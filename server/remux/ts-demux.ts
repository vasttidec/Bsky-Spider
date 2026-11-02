/**
 * MPEG-TS demuxer.
 *
 * Reads a transport stream (single program, as produced by Bluesky's video
 * transcoder), follows PAT/PMT to find the elementary streams and emits one
 * PES payload per access unit (video) or per PES packet (audio), together with
 * the PTS/DTS carried in the PES header.
 *
 * Emissions are collected per read chunk so callers can await slow consumers
 * (disk writes) without buffering an entire video in memory.
 */
import fs from 'node:fs';

const PACKET_SIZE = 188;
const SYNC_BYTE = 0x47;

export interface PesChunk {
  /** Elementary stream payload (Annex B for H.264, ADTS for AAC). */
  data: Buffer;
  pts: number | null;
  dts: number | null;
}

export type DemuxEmission =
  | { track: 'video'; chunk: PesChunk }
  | { track: 'audio'; chunk: PesChunk };

export interface DemuxSummary {
  videoPid?: number;
  audioPid?: number;
  videoStreamType?: number;
  audioStreamType?: number;
  /** Packets that did not start with the sync byte. */
  resyncCount: number;
  /** Secondary streams that were skipped because they are unsupported. */
  unsupportedStreams: string[];
}

class SectionAssembler {
  private buffer: Buffer | null = null;
  private expected = 0;

  push(payload: Buffer): Buffer | null {
    if (payload.length === 0) return null;
    if (this.buffer && this.expected > 0) {
      const remaining = this.expected - this.buffer.length;
      const take = Math.min(remaining, payload.length);
      this.buffer = Buffer.concat([this.buffer, payload.subarray(0, take)]);
      if (this.buffer.length >= this.expected) {
        const section = this.buffer;
        this.buffer = null;
        this.expected = 0;
        return section;
      }
      return null;
    }

    // A new section begins here (pointer_field already stripped by caller).
    if (payload.length < 3) return null;
    const sectionLength = ((payload[1] & 0x0f) << 8) | payload[2];
    const total = sectionLength + 3;
    if (total > 4096) return null;
    if (payload.length >= total) return payload.subarray(0, total);
    this.buffer = Buffer.from(payload);
    this.expected = total;
    return null;
  }
}

function readTimestamp(data: Buffer, offset: number): number {
  return (
    ((data[offset] & 0x0e) >> 1) * 0x40000000 +
    data[offset + 1] * 0x400000 +
    ((data[offset + 2] & 0xfe) >> 1) * 0x8000 +
    data[offset + 3] * 0x80 +
    ((data[offset + 4] & 0xfe) >> 1)
  );
}

interface PendingPes {
  parts: Buffer[];
  pts: number | null;
  dts: number | null;
}

export class TsDemuxer {
  private readonly pmtPids = new Set<number>();
  private videoPid: number | null = null;
  private audioPid: number | null = null;
  private videoStreamType = 0;
  private audioStreamType = 0;
  private readonly pending = new Map<number, PendingPes>();
  private readonly patAssembler = new SectionAssembler();
  private readonly pmtAssembler = new SectionAssembler();
  private patComplete = false;
  private remainder: Buffer = Buffer.alloc(0);
  private resyncCount = 0;
  private readonly droppedStreams = new Set<string>();

  /** Parses every complete packet in `chunk`, appending emissions to `out`. */
  push(chunk: Buffer, out: DemuxEmission[]): void {
    const data =
      this.remainder.length > 0 ? Buffer.concat([this.remainder, chunk]) : chunk;
    let offset = 0;
    while (offset + PACKET_SIZE <= data.length) {
      if (data[offset] !== SYNC_BYTE) {
        const next = this.findSync(data, offset + 1);
        if (next < 0) {
          offset = data.length - (data.length % PACKET_SIZE);
          break;
        }
        offset = next;
        this.resyncCount += 1;
        continue;
      }
      this.handlePacket(data.subarray(offset, offset + PACKET_SIZE), out);
      offset += PACKET_SIZE;
    }
    this.remainder = Buffer.from(data.subarray(offset));
  }

  flush(out: DemuxEmission[]): void {
    for (const [pid, pending] of this.pending) {
      this.emitPes(pid, pending, out);
    }
    this.pending.clear();
    this.remainder = Buffer.alloc(0);
  }

  summary(): DemuxSummary {
    return {
      videoPid: this.videoPid ?? undefined,
      audioPid: this.audioPid ?? undefined,
      videoStreamType: this.videoStreamType || undefined,
      audioStreamType: this.audioStreamType || undefined,
      resyncCount: this.resyncCount,
      unsupportedStreams: [...this.droppedStreams],
    };
  }

  private findSync(data: Buffer, from: number): number {
    for (let i = from; i < data.length; i += 1) {
      if (data[i] !== SYNC_BYTE) continue;
      // Prefer an offset where the next packet also starts with 0x47.
      if (i + PACKET_SIZE >= data.length || data[i + PACKET_SIZE] === SYNC_BYTE) {
        return i;
      }
    }
    return -1;
  }

