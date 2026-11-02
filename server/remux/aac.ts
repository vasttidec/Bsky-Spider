/**
 * AAC (ADTS) helpers.
 *
 * Bluesky's HLS transcodes carry AAC-LC audio in ADTS frames inside the
 * transport stream. MP4 wants raw AAC access units plus an AudioSpecificConfig,
 * so this module converts one into the other.
 */

export const AAC_SAMPLE_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025,
  8000, 7350,
];

export interface AdtsFrame {
  /** Raw AAC access unit without the ADTS header. */
  data: Buffer;
  /** Number of PCM samples carried by this frame (1024 per raw data block). */
  samples: number;
}

export interface AdtsStream {
  frames: AdtsFrame[];
  sampleRate: number;
  channels: number;
  /** MPEG-4 Audio Object Type (2 = AAC-LC). */
  objectType: number;
  /** AudioSpecificConfig bytes for `esds`. */
  config: Buffer;
}

function buildAudioSpecificConfig(
  objectType: number,
  sampleRateIndex: number,
  channels: number,
): Buffer {
  const config = Buffer.alloc(2);
  config[0] = ((objectType & 0x1f) << 3) | ((sampleRateIndex >> 1) & 0x07);
  config[1] =
    ((sampleRateIndex & 0x01) << 7) |
    ((channels & 0x0f) << 3) |
    0x00; // frameLengthFlag / dependsOnCoreCoder / extensionFlag
  return config;
}

/**
 * Splits an ADTS byte stream into raw AAC frames. Returns an empty list for
 * non-ADTS data so callers can surface a clear error.
 */
export function splitAdts(data: Buffer): AdtsStream | null {
  const frames: AdtsFrame[] = [];
  let offset = 0;
  let sampleRate = 0;
  let channels = 0;
  let objectType = 0;
  let sampleRateIndex = -1;

  while (offset + 7 <= data.length) {
    if (data[offset] !== 0xff || (data[offset + 1] & 0xf0) !== 0xf0) {
      // Resynchronise: audio PES payloads start exactly on a frame boundary in
      // practice, but a corrupt packet should not abort the whole download.
      const next = data.indexOf(Buffer.from([0xff, 0xf1]), offset + 1);
      const nextAlt = data.indexOf(Buffer.from([0xff, 0xf9]), offset + 1);
      const candidate = [next, nextAlt].filter((value) => value >= 0);
      if (candidate.length === 0) break;
      offset = Math.min(...candidate);
      continue;
    }

    const protectionAbsent = data[offset + 1] & 0x01;
    const frameObjectType = ((data[offset + 2] >> 6) & 0x03) + 1;
    const frequencyIndex = (data[offset + 2] >> 2) & 0x0f;
    const channelConfig =
      ((data[offset + 2] & 0x01) << 2) | ((data[offset + 3] >> 6) & 0x03);
    const frameLength =
      ((data[offset + 3] & 0x03) << 11) |
      (data[offset + 4] << 3) |
      ((data[offset + 5] >> 5) & 0x07);
    const rawDataBlocks = (data[offset + 6] & 0x03) + 1;
    const headerLength = protectionAbsent ? 7 : 9;

    if (frameLength <= headerLength || offset + frameLength > data.length) {
      break;
    }

    if (sampleRateIndex < 0) {
      sampleRateIndex = frequencyIndex;
      sampleRate = AAC_SAMPLE_RATES[frequencyIndex] || 0;
      channels = channelConfig || 2;
      objectType = frameObjectType;
    }

    frames.push({
      data: data.subarray(offset + headerLength, offset + frameLength),
      samples: 1024 * rawDataBlocks,
    });
    offset += frameLength;
  }

  if (frames.length === 0 || !sampleRate) return null;
  return {
    frames,
    sampleRate,
    channels,
    objectType,
    config: buildAudioSpecificConfig(
      objectType,
      Math.max(0, sampleRateIndex),
      channels,
    ),
  };
}
