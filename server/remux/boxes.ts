/**
 * Minimal MP4 box writer.
 *
 * Every helper returns a Buffer that is already a complete box, so callers can
 * compose nested boxes by concatenating children. This keeps the muxer free of
 * any third-party dependency.
 */

export function u8(value: number): Buffer {
  const buffer = Buffer.alloc(1);
  buffer.writeUInt8(value & 0xff, 0);
  return buffer;
}

export function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value & 0xffff, 0);
  return buffer;
}

export function i16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeInt16BE(value, 0);
  return buffer;
}

export function u24(value: number): Buffer {
  const buffer = Buffer.alloc(3);
  buffer.writeUIntBE(value & 0xffffff, 0, 3);
  return buffer;
}

export function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

export function fourcc(type: string): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.write(type, 0, 'latin1');
  return buffer;
}

/** A plain container box: `size + type + children`. */
export function box(type: string, ...children: Buffer[]): Buffer {
  const payload = Buffer.concat(children);
  return Buffer.concat([u32(payload.length + 8), fourcc(type), payload]);
}

/** A full box: `size + type + version/flags + children`. */
export function fullBox(
  type: string,
  version: number,
  flags: number,
  ...children: Buffer[]
): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt8(version & 0xff, 0);
  header.writeUIntBE(flags & 0xffffff, 1, 3);
  return box(type, header, ...children);
}

const IDENTITY_MATRIX = [
  0x00010000, 0, 0,
  0, 0x00010000, 0,
  0, 0, 0x40000000,
];

export function matrix(): Buffer {
  return Buffer.concat(IDENTITY_MATRIX.map((value) => u32(value)));
}

/**
 * Media length expressed as 32-bit fixed point (16.16), the format used by
 * `tkhd` for track width/height.
 */
export function fixed1616(value: number): Buffer {
  return u32(Math.max(0, Math.min(0xffffffff, Math.round(value * 65536))));
}

/**
 * ES descriptor length uses the "expandable" encoding. Always writing the
 * four-byte form keeps the writer simple and is accepted by every demuxer.
 */
export function descriptorLength(length: number): Buffer {
  return Buffer.from([
    0x80 | ((length >> 21) & 0x7f),
    0x80 | ((length >> 14) & 0x7f),
    0x80 | ((length >> 7) & 0x7f),
    length & 0x7f,
  ]);
}

/** Descriptor wrapper: tag + expandable length + payload. */
export function descriptor(tag: number, payload: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([tag & 0xff]),
    descriptorLength(payload.length),
    payload,
  ]);
}

/** Track duration in the movie timescale for `tkhd`/`elst`. */
export function toMovieTimescale(durationInMediaTimescale: number, mediaTimescale: number): number {
  if (!Number.isFinite(durationInMediaTimescale) || mediaTimescale <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((durationInMediaTimescale / mediaTimescale) * 1000));
}
