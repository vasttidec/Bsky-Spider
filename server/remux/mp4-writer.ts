/**
 * Progressive MP4 writer for H.264 + AAC tracks.
 *
 * The writer only needs per-sample metadata plus the already converted
 * elementary stream payloads, which are streamed from temporary files so that
 * long videos never have to be held in memory.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';

import {
  box,
  descriptor,
  fixed1616,
  fullBox,
  i16,
  matrix,
  toMovieTimescale,
  u16,
  u24,
  u32,
  u8,
} from './boxes';

export interface SampleMeta {
  size: number;
  /** Composition (presentation) timestamp in the track timescale. */
  pts: number;
  /** Decode timestamp in the track timescale. */
  dts: number;
  /** True for key frames (IDR for video, every frame for audio). */
  sync: boolean;
  /** Sample duration; only needed for the very last sample. */
  duration?: number;
}

export interface VideoTrackInput {
  width: number;
  height: number;
  timescale: number;
  samples: SampleMeta[];
  avcC: Buffer;
  bytes: number;
  /** Presentation offset relative to the earliest track start, in ms. */
  startDelayMs: number;
}

export interface AudioTrackInput {
  sampleRate: number;
  channels: number;
  samples: SampleMeta[];
  asc: Buffer;
  bytes: number;
  startDelayMs: number;
}

export interface WriteMp4Options {
  outputPath: string;
  video: VideoTrackInput;
  audio?: AudioTrackInput;
  videoEsPath: string;
  audioEsPath?: string;
}

function compressorName(name: string): Buffer {
  const buffer = Buffer.alloc(32);
  const text = Buffer.from(name, 'latin1').subarray(0, 31);
  buffer.writeUInt8(text.length, 0);
  text.copy(buffer, 1);
  return buffer;
}

function mvhd(durationMs: number, nextTrackId: number): Buffer {
  return fullBox(
    'mvhd',
    0,
    0,
    u32(0), // creation_time
    u32(0), // modification_time
    u32(1000), // timescale
    u32(durationMs),
    u32(0x00010000), // rate
    u16(0x0100), // volume
    u16(0), // reserved
    u32(0),
    u32(0),
    matrix(),
    u32(0),
    u32(0),
    u32(0),
    u32(0),
    u32(0),
    u32(0),
    u32(nextTrackId),
  );
}

function tkhd(options: {
  trackId: number;
  durationMs: number;
  width: number;
  height: number;
  volume: number;
}): Buffer {
  return fullBox(
    'tkhd',
    0,
    0x000007, // enabled | in movie | in preview
    u32(0), // creation_time
    u32(0), // modification_time
    u32(options.trackId),
    u32(0), // reserved
    u32(options.durationMs),
    u32(0),
    u32(0),
    i16(0), // layer
    i16(0), // alternate_group
    u16(options.volume),
    u16(0), // reserved
    matrix(),
    fixed1616(options.width),
    fixed1616(options.height),
  );
}

function elst(
  segments: Array<{ durationMs: number; mediaTime: number }>,
): Buffer {
  const entries = Buffer.concat(
    segments.flatMap((segment) => [
      u32(segment.durationMs),
      // media_time -1 marks an empty edit.
      segment.mediaTime < 0
        ? Buffer.from('ffffffff', 'hex')
        : u32(segment.mediaTime),
      u16(0x0001), // media_rate 1.0
      u16(0),
    ]),
  );
  return fullBox('elst', 0, 0, u32(segments.length), entries);
}

function mdhd(timescale: number, duration: number): Buffer {
  return fullBox(
    'mdhd',
    0,
    0,
    u32(0),
    u32(0),
    u32(timescale),
    u32(duration),
    u16(0x55c4), // 'und'
    u16(0),
  );
}

function hdlr(handlerType: 'vide' | 'soun', name: string): Buffer {
  return fullBox(
    'hdlr',
    0,
    0,
    u32(0),
    Buffer.from(handlerType, 'latin1'),
    u32(0),
    u32(0),
    u32(0),
    Buffer.from(`${name}\0`, 'latin1'),
  );
}

function dinf(): Buffer {
  return box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1)));
}

function sampleDelta(samples: SampleMeta[], index: number, fallback: number): number {
  const current = samples[index];
  const next = samples[index + 1];
  if (next && next.dts > current.dts) return next.dts - current.dts;
  if (current.duration && current.duration > 0) return current.duration;
  return Math.max(1, fallback);
}

function estimateDelta(samples: SampleMeta[]): number {
  const deltas: number[] = [];
  for (let i = 0; i < samples.length - 1; i += 1) {
    const delta = samples[i + 1].dts - samples[i].dts;
    if (delta > 0) deltas.push(delta);
  }
  if (deltas.length === 0) return 1;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)];
}

function stts(samples: SampleMeta[]): Buffer {
  const fallback = estimateDelta(samples);
  const entries: Array<[number, number]> = [];
  for (let i = 0; i < samples.length; i += 1) {
    const delta = sampleDelta(samples, i, fallback);
    if (entries.length > 0 && entries[entries.length - 1][1] === delta) {
      entries[entries.length - 1][0] += 1;
    } else {
      entries.push([1, delta]);
    }
  }
  return fullBox(
    'stts',
    0,
    0,
    u32(entries.length),
    Buffer.concat(
      entries.map(([count, delta]) => Buffer.concat([u32(count), u32(delta)])),
    ),
  );
}

