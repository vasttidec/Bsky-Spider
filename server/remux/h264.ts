/**
 * H.264 helpers: Annex B splitting, SPS parsing (for dimensions) and avcC
 * (decoder configuration) construction. Only the pieces required to remux an
 * HLS stream into MP4 are implemented.
 */

export interface NalUnit {
  /** NAL unit type as defined by H.264 (1 = slice, 5 = IDR, 7 = SPS, ...). */
  type: number;
  /** NAL bytes including the one-byte NAL header. */
  data: Buffer;
}

/** Splits an Annex B byte stream into NAL units. */
export function splitAnnexB(data: Buffer): NalUnit[] {
  const units: NalUnit[] = [];
  let start = -1;
  let i = 0;
  while (i + 2 < data.length) {
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
      if (start >= 0) {
        const end = trimTrailingZeros(data, start, i);
        if (end > start) {
          units.push({
            type: data[start] & 0x1f,
            data: data.subarray(start, end),
          });
        }
      }
      i += 3;
      start = i;
      continue;
    }
    i += 1;
  }
  if (start >= 0 && start < data.length) {
    const end = trimTrailingZeros(data, start, data.length);
    if (end > start) {
      units.push({ type: data[start] & 0x1f, data: data.subarray(start, end) });
    }
  }
  return units;
}

function trimTrailingZeros(data: Buffer, start: number, end: number): number {
  // Trailing zero bytes belong to the next start code, not to this NAL unit.
  let last = end;
  while (last > start && data[last - 1] === 0) last -= 1;
  return last;
}

export class BitReader {
  private offset = 0;

  constructor(private readonly data: Buffer) {}

  remaining(): number {
    return this.data.length * 8 - this.offset;
  }

  bit(): number {
    if (this.offset >= this.data.length * 8) {
      throw new Error('Unexpected end of bitstream');
    }
    const byte = this.data[this.offset >> 3];
    const bit = (byte >> (7 - (this.offset & 7))) & 1;
    this.offset += 1;
    return bit;
  }

  bits(count: number): number {
    let value = 0;
    for (let i = 0; i < count; i += 1) value = (value << 1) | this.bit();
    return value;
  }

  /** Unsigned Exp-Golomb code. */
  ue(): number {
    let zeros = 0;
    while (this.bit() === 0) {
      zeros += 1;
      if (zeros > 32) throw new Error('Invalid Exp-Golomb code');
    }
    if (zeros === 0) return 0;
    return (1 << zeros) - 1 + this.bits(zeros);
  }

  /** Signed Exp-Golomb code. */
  se(): number {
    const value = this.ue();
    const magnitude = Math.ceil(value / 2);
    return value % 2 === 1 ? magnitude : -magnitude;
  }

  skip(count: number): void {
    for (let i = 0; i < count; i += 1) this.bit();
  }
}

export interface SpsInfo {
  profileIdc: number;
  constraintFlags: number;
  levelIdc: number;
  width: number;
  height: number;
  sarWidth: number;
  sarHeight: number;
  /** Frames per second inferred from VUI timing info, when present. */
  fps?: number;
}

const SAR_TABLE: Record<number, [number, number]> = {
  1: [1, 1],
  2: [12, 11],
  3: [10, 11],
  4: [16, 11],
  5: [40, 33],
  6: [24, 11],
  7: [20, 11],
  8: [32, 11],
  9: [80, 33],
  10: [18, 11],
  11: [15, 11],
  12: [64, 33],
  13: [160, 99],
  14: [4, 3],
  15: [3, 2],
  16: [2, 1],
};

const HIGH_PROFILES = new Set([
  100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135,
]);

function skipScalingList(reader: BitReader, size: number): void {
  let last = 8;
  let next = 8;
  for (let i = 0; i < size; i += 1) {
    if (next !== 0) next = (last + reader.se() + 256) % 256;
    last = next === 0 ? last : next;
  }
}

