/**
 * Pure TypeScript MPEG-TS → MP4 remuxer.
 *
 * No external binaries are involved: the transport stream is demuxed, H.264
 * and AAC payloads are converted to MP4 sample format and a progressive MP4
 * (moov at the end) is written. Only stream copying happens here, so the
 * output has exactly the same quality as the HLS source.
 */
import fsp from 'node:fs/promises';

import { splitAdts } from './aac';
import { buildAvcC, parseSps, splitAnnexB, toAvcSample } from './h264';
import { writeMp4, type SampleMeta } from './mp4-writer';
import { demuxTransportStream } from './ts-demux';

const VIDEO_TIMESCALE = 90_000;
const TS_WRAP = 0x2_0000_0000; // 33-bit PTS/DTS clock
/** Treat a backwards clock jump of more than this as a new segment. */
const DISCONTINUITY_TOLERANCE = VIDEO_TIMESCALE; // 1 s

export interface RemuxResult {
  width: number;
  height: number;
  durationMs: number;
  videoFrames: number;
  audioFrames: number;
  hasAudio: boolean;
  /** Non-fatal notes, e.g. skipped secondary streams. */
  warnings: string[];
}

export interface RemuxOptions {
  /** Fallback geometry when the SPS cannot be parsed. */
  width?: number;
  height?: number;
}

interface VideoSampleMeta {
  size: number;
  pts: number | null;
  dts: number | null;
  sync: boolean;
}

interface AudioFrameMeta {
  size: number;
  /** Presentation time in 90 kHz ticks, when the PES header carried one. */
  time: number | null;
  /** PCM samples carried by this AAC frame. */
  samples: number;
}