function ctts(samples: SampleMeta[]): Buffer | null {
  let minimum = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    minimum = Math.min(minimum, sample.pts - sample.dts);
  }
  if (!Number.isFinite(minimum)) return null;
  const offsets = samples.map((sample) =>
    Math.max(0, Math.round(sample.pts - sample.dts - minimum)),
  );
  if (offsets.every((offset) => offset === 0)) return null;

  const entries: Array<[number, number]> = [];
  for (const offset of offsets) {
    if (entries.length > 0 && entries[entries.length - 1][1] === offset) {
      entries[entries.length - 1][0] += 1;
    } else {
      entries.push([1, offset]);
    }
  }
  return fullBox(
    'ctts',
    0,
    0,
    u32(entries.length),
    Buffer.concat(
      entries.map(([count, offset]) =>
        Buffer.concat([u32(count), u32(offset)]),
      ),
    ),
  );
}

function stss(samples: SampleMeta[]): Buffer | null {
  const syncSamples: number[] = [];
  samples.forEach((sample, index) => {
    if (sample.sync) syncSamples.push(index + 1);
  });
  if (syncSamples.length === 0 || syncSamples.length === samples.length) {
    return null;
  }
  return fullBox(
    'stss',
    0,
    0,
    u32(syncSamples.length),
    Buffer.concat(syncSamples.map((value) => u32(value))),
  );
}

function stsc(sampleCount: number): Buffer {
  return fullBox('stsc', 0, 0, u32(1), u32(1), u32(sampleCount), u32(1));
}

function stsz(samples: SampleMeta[]): Buffer {
  const first = samples[0]?.size ?? 0;
  const uniform =
    samples.length > 0 && samples.every((sample) => sample.size === first);
  if (uniform) {
    return fullBox('stsz', 0, 0, u32(first), u32(samples.length));
  }
  return fullBox(
    'stsz',
    0,
    0,
    u32(0),
    u32(samples.length),
    Buffer.concat(samples.map((sample) => u32(sample.size))),
  );
}

function stco(chunkOffset: number): Buffer {
  return fullBox('stco', 0, 0, u32(1), u32(chunkOffset));
}

function esds(asc: Buffer, avgBitrate: number): Buffer {
  const decoderSpecific = descriptor(0x05, asc);
  const decoderConfig = descriptor(
    0x04,
    Buffer.concat([
      u8(0x40), // MPEG-4 audio
      u8(0x15), // audio stream
      u24(0), // buffer size
      u32(Math.max(1, Math.round(avgBitrate))),
      u32(Math.max(1, Math.round(avgBitrate))),
      decoderSpecific,
    ]),
  );
  const slConfig = descriptor(0x06, u8(0x02));
  const esDescriptor = descriptor(
    0x03,
    Buffer.concat([u16(1), u8(0), decoderConfig, slConfig]),
  );
  return fullBox('esds', 0, 0, esDescriptor);
}

function videoSampleEntry(width: number, height: number, avcC: Buffer): Buffer {
  return box(
    'avc1',
    Buffer.alloc(6), // reserved
    u16(1), // data_reference_index
    u16(0), // pre_defined
    u16(0), // reserved
    u32(0),
    u32(0),
    u32(0), // pre_defined[3]
    u16(width),
    u16(height),
    u32(0x00480000), // horizresolution 72 dpi
    u32(0x00480000), // vertresolution
    u32(0), // reserved
    u16(1), // frame_count
    compressorName('Bsky-Spider'),
    u16(0x0018), // depth
    i16(-1), // pre_defined
    box('avcC', avcC),
  );
}

function audioSampleEntry(
  channels: number,
  sampleRate: number,
  asc: Buffer,
  avgBitrate: number,
): Buffer {
  return box(
    'mp4a',
    Buffer.alloc(6),
    u16(1),
    u32(0),
    u32(0),
    u16(channels),
    u16(16),
    u16(0),
    u16(0),
    u32(Math.min(0xffffffff, Math.round(sampleRate) * 65536)),
    esds(asc, avgBitrate),
  );
}

function stbl(
  entry: Buffer,
  samples: SampleMeta[],
  chunkOffset: number,
  includeCtts: boolean,
): Buffer {
  const children: Buffer[] = [
    fullBox('stsd', 0, 0, u32(1), entry),
    stts(samples),
  ];
  if (includeCtts) {
    const composition = ctts(samples);
    if (composition) children.push(composition);
  }
  const sync = stss(samples);
  if (sync) children.push(sync);
  children.push(stsc(samples.length), stsz(samples), stco(chunkOffset));
  return box('stbl', ...children);
}

function trackDuration(samples: SampleMeta[]): number {
  if (samples.length === 0) return 0;
  const fallback = estimateDelta(samples);
  let total = 0;
  for (let i = 0; i < samples.length; i += 1) {
    total += sampleDelta(samples, i, fallback);
  }
  return total;
}

