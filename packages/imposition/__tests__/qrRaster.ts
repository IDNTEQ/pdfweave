import jsQR from 'jsqr';
import type { PNG } from 'pngjs';

export const decodeQrRaster = (image: PNG): string => {
  const pixels = new Uint8ClampedArray(
    image.data.buffer,
    image.data.byteOffset,
    image.data.byteLength,
  );
  const decoded = jsQR(pixels, image.width, image.height, {
    inversionAttempts: 'attemptBoth',
  });
  if (!decoded) throw new Error('QR code could not be decoded from the raster acquisition region');
  return decoded.data;
};