function median(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Extends a 33-bit clock value past a wrap so it stays monotonic. */
function unwrapClock(value: number, last: number): number {
  if (last < 0) return value;
  let result = value;
  while (result < last - TS_WRAP / 2) result += TS_WRAP;
  return result;
}

async function writeAll(handle: fsp.FileHandle, data: Buffer): Promise<void> {
  let offset = 0;
  while (offset < data.length) {
    const { bytesWritten } = await handle.write(
      data,
      offset,
      data.length - offset,
    );
    if (bytesWritten <= 0) throw new Error('写入临时文件失败');
    offset += bytesWritten;
  }
}

/**
 * Remuxes a transport stream file into a progressive MP4 file.
 *
 * @throws when the stream uses an unsupported codec or carries no video.
 */
export async function remuxTsToMp4(
  inputPath: string,
  outputPath: string,
  options: RemuxOptions = {},
): Promise<RemuxResult> {
  const base = `${outputPath}.bsky-part`;
  const videoEsPath = `${base}.video`;
  const audioEsPath = `${base}.audio`;
  const warnings: string[] = [];

  const videoMeta: VideoSampleMeta[] = [];
  const audioMeta: AudioFrameMeta[] = [];
  let sps: Buffer | undefined;
  let pps: Buffer | undefined;
  let spsInfo: ReturnType<typeof parseSps> | undefined;
  let audioConfig: Buffer | undefined;
  let audioRate = 0;
  let audioChannels = 0;
  let videoBytes = 0;
  let audioBytes = 0;

  const videoHandle = await fsp.open(videoEsPath, 'w');
  const audioHandle = await fsp.open(audioEsPath, 'w');

  let summary;
  try {
    summary = await demuxTransportStream(inputPath, {
      video: async (chunk) => {
        const nals = splitAnnexB(chunk.data);
        if (nals.length === 0) return;
        if (!sps) {
          const found = nals.find((nal) => nal.type === 7);
          if (found) {
            sps = Buffer.from(found.data);
            try {
              spsInfo = parseSps(found.data);
            } catch {
              spsInfo = undefined;
            }
          }
        }
        if (!pps) {
          const found = nals.find((nal) => nal.type === 8);
          if (found) pps = Buffer.from(found.data);
        }
        const sample = toAvcSample(nals);
        if (!sample) return;
        await writeAll(videoHandle, sample);
        videoBytes += sample.length;
        videoMeta.push({
          size: sample.length,
          pts: chunk.pts,
          dts: chunk.dts,
          sync: nals.some((nal) => nal.type === 5),
        });
      },
      audio: async (chunk) => {
        const adts = splitAdts(chunk.data);
        if (!adts) return;
        if (!audioConfig) {
          audioConfig = adts.config;
          audioRate = adts.sampleRate;
          audioChannels = adts.channels;
        }
        let offset = 0;
        for (const frame of adts.frames) {
          await writeAll(audioHandle, frame.data);
          audioBytes += frame.data.length;
          audioMeta.push({
            size: frame.data.length,
            samples: frame.samples,
            time:
              chunk.pts === null
                ? null
                : chunk.pts + (offset * VIDEO_TIMESCALE) / adts.sampleRate,
          });
          offset += frame.samples;
        }
      },
    });
  } finally {
    await videoHandle.close().catch(() => undefined);
    await audioHandle.close().catch(() => undefined);
  }

  try {
    if (summary.unsupportedStreams.length > 0) {
      warnings.push(
        `已忽略不受支持的附加流：${summary.unsupportedStreams.join(', ')}`,
      );
    }
    if (summary.videoPid === undefined) throw new Error('未找到视频轨');
    if (summary.videoStreamType && summary.videoStreamType !== 0x1b) {
      throw new Error('该视频不是 H.264 编码，暂不支持内置封装');
    }
    if (videoMeta.length === 0) throw new Error('视频轨为空');
    if (!sps || !pps) throw new Error('缺少 H.264 参数集（SPS/PPS）');

    // --- Video timeline ---------------------------------------------------
    const fps = spsInfo?.fps && spsInfo.fps > 1 ? spsInfo.fps : 30;
    const nominalDelta = Math.max(1, Math.round(VIDEO_TIMESCALE / fps));
    const observedDeltas: number[] = [];
    for (let i = 1; i < videoMeta.length; i += 1) {
      const previous = videoMeta[i - 1].dts ?? videoMeta[i - 1].pts;
      const current = videoMeta[i].dts ?? videoMeta[i].pts;
      if (previous === null || current === null) continue;
      const delta = current - previous;
      if (delta > 0 && delta < VIDEO_TIMESCALE * 5) observedDeltas.push(delta);
    }
    const frameDelta = median(observedDeltas, nominalDelta);

    const videoTimes: Array<{ pts: number; dts: number; duration: number }> = [];
    let dtsClock = -1;
    let ptsClock = -1;
    let shift = 0;
    let lastDts = 0;

    for (let i = 0; i < videoMeta.length; i += 1) {
      const sample = videoMeta[i];
      let dts: number;
      if (sample.dts !== null) {
        dts = unwrapClock(sample.dts, dtsClock);
        dtsClock = dts;
      } else if (sample.pts !== null) {
        dts = unwrapClock(sample.pts, dtsClock);
        dtsClock = dts;
      } else {
        dts = i === 0 ? 0 : lastDts - shift + frameDelta;
      }

      const candidate = dts + shift;
      if (candidate < lastDts - frameDelta && lastDts - candidate > DISCONTINUITY_TOLERANCE) {
        // A concatenated segment restarted its clock: continue the timeline.
        shift += lastDts + frameDelta - candidate;
      }
      let shiftedDts = dts + shift;

      let pts: number;
      if (sample.pts !== null) {
        let rawPts = sample.pts;
        if (sample.dts !== null && rawPts < sample.dts - TS_WRAP / 2) {
          rawPts += TS_WRAP;
        }
        rawPts = unwrapClock(rawPts, ptsClock);
        ptsClock = rawPts;
        pts = rawPts + shift;
        // PTS must not precede DTS plus any accumulated segment shift.
        while (pts < shiftedDts) pts += TS_WRAP;
      } else {
        pts = shiftedDts;
      }

      videoTimes.push({ pts, dts: shiftedDts, duration: frameDelta });
      lastDts = shiftedDts;
    }

    for (let i = 0; i < videoTimes.length; i += 1) {
      const next = videoTimes[i + 1];
      if (next && next.dts > videoTimes[i].dts) {
        videoTimes[i].duration = next.dts - videoTimes[i].dts;
      }
    }

    // --- Audio timeline ---------------------------------------------------
    const audioTimes: number[] = [];
    let expectedSamples = 0;
    for (const frame of audioMeta) {
      const absolute =
        frame.time === null
          ? expectedSamples
          : (frame.time * audioRate) / VIDEO_TIMESCALE;
      const resynced =
        frame.time === null || Math.abs(absolute - expectedSamples) <= audioRate * 0.5;
      const value = resynced ? absolute : expectedSamples;
      audioTimes.push(value);
      expectedSamples = value + frame.samples;
    }

    const videoStart = videoTimes[0].dts;
    const audioStart =
      audioRate > 0 && audioTimes.length > 0
        ? (audioTimes[0] * VIDEO_TIMESCALE) / audioRate
        : null;
    const globalStart =
      audioStart === null ? videoStart : Math.min(videoStart, audioStart);

    const videoSamples: SampleMeta[] = videoTimes.map((timing, index) => ({
      size: videoMeta[index].size,
      pts: timing.pts - videoStart,
      dts: timing.dts - videoStart,
      sync: videoMeta[index].sync,
      duration: timing.duration,
    }));

    const audioSamples: SampleMeta[] = [];
    if (audioRate > 0 && audioConfig && audioTimes.length > 0) {
      const audioBase = audioTimes[0];
      for (let i = 0; i < audioTimes.length; i += 1) {
        const position = Math.max(0, Math.round(audioTimes[i] - audioBase));
        audioSamples.push({
          size: audioMeta[i].size,
          pts: position,
          dts: position,
          sync: true,
          duration: audioMeta[i].samples,
        });
      }
    }

    const width = spsInfo?.width || options.width || 0;
    const height = spsInfo?.height || options.height || 0;
    if (!width || !height) throw new Error('无法解析视频分辨率');

    const lastVideo = videoTimes[videoTimes.length - 1];
    const videoEnd = lastVideo.dts + lastVideo.duration - videoStart;
    const lastAudio = audioSamples[audioSamples.length - 1];
    const audioEnd = lastAudio ? lastAudio.dts + (lastAudio.duration ?? 1024) : 0;

    const toMs = (ticks: number, timescale: number): number =>
      timescale > 0 ? (ticks / timescale) * 1000 : 0;

    await writeMp4({
      outputPath,
      video: {
        width,
        height,
        timescale: VIDEO_TIMESCALE,
        samples: videoSamples,
        avcC: buildAvcC(sps, pps),
        bytes: videoBytes,
        startDelayMs: toMs(videoStart - globalStart, VIDEO_TIMESCALE),
      },
      audio:
        audioSamples.length > 0 && audioConfig
          ? {
              sampleRate: audioRate,
              channels: audioChannels || 2,
              samples: audioSamples,
              asc: audioConfig,
              bytes: audioBytes,
              startDelayMs:
                audioStart === null
                  ? 0
                  : toMs(audioStart - globalStart, VIDEO_TIMESCALE),
            }
          : undefined,
      videoEsPath,
      audioEsPath: audioSamples.length > 0 ? audioEsPath : undefined,
    });

    return {
      width,
      height,
      durationMs: Math.round(
        Math.max(
          toMs(videoEnd, VIDEO_TIMESCALE),
          toMs(audioEnd, audioRate || VIDEO_TIMESCALE),
        ),
      ),
      videoFrames: videoSamples.length,
      audioFrames: audioSamples.length,
      hasAudio: audioSamples.length > 0,
      warnings,
    };
  } finally {
    await fsp.rm(videoEsPath, { force: true }).catch(() => undefined);
    await fsp.rm(audioEsPath, { force: true }).catch(() => undefined);
  }
}