function editBoxes(
  startDelayMs: number,
  durationMs: number,
): Buffer[] {
  if (startDelayMs <= 20 || durationMs <= 0) return [];
  return [
    box(
      'edts',
      elst([
        { durationMs: Math.round(startDelayMs), mediaTime: -1 },
        { durationMs, mediaTime: 0 },
      ]),
    ),
  ];
}

function videoTrak(
  trackId: number,
  track: VideoTrackInput,
  chunkOffset: number,
): Buffer {
  const mediaDuration = trackDuration(track.samples);
  const durationMs = toMovieTimescale(mediaDuration, track.timescale);
  return box(
    'trak',
    tkhd({
      trackId,
      durationMs,
      width: track.width,
      height: track.height,
      volume: 0,
    }),
    ...editBoxes(track.startDelayMs, durationMs),
    box(
      'mdia',
      mdhd(track.timescale, mediaDuration),
      hdlr('vide', 'VideoHandler'),
      box(
        'minf',
        fullBox('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)),
        dinf(),
        stbl(
          videoSampleEntry(track.width, track.height, track.avcC),
          track.samples,
          chunkOffset,
          true,
        ),
      ),
    ),
  );
}

function audioTrak(
  trackId: number,
  track: AudioTrackInput,
  chunkOffset: number,
): Buffer {
  const mediaDuration = trackDuration(track.samples);
  const durationMs = toMovieTimescale(mediaDuration, track.sampleRate);
  const avgBitrate =
    mediaDuration > 0
      ? (track.bytes * 8 * track.sampleRate) / mediaDuration
      : 0;
  return box(
    'trak',
    tkhd({
      trackId,
      durationMs,
      width: 0,
      height: 0,
      volume: 0x0100,
    }),
    ...editBoxes(track.startDelayMs, durationMs),
    box(
      'mdia',
      mdhd(track.sampleRate, mediaDuration),
      hdlr('soun', 'SoundHandler'),
      box(
        'minf',
        fullBox('smhd', 0, 0, i16(0), u16(0)),
        dinf(),
        stbl(
          audioSampleEntry(
            track.channels,
            track.sampleRate,
            track.asc,
            avgBitrate,
          ),
          track.samples,
          chunkOffset,
          false,
        ),
      ),
    ),
  );
}

async function appendToHandle(
  handle: fsp.FileHandle,
  filePath: string,
): Promise<void> {
  const stream = fs.createReadStream(filePath, { highWaterMark: 1 << 20 });
  for await (const chunk of stream) {
    const buffer = chunk as Buffer;
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesWritten } = await handle.write(
        buffer,
        offset,
        buffer.length - offset,
      );
      offset += bytesWritten;
    }
  }
}

/**
 * Writes the MP4 file from streamed elementary stream payloads.
 *
 * The movie box is written before the media data ("faststart"), which keeps
 * the file seekable from the first byte and lets Windows Explorer / players
 * generate a cover thumbnail.
 */
export async function writeMp4(options: WriteMp4Options): Promise<void> {
  const ftyp = box(
    'ftyp',
    Buffer.from('isom', 'latin1'),
    u32(0x200),
    Buffer.from('isomiso2avc1mp41', 'latin1'),
  );

  const videoDurationMs = toMovieTimescale(
    trackDuration(options.video.samples),
    options.video.timescale,
  );
  const audioDurationMs = options.audio
    ? toMovieTimescale(
        trackDuration(options.audio.samples),
        options.audio.sampleRate,
      )
    : 0;
  const durationMs = Math.max(videoDurationMs, audioDurationMs);
  const mdatPayloadSize = options.video.bytes + (options.audio?.bytes ?? 0);

  const buildMoov = (mdatPayloadStart: number): Buffer => {
    const videoChunkOffset = mdatPayloadStart;
    const audioChunkOffset = mdatPayloadStart + options.video.bytes;
    const tracks: Buffer[] = [videoTrak(1, options.video, videoChunkOffset)];
    if (options.audio) {
      tracks.push(audioTrak(2, options.audio, audioChunkOffset));
    }
    return box('moov', mvhd(durationMs, tracks.length + 1), ...tracks);
  };

  // The chunk offsets only change the 4-byte values inside `stco`, so the
  // two-pass size calculation below is stable.
  const probeMoov = buildMoov(0);
  const mdatPayloadStart = ftyp.length + probeMoov.length + 8;
  const moov = buildMoov(mdatPayloadStart);
  if (moov.length !== probeMoov.length) {
    throw new Error('MP4 moov 大小不稳定');
  }

  const handle = await fsp.open(options.outputPath, 'w');
  try {
    await handle.write(ftyp);
    await handle.write(moov);
    await handle.write(
      Buffer.concat([
        u32(mdatPayloadSize + 8),
        Buffer.from('mdat', 'latin1'),
      ]),
    );
    await appendToHandle(handle, options.videoEsPath);
    if (options.audio && options.audioEsPath) {
      await appendToHandle(handle, options.audioEsPath);
    }
  } finally {
    await handle.close();
  }
}
