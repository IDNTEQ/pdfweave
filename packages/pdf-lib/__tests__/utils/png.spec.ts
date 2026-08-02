import { PNG } from '../../src/utils/png';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const pngChunk = (type: string, data: number[] = []): number[] => [
  0,
  0,
  0,
  data.length,
  ...Array.from(type, (character) => character.charCodeAt(0)),
  ...data,
  0,
  0,
  0,
  0,
];

const structuralPng = (...chunks: number[][]): Uint8Array =>
  new Uint8Array([
    ...PNG_SIGNATURE,
    ...pngChunk(
      'IHDR',
      Array.from({ length: 13 }, () => 0),
    ),
    ...chunks.flat(),
    ...pngChunk('IEND'),
  ]);

// prettier-ignore
const singlePixelPng = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
  0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84,
  24, 87, 99, 248, 95, 17, 208, 0, 0, 6, 137, 2, 72, 25, 58, 220, 62, 0, 0,
  0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

describe(`PNG`, () => {
  afterEach(() => {
    vi.doUnmock('@pdf-lib/upng');
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@pdf-lib/upng');
    vi.resetModules();
  });

  it(`can load images with alpha values greater than 1`, () => {
    // This Uint8Array contains a PNG image composed of a single pixel. It was
    // generated with the following code in a browser:
    // ```
    // const ctx = c.getContext('2d');
    // ctx.fillStyle = 'rgba(255, 120, 80, 0.5)';
    // ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    // ```
    // The pixel has the following values: R=255, G=120, B=80, A=128
    //
    const pngImage = PNG.load(singlePixelPng);

    expect(pngImage.rgbChannel).toEqual(new Uint8Array([255, 120, 80]));
    expect(pngImage.alphaChannel).toEqual(new Uint8Array([128]));
  });

  it(`resolves nested default exports from @pdf-lib/upng`, async () => {
    vi.doMock('@pdf-lib/upng', () => ({
      default: {
        default: {
          decode: vi.fn(() => ({
            ctype: 6,
            width: 1,
            height: 1,
          })),
          toRGBA8: vi.fn(() => [new Uint8Array([255, 120, 80, 128]).buffer]),
        },
      },
    }));

    const { PNG: MockedPNG } = await import('../../src/utils/png');
    const pngImage = MockedPNG.load(singlePixelPng);

    expect(pngImage.rgbChannel).toEqual(new Uint8Array([255, 120, 80]));
    expect(pngImage.alphaChannel).toEqual(new Uint8Array([128]));
  });

  it(`rejects APNG control chunks before invoking the decoder`, async () => {
    const decode = vi.fn();
    const toRGBA8 = vi.fn();
    vi.resetModules();
    vi.doMock('@pdf-lib/upng', () => ({ default: { decode, toRGBA8 } }));

    const { PNG: MockedPNG } = await import('../../src/utils/png');
    const animatedPng = structuralPng(pngChunk('acTL', [0, 0, 0, 1, 0, 0, 0, 0]));

    expect(() => MockedPNG.load(animatedPng)).toThrow('Animated PNGs are not supported');
    expect(decode).not.toHaveBeenCalled();
    expect(toRGBA8).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a truncated chunk header',
      new Uint8Array([...PNG_SIGNATURE, 0, 0, 0]),
      'Invalid PNG: truncated chunk header',
    ],
    [
      'truncated chunk data',
      new Uint8Array([
        ...PNG_SIGNATURE,
        0,
        0,
        0,
        13,
        ...Array.from('IHDR', (character) => character.charCodeAt(0)),
        0,
        0,
        0,
        0,
        0,
        0,
      ]),
      'Invalid PNG: truncated chunk data',
    ],
    [
      'trailing data after IEND',
      new Uint8Array([...structuralPng(), 0]),
      'Invalid PNG: trailing data after IEND chunk',
    ],
    [
      'a missing IEND chunk',
      new Uint8Array([
        ...PNG_SIGNATURE,
        ...pngChunk(
          'IHDR',
          Array.from({ length: 13 }, () => 0),
        ),
      ]),
      'Invalid PNG: missing IEND chunk',
    ],
  ])(`rejects %s before invoking the decoder`, async (_caseName, invalidPng, expectedMessage) => {
    const decode = vi.fn();
    const toRGBA8 = vi.fn();
    vi.resetModules();
    vi.doMock('@pdf-lib/upng', () => ({ default: { decode, toRGBA8 } }));

    const { PNG: MockedPNG } = await import('../../src/utils/png');

    expect(() => MockedPNG.load(invalidPng)).toThrow(expectedMessage);
    expect(decode).not.toHaveBeenCalled();
    expect(toRGBA8).not.toHaveBeenCalled();
  });

  it(`bounds the number of chunks inspected before invoking the decoder`, async () => {
    const decode = vi.fn();
    const toRGBA8 = vi.fn();
    vi.resetModules();
    vi.doMock('@pdf-lib/upng', () => ({ default: { decode, toRGBA8 } }));

    const { PNG: MockedPNG } = await import('../../src/utils/png');
    const excessiveChunks = Array.from({ length: 10_000 }, () => pngChunk('tEXt'));

    expect(() => MockedPNG.load(structuralPng(...excessiveChunks))).toThrow(
      'Invalid PNG: exceeds the 10000 chunk safety limit',
    );
    expect(decode).not.toHaveBeenCalled();
    expect(toRGBA8).not.toHaveBeenCalled();
  });

  it(`decodes only the bytes in a non-zero-offset Uint8Array view`, async () => {
    const decode = vi.fn(() => ({
      ctype: 6,
      width: 1,
      height: 1,
    }));
    const toRGBA8 = vi.fn(() => [new Uint8Array([255, 120, 80, 128]).buffer]);
    vi.resetModules();
    vi.doMock('@pdf-lib/upng', () => ({ default: { decode, toRGBA8 } }));

    const { PNG: MockedPNG } = await import('../../src/utils/png');
    const staticPng = structuralPng(pngChunk('IDAT'));
    const surroundingBytes = new Uint8Array(staticPng.length + 4);
    surroundingBytes.set([1, 2], 0);
    surroundingBytes.set(staticPng, 2);
    surroundingBytes.set([3, 4], staticPng.length + 2);

    MockedPNG.load(surroundingBytes.subarray(2, staticPng.length + 2));

    expect(decode).toHaveBeenCalledOnce();
    expect(new Uint8Array(decode.mock.calls[0][0])).toEqual(staticPng);
    expect(toRGBA8).toHaveBeenCalledOnce();
  });
});
