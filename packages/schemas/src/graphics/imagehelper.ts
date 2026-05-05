// ref: https://github.com/image-size/image-size ----------------------------
// The following code is adapted from the image-size code. Unnecessary formats and dependencies on Node have been removed.
import { Buffer } from 'buffer';

type IImage = {
  validate: (input: Uint8Array) => boolean;
  calculate: (input: Uint8Array) => { width: number; height: number } | undefined;
};

const decoder = new TextDecoder();
const toUTF8String = (input: Uint8Array, start = 0, end = input.length) =>
  decoder.decode(input.slice(start, end));

const toHexString = (input: Uint8Array, start = 0, end = input.length) =>
  input.slice(start, end).reduce((memo, i) => memo + ('0' + i.toString(16)).slice(-2), '');

const readUInt16BE = (input: Uint8Array, offset = 0) => input[offset] * 2 ** 8 + input[offset + 1];

const readUInt32BE = (input: Uint8Array, offset = 0) =>
  input[offset] * 2 ** 24 +
  input[offset + 1] * 2 ** 16 +
  input[offset + 2] * 2 ** 8 +
  input[offset + 3];

const extractSize = (input: Uint8Array, index: number) => {
  return {
    height: readUInt16BE(input, index),
    width: readUInt16BE(input, index + 2),
  };
};

const validateInput = (input: Uint8Array, index: number): void => {
  // index should be within buffer limits
  if (index > input.length) {
    throw new TypeError('Corrupt JPG, exceeded buffer limits');
  }
  // Every JPEG block must begin with a 0xFF
  if (input[index] !== 0xff) {
    throw new TypeError('Invalid JPG, marker table corrupted');
  }
};

const JPG: IImage = {
  validate: (input) => toHexString(input, 0, 2) === 'ffd8',

  calculate(input) {
    // Skip 4 chars, they are for signature
    input = input.slice(4);

    let next: number;
    while (input.length) {
      // read length of the next block
      const i = readUInt16BE(input, 0);

      // ensure correct format
      validateInput(input, i);

      // 0xFFC0 is baseline standard(SOF)
      // 0xFFC1 is baseline optimized(SOF)
      // 0xFFC2 is progressive(SOF2)
      next = input[i + 1];
      if (next === 0xc0 || next === 0xc1 || next === 0xc2) {
        const size = extractSize(input, i + 5);

        return size;
      }

      // move to the next block
      input = input.slice(i + 2);
    }

    throw new TypeError('Invalid JPG, no size found');
  },
};

const pngSignature = 'PNG\r\n\x1a\n';
const pngImageHeaderChunkName = 'IHDR';

// Used to detect "fried" png's: http://www.jongware.com/pngdefry.html
const pngFriedChunkName = 'CgBI';

const PNG: IImage = {
  validate(input) {
    if (pngSignature === toUTF8String(input, 1, 8)) {
      let chunkName = toUTF8String(input, 12, 16);
      if (chunkName === pngFriedChunkName) {
        chunkName = toUTF8String(input, 28, 32);
      }
      if (chunkName !== pngImageHeaderChunkName) {
        throw new TypeError('Invalid PNG');
      }
      return true;
    }
    return false;
  },

  calculate(input) {
    if (toUTF8String(input, 12, 16) === pngFriedChunkName) {
      return {
        height: readUInt32BE(input, 36),
        width: readUInt32BE(input, 32),
      };
    }
    return {
      height: readUInt32BE(input, 20),
      width: readUInt32BE(input, 16),
    };
  },
};

const typeHandlers = {
  jpg: JPG,
  png: PNG,
};

type imageType = keyof typeof typeHandlers;

function detector(input: Uint8Array): imageType | undefined {
  const firstBytes: { [byte: number]: imageType } = {
    0x89: 'png',
    0xff: 'jpg',
  };
  const byte = input[0];
  if (byte in firstBytes) {
    const type = firstBytes[byte];
    if (type && typeHandlers[type].validate(input)) {
      return type;
    }
  }

  const keys = Object.keys(typeHandlers) as imageType[];
  return keys.find((key: imageType) => typeHandlers[key].validate(input));
}

export const getImageDimension = (value: string): { height: number; width: number } => {
  const dataUriPrefix = ';base64,';
  const idx = value.indexOf(dataUriPrefix);
  const imgBase64 = value.substring(idx + dataUriPrefix.length, value.length);
  return imageSize(Buffer.from(imgBase64, 'base64'));
};

const imageSize = (imgBuffer: Buffer): { height: number; width: number } => {
  const type = detector(imgBuffer);

  if (typeof type !== 'undefined' && type in typeHandlers) {
    const size = typeHandlers[type].calculate(imgBuffer);
    if (size !== undefined) {
      return size;
    }
  }

  throw new TypeError(
    '[@pdfweave/schemas/images] Unsupported file type: ' +
      (type === undefined ? 'undefined' : type),
  );
};
// ----------------------------

