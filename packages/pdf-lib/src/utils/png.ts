import UPNGModule from '@pdf-lib/upng';

type DecodedPng = {
  ctype: number;
  width: number;
  height: number;
};

type UPNGApi = {
  decode: (input: ArrayBuffer) => DecodedPng;
  toRGBA8: (decoded: DecodedPng) => ArrayBuffer[];
};

const isUPNGApi = (value: unknown): value is UPNGApi =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as UPNGApi).decode === 'function' &&
  typeof (value as UPNGApi).toRGBA8 === 'function';

const resolveUPNG = (value: unknown): UPNGApi => {
  let current: unknown = value;

  while (current && typeof current === 'object') {
    if (isUPNGApi(current)) return current;
    current = (current as { default?: unknown }).default;
  }

  throw new TypeError('Failed to resolve @pdf-lib/upng exports');
};

const UPNG = resolveUPNG(UPNGModule);

const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const PNG_CHUNK_HEADER_LENGTH = 8;
const PNG_CHUNK_CRC_LENGTH = 4;
const PNG_MAX_CHUNK_COUNT = 10_000;

const hasChunkType = (pngData: Uint8Array, offset: number, type: string) =>
  pngData[offset + 4] === type.charCodeAt(0) &&
  pngData[offset + 5] === type.charCodeAt(1) &&
  pngData[offset + 6] === type.charCodeAt(2) &&
  pngData[offset + 7] === type.charCodeAt(3);

const readChunkLength = (pngData: Uint8Array, offset: number) =>
  pngData[offset] * 0x1000000 +
  pngData[offset + 1] * 0x10000 +
  pngData[offset + 2] * 0x100 +
  pngData[offset + 3];

/**
 * Rejects animated or structurally malformed PNG data before raster decoding.
 *
 * This validates chunk boundaries, not chunk CRC values or the complete PNG
 * semantic model. The decoder remains responsible for those details.
 */
export const assertStaticPng = (pngData: Uint8Array): void => {
  if (
    pngData.length < PNG_SIGNATURE.length ||
    PNG_SIGNATURE.some((value, index) => pngData[index] !== value)
  ) {
    throw new Error('Invalid PNG: missing or invalid signature');
  }

  let offset = PNG_SIGNATURE.length;
  let chunkCount = 0;
  let hasHeader = false;

  while (offset < pngData.length) {
    chunkCount += 1;
    if (chunkCount > PNG_MAX_CHUNK_COUNT) {
      throw new Error(`Invalid PNG: exceeds the ${PNG_MAX_CHUNK_COUNT} chunk safety limit`);
    }
    if (pngData.length - offset < PNG_CHUNK_HEADER_LENGTH + PNG_CHUNK_CRC_LENGTH) {
      throw new Error('Invalid PNG: truncated chunk header');
    }

    const chunkLength = readChunkLength(pngData, offset);
    if (chunkLength > pngData.length - offset - PNG_CHUNK_HEADER_LENGTH - PNG_CHUNK_CRC_LENGTH) {
      throw new Error('Invalid PNG: truncated chunk data');
    }

    const nextOffset = offset + PNG_CHUNK_HEADER_LENGTH + chunkLength + PNG_CHUNK_CRC_LENGTH;
    if (hasChunkType(pngData, offset, 'acTL')) {
      throw new Error('Animated PNGs are not supported');
    }

    const isHeader = hasChunkType(pngData, offset, 'IHDR');
    if (chunkCount === 1 && (!isHeader || chunkLength !== 13)) {
      throw new Error('Invalid PNG: first chunk must be a 13-byte IHDR');
    }
    if (isHeader) {
      if (hasHeader) {
        throw new Error('Invalid PNG: duplicate IHDR chunk');
      }
      hasHeader = true;
    }

    if (hasChunkType(pngData, offset, 'IEND')) {
      if (chunkLength !== 0) {
        throw new Error('Invalid PNG: IEND chunk must be empty');
      }
      if (nextOffset !== pngData.length) {
        throw new Error('Invalid PNG: trailing data after IEND chunk');
      }
      return;
    }

    offset = nextOffset;
  }

  throw new Error('Invalid PNG: missing IEND chunk');
};

const getImageType = (ctype: number) => {
  if (ctype === 0) return PngType.Greyscale;
  if (ctype === 2) return PngType.Truecolour;
  if (ctype === 3) return PngType.IndexedColour;
  if (ctype === 4) return PngType.GreyscaleWithAlpha;
  if (ctype === 6) return PngType.TruecolourWithAlpha;
  throw new Error(`Unknown color type: ${ctype}`);
};

const splitAlphaChannel = (rgbaChannel: Uint8Array) => {
  const pixelCount = Math.floor(rgbaChannel.length / 4);

  const rgbChannel = new Uint8Array(pixelCount * 3);
  const alphaChannel = new Uint8Array(pixelCount * 1);

  let rgbaOffset = 0;
  let rgbOffset = 0;
  let alphaOffset = 0;

  while (rgbaOffset < rgbaChannel.length) {
    rgbChannel[rgbOffset++] = rgbaChannel[rgbaOffset++];
    rgbChannel[rgbOffset++] = rgbaChannel[rgbaOffset++];
    rgbChannel[rgbOffset++] = rgbaChannel[rgbaOffset++];
    alphaChannel[alphaOffset++] = rgbaChannel[rgbaOffset++];
  }

  return { rgbChannel, alphaChannel };
};

export enum PngType {
  Greyscale = 'Greyscale',
  Truecolour = 'Truecolour',
  IndexedColour = 'IndexedColour',
  GreyscaleWithAlpha = 'GreyscaleWithAlpha',
  TruecolourWithAlpha = 'TruecolourWithAlpha',
}

export class PNG {
  static load = (pngData: Uint8Array) => new PNG(pngData);

  readonly rgbChannel: Uint8Array;
  readonly alphaChannel?: Uint8Array;
  readonly type: PngType;
  readonly width: number;
  readonly height: number;
  readonly bitsPerComponent: number;

  private constructor(pngData: Uint8Array) {
    assertStaticPng(pngData);

    const exactPngData =
      pngData.byteOffset === 0 && pngData.byteLength === pngData.buffer.byteLength
        ? pngData.buffer
        : pngData.slice().buffer;
    const upng = UPNG.decode(exactPngData as ArrayBuffer);
    const frames = UPNG.toRGBA8(upng);

    if (frames.length > 1) throw new Error(`Animated PNGs are not supported`);

    const frame = new Uint8Array(frames[0]);
    const { rgbChannel, alphaChannel } = splitAlphaChannel(frame);

    this.rgbChannel = rgbChannel;

    const hasAlphaValues = alphaChannel.some((a) => a < 255);
    if (hasAlphaValues) this.alphaChannel = alphaChannel;

    this.type = getImageType(upng.ctype);

    this.width = upng.width;
    this.height = upng.height;
    this.bitsPerComponent = 8;
  }
}