/** Parses the subset of the SPS needed for MP4 track geometry. */
export function parseSps(nal: Buffer): SpsInfo {
  // Skip the NAL header byte.
  const reader = new BitReader(nal.subarray(1));
  reader.bits(8); // profile_idc
  const profileIdc = nal[1];
  reader.bits(8); // constraint flags
  const constraintFlags = nal[2];
  reader.bits(8); // level_idc
  const levelIdc = nal[3];
  reader.ue(); // seq_parameter_set_id

  let chromaFormatIdc = 1;
  if (HIGH_PROFILES.has(profileIdc)) {
    chromaFormatIdc = reader.ue();
    if (chromaFormatIdc === 3) reader.bit(); // separate_colour_plane_flag
    reader.ue(); // bit_depth_luma_minus8
    reader.ue(); // bit_depth_chroma_minus8
    reader.bit(); // qpprime_y_zero_transform_bypass_flag
    if (reader.bit()) {
      // seq_scaling_matrix_present_flag
      const count = chromaFormatIdc === 3 ? 12 : 8;
      for (let i = 0; i < count; i += 1) {
        if (reader.bit()) skipScalingList(reader, i < 6 ? 16 : 64);
      }
    }
  }

  reader.ue(); // log2_max_frame_num_minus4
  const picOrderCntType = reader.ue();
  if (picOrderCntType === 0) {
    reader.ue(); // log2_max_pic_order_cnt_lsb_minus4
  } else if (picOrderCntType === 1) {
    reader.bit(); // delta_pic_order_always_zero_flag
    reader.se(); // offset_for_non_ref_pic
    reader.se(); // offset_for_top_to_bottom_field
    const cycle = reader.ue();
    for (let i = 0; i < cycle; i += 1) reader.se();
  }

  reader.ue(); // max_num_ref_frames
  reader.bit(); // gaps_in_frame_num_value_allowed_flag
  const widthMbs = reader.ue() + 1;
  const heightMapUnits = reader.ue() + 1;
  const frameMbsOnly = reader.bit();
  if (!frameMbsOnly) reader.bit(); // mb_adaptive_frame_field_flag
  reader.bit(); // direct_8x8_inference_flag
  let cropLeft = 0;
  let cropRight = 0;
  let cropTop = 0;
  let cropBottom = 0;
  if (reader.bit()) {
    cropLeft = reader.ue();
    cropRight = reader.ue();
    cropTop = reader.ue();
    cropBottom = reader.ue();
  }

  let sarWidth = 1;
  let sarHeight = 1;
  let fps: number | undefined;
  if (reader.remaining() > 0 && reader.bit()) {
    // vui_parameters_present_flag
    if (reader.bit()) {
      // aspect_ratio_info_present_flag
      const aspectRatioIdc = reader.bits(8);
      if (aspectRatioIdc === 255) {
        sarWidth = reader.bits(16) || 1;
        sarHeight = reader.bits(16) || 1;
      } else if (SAR_TABLE[aspectRatioIdc]) {
        [sarWidth, sarHeight] = SAR_TABLE[aspectRatioIdc];
      }
    }
    if (reader.bit()) {
      // overscan_info_present_flag
      reader.bit();
    }
    if (reader.bit()) {
      // video_signal_type_present_flag
      reader.bits(3); // video_format
      reader.bit(); // video_full_range_flag
      if (reader.bit()) {
        // colour_description_present_flag
        reader.bits(8);
        reader.bits(8);
        reader.bits(8);
      }
    }
    if (reader.bit()) {
      // chroma_loc_info_present_flag
      reader.ue();
      reader.ue();
    }
    if (reader.bit()) {
      // timing_info_present_flag
      const numUnitsInTick = reader.bits(32);
      const timeScale = reader.bits(32);
      if (numUnitsInTick > 0 && timeScale > 0) {
        fps = timeScale / (2 * numUnitsInTick);
      }
    }
  }

  const subWidthC = chromaFormatIdc === 3 ? 1 : 2;
  const subHeightC = chromaFormatIdc === 1 ? 2 : 1;
  const cropUnitX = chromaFormatIdc === 0 ? 1 : subWidthC;
  const cropUnitY = (chromaFormatIdc === 0 ? 1 : subHeightC) * (2 - frameMbsOnly);
  const width = widthMbs * 16 - cropLeft * cropUnitX - cropRight * cropUnitX;
  const height =
    (2 - frameMbsOnly) * heightMapUnits * 16 -
    cropTop * cropUnitY -
    cropBottom * cropUnitY;

  return {
    profileIdc,
    constraintFlags,
    levelIdc,
    width: Math.max(2, width),
    height: Math.max(2, height),
    sarWidth,
    sarHeight,
    fps,
  };
}

/** Builds an `avcC` decoder configuration record. */
export function buildAvcC(sps: Buffer, pps: Buffer): Buffer {
  if (sps.length < 4 || pps.length < 2) {
    throw new Error('H.264 参数集不完整');
  }
  const header = Buffer.from([
    0x01, // configurationVersion
    sps[1], // AVCProfileIndication
    sps[2], // profile_compatibility
    sps[3], // AVCLevelIndication
    0xff, // reserved(6) + lengthSizeMinusOne(2) => 4-byte NAL lengths
    0xe1, // reserved(3) + numOfSequenceParameterSets(5) => 1
  ]);
  const spsLength = Buffer.alloc(2);
  spsLength.writeUInt16BE(sps.length, 0);
  const ppsCount = Buffer.from([0x01]);
  const ppsLength = Buffer.alloc(2);
  ppsLength.writeUInt16BE(pps.length, 0);
  return Buffer.concat([
    header,
    spsLength,
    sps,
    ppsCount,
    ppsLength,
    pps,
  ]);
}

/**
 * Converts one access unit (Annex B) into an MP4 sample: every retained NAL
 * unit is prefixed with its 4-byte length. Parameter sets and access unit
 * delimiters are dropped because they are carried by `avcC`.
 */
export function toAvcSample(nals: NalUnit[]): Buffer | null {
  const parts: Buffer[] = [];
  let hasFrame = false;
  for (const nal of nals) {
    if (nal.type === 7 || nal.type === 8 || nal.type === 9) continue;
    if (nal.type === 1 || nal.type === 5) hasFrame = true;
    const length = Buffer.alloc(4);
    length.writeUInt32BE(nal.data.length, 0);
    parts.push(length, nal.data);
  }
  if (!hasFrame || parts.length === 0) return null;
  return Buffer.concat(parts);
}