  private handlePacket(packet: Buffer, out: DemuxEmission[]): void {
    const pid = ((packet[1] & 0x1f) << 8) | packet[2];
    const payloadUnitStart = (packet[1] & 0x40) !== 0;
    const adaptationControl = (packet[3] >> 4) & 0x03;
    if (adaptationControl === 0 || adaptationControl === 2) return;

    let offset = 4;
    if (adaptationControl === 3) {
      const adaptationLength = packet[4];
      offset = 5 + adaptationLength;
      if (offset >= PACKET_SIZE) return;
    }
    const payload = packet.subarray(offset);
    if (payload.length === 0) return;

    if (pid === 0) {
      if (!payloadUnitStart) return;
      const pointer = payload[0];
      const section = this.patAssembler.push(payload.subarray(1 + pointer));
      if (section) this.parsePat(section);
      return;
    }

    if (this.pmtPids.has(pid)) {
      if (!payloadUnitStart) return;
      const pointer = payload[0];
      const section = this.pmtAssembler.push(payload.subarray(1 + pointer));
      if (section) this.parsePmt(section);
      return;
    }

    if (pid !== this.videoPid && pid !== this.audioPid) return;

    if (payloadUnitStart) {
      const previous = this.pending.get(pid);
      if (previous) this.emitPes(pid, previous, out);
      const pes = this.parsePes(payload);
      if (pes) this.pending.set(pid, pes);
      else this.pending.delete(pid);
      return;
    }

    const current = this.pending.get(pid);
    if (current) current.parts.push(Buffer.from(payload));
  }

  private parsePat(section: Buffer): void {
    if (this.patComplete || section.length < 12 || section[0] !== 0x00) return;
    const sectionLength = ((section[1] & 0x0f) << 8) | section[2];
    const end = Math.min(section.length, 3 + sectionLength - 4);
    for (let i = 8; i + 4 <= end; i += 4) {
      const programNumber = (section[i] << 8) | section[i + 1];
      const pmtPid = ((section[i + 2] & 0x1f) << 8) | section[i + 3];
      if (programNumber !== 0) this.pmtPids.add(pmtPid);
    }
    if (this.pmtPids.size > 0) this.patComplete = true;
  }

  private parsePmt(section: Buffer): void {
    if (this.videoPid !== null || this.audioPid !== null) return;
    if (section.length < 16 || section[0] !== 0x02) return;
    const sectionLength = ((section[1] & 0x0f) << 8) | section[2];
    const end = Math.min(section.length, 3 + sectionLength - 4);
    const programInfoLength = ((section[10] & 0x0f) << 8) | section[11];
    let offset = 12 + programInfoLength;
    while (offset + 5 <= end) {
      const streamType = section[offset];
      const elementaryPid =
        ((section[offset + 1] & 0x1f) << 8) | section[offset + 2];
      const esInfoLength = ((section[offset + 3] & 0x0f) << 8) | section[offset + 4];
      if (streamType === 0x1b && this.videoPid === null) {
        this.videoPid = elementaryPid;
        this.videoStreamType = streamType;
      } else if (streamType === 0x0f && this.audioPid === null) {
        this.audioPid = elementaryPid;
        this.audioStreamType = streamType;
      } else if (streamType === 0x11) {
        this.droppedStreams.add('aac-latm');
      } else if (
        streamType === 0x24 ||
        streamType === 0x82 ||
        streamType === 0x03 ||
        streamType === 0x04
      ) {
        this.droppedStreams.add(`stream-0x${streamType.toString(16)}`);
      }
      offset += 5 + esInfoLength;
    }
  }

  private parsePes(payload: Buffer): PendingPes | null {
    if (payload.length < 9) return null;
    if (payload[0] !== 0x00 || payload[1] !== 0x00 || payload[2] !== 0x01) {
      return null;
    }
    const streamId = payload[3];
    // Ignore non-elementary streams (padding, program stream map, ...).
    if (streamId < 0xbc || streamId > 0xf2) return null;
    if (streamId === 0xbe || streamId === 0xbf || streamId === 0xbc) return null;

    const flags = payload[7];
    const headerLength = payload[8];
    const dataStart = 9 + headerLength;
    if (dataStart > payload.length) return null;

    let pts: number | null = null;
    let dts: number | null = null;
    if ((flags & 0x80) !== 0 && 9 + 5 <= payload.length) {
      pts = readTimestamp(payload, 9);
    }
    if ((flags & 0x40) !== 0 && 14 + 5 <= payload.length) {
      dts = readTimestamp(payload, 14);
    }
    return {
      parts:
        dataStart < payload.length
          ? [Buffer.from(payload.subarray(dataStart))]
          : [],
      pts,
      dts,
    };
  }

  private emitPes(pid: number, pending: PendingPes, out: DemuxEmission[]): void {
    if (pending.parts.length === 0) return;
    const data =
      pending.parts.length === 1 ? pending.parts[0] : Buffer.concat(pending.parts);
    if (data.length === 0) return;
    const chunk: PesChunk = { data, pts: pending.pts, dts: pending.dts };
    if (pid === this.videoPid) out.push({ track: 'video', chunk });
    else if (pid === this.audioPid) out.push({ track: 'audio', chunk });
  }
}

export interface DemuxHandlers {
  video: (chunk: PesChunk) => Promise<void> | void;
  audio: (chunk: PesChunk) => Promise<void> | void;
}

/** Demuxes a transport stream file, awaiting the handler for every emission. */
export async function demuxTransportStream(
  filePath: string,
  handlers: DemuxHandlers,
): Promise<DemuxSummary> {
  const demuxer = new TsDemuxer();
  const emissions: DemuxEmission[] = [];
  const drain = async (): Promise<void> => {
    for (const emission of emissions) {
      if (emission.track === 'video') await handlers.video(emission.chunk);
      else await handlers.audio(emission.chunk);
    }
    emissions.length = 0;
  };

  const stream = fs.createReadStream(filePath, {
    highWaterMark: PACKET_SIZE * 256,
  });
  try {
    for await (const chunk of stream) {
      demuxer.push(chunk as Buffer, emissions);
      await drain();
    }
  } finally {
    stream.destroy();
  }
  demuxer.flush(emissions);
  await drain();
  return demuxer.summary();
}