/**
 * Read the EXIF Orientation tag (TIFF tag 0x0112) from a JPEG buffer.
 *
 * Smartphone photos commonly carry the image bytes in the sensor's native
 * orientation and use this tag to communicate how the viewer should rotate
 * the pixels. pdf-lib's drawImage doesn't honour the tag itself, so an
 * iPhone portrait selfie comes out rotated 90° in the generated PDF
 * unless we transform on draw (regression: pdfme/pdfme#1183).
 *
 * Returns 1 (no transform) for:
 *   - non-JPEG inputs (PNG, etc. — no EXIF)
 *   - JPEGs with no APP1 / no Exif segment
 *   - parse errors / truncated buffers
 *   - Orientation values outside 1..8
 *
 * Otherwise returns the raw EXIF Orientation value (1..8). The interpretation:
 *   1 = identity
 *   2 = mirror horizontal
 *   3 = rotate 180°
 *   4 = mirror vertical
 *   5 = mirror horizontal + rotate 270° CW
 *   6 = rotate 90° CW
 *   7 = mirror horizontal + rotate 90° CW
 *   8 = rotate 270° CW (= 90° CCW)
 *
 * Inline minimal parser — kept under ~80 LOC to avoid pulling a dependency
 * for what is fundamentally a 2-byte read at a known offset.
 */
export const getJpegExifOrientation = (imgBuffer: Uint8Array): number => {
  // Only JPEGs carry EXIF in the way we parse below.
  if (!(imgBuffer[0] === 0xff && imgBuffer[1] === 0xd8)) return 1;

  // Walk JPEG segments looking for APP1 (0xFFE1) carrying an "Exif\0\0" header.
  let offset = 2;
  const length = imgBuffer.length;
  while (offset < length - 1) {
    if (imgBuffer[offset] !== 0xff) return 1; // malformed marker
    const marker = imgBuffer[offset + 1];
    // SOS (0xFFDA) marks the start of compressed data — EXIF can't appear
    // after this point, so abort.
    if (marker === 0xda) return 1;
    // Standalone markers (no length): SOI/EOI/RST*. Only the SOI is at the
    // very start which we already skipped, so any standalone here is
    // unexpected — bail.
    const segLen = (imgBuffer[offset + 2] << 8) | imgBuffer[offset + 3];
    if (segLen < 2 || offset + 2 + segLen > length) return 1;
    if (marker === 0xe1) {
      const dataStart = offset + 4;
      // "Exif\0\0" header is 6 bytes.
      if (
        imgBuffer[dataStart] === 0x45 && // E
        imgBuffer[dataStart + 1] === 0x78 && // x
        imgBuffer[dataStart + 2] === 0x69 && // i
        imgBuffer[dataStart + 3] === 0x66 // f
      ) {
        const tiffStart = dataStart + 6;
        // TIFF byte-order mark: 'II' = little-endian, 'MM' = big-endian.
        const little = imgBuffer[tiffStart] === 0x49 && imgBuffer[tiffStart + 1] === 0x49;
        const big = imgBuffer[tiffStart] === 0x4d && imgBuffer[tiffStart + 1] === 0x4d;
        if (!little && !big) return 1;
        const u16 = (off: number) =>
          little
            ? imgBuffer[off] | (imgBuffer[off + 1] << 8)
            : (imgBuffer[off] << 8) | imgBuffer[off + 1];
        const u32 = (off: number) =>
          little
            ? imgBuffer[off] |
              (imgBuffer[off + 1] << 8) |
              (imgBuffer[off + 2] << 16) |
              (imgBuffer[off + 3] << 24)
            : (imgBuffer[off] << 24) |
              (imgBuffer[off + 1] << 16) |
              (imgBuffer[off + 2] << 8) |
              imgBuffer[off + 3];
        // 0x002A magic at tiffStart+2; first IFD offset at tiffStart+4.
        if (u16(tiffStart + 2) !== 0x002a) return 1;
        const ifd0Offset = tiffStart + u32(tiffStart + 4);
        if (ifd0Offset + 2 > length) return 1;
        const numEntries = u16(ifd0Offset);
        for (let i = 0; i < numEntries; i++) {
          const entryOffset = ifd0Offset + 2 + i * 12;
          if (entryOffset + 12 > length) return 1;
          const tag = u16(entryOffset);
          if (tag === 0x0112) {
            // Orientation: SHORT (type 3), count 1 — value is in the first
            // 2 bytes of the value/offset slot regardless of endianness.
            const value = u16(entryOffset + 8);
            return value >= 1 && value <= 8 ? value : 1;
          }
        }
        return 1;
      }
    }
    offset += 2 + segLen;
  }
  return 1;
};

export const getJpegExifOrientationFromDataUri = (value: string): number => {
  if (typeof value !== 'string' || !value.startsWith('data:image/jp')) return 1;
  const idx = value.indexOf(';base64,');
  if (idx < 0) return 1;
  try {
    const buf = Buffer.from(value.substring(idx + ';base64,'.length), 'base64');
    return getJpegExifOrientation(buf);
  } catch {
    return 1;
  }
};
