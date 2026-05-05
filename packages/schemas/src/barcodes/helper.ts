import { b64toUint8Array } from '@pdfweave/common';
// Type-only import keeps RenderOptions available without pulling the
// runtime entry. The `bwip-js` package's package.json `exports` field
// branches on `browser` / `node` / `react-native` conditions; some
// bundlers (e.g. webpack inside Directus per pdfme/pdfme#418) resolve
// to a build that depends on globals their target environment doesn't
// provide, and Web Workers (pdfme/pdfme#702) trip over the browser
// build's `window` / `document` references. Loading bwip-js dynamically
// at call time lets us pick a subpath whose `exports` entry has no
// env conditional: `bwip-js/node` for Node, `bwip-js/browser` inside a
// real document, and the environment-agnostic `bwip-js/generic`
// (PostScript-pure SVG only) when running inside a Worker / edge
// runtime where neither `document` nor Node is available.
import type { RenderOptions } from 'bwip-js';
import { Buffer } from 'buffer';
import { BARCODE_TYPES, DEFAULT_BARCODE_INCLUDETEXT } from './constants.js';
import type { BarcodeSchema, BarcodeTypes } from './types.js';

type BwipModule = {
  toCanvas?: (
    canvas: HTMLCanvasElement | OffscreenCanvas,
    options: RenderOptions,
  ) => HTMLCanvasElement | OffscreenCanvas;
  toBuffer?: (options: RenderOptions) => Promise<Buffer>;
  toSVG?: (options: RenderOptions) => string;
};

const isBrowserMain = () =>
  typeof window !== 'undefined' && typeof document !== 'undefined';

const isWebWorker = () =>
  typeof window === 'undefined' &&
  typeof document === 'undefined' &&
  typeof self !== 'undefined' &&
  typeof (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas !== 'undefined';

const isNodeRuntime = () =>
  typeof process !== 'undefined' &&
  typeof (process as { versions?: { node?: string } }).versions?.node === 'string';

let bwipjsPromise: Promise<BwipModule> | undefined;
const loadBwipjs = async (): Promise<BwipModule> => {
  if (bwipjsPromise) return bwipjsPromise;
  bwipjsPromise = (async () => {
    if (isBrowserMain()) {
      const mod = (await import('bwip-js/browser')) as unknown as
        | BwipModule
        | { default: BwipModule };
      return ('default' in mod ? mod.default : mod) as BwipModule;
    }
    if (isNodeRuntime()) {
      const mod = (await import('bwip-js/node')) as unknown as
        | BwipModule
        | { default: BwipModule };
      return ('default' in mod ? mod.default : mod) as BwipModule;
    }
    // Web Worker, edge runtime, deno, etc. — generic build is the only
    // one whose package.json export has no `browser` / `node` conditional
    // and whose code never references `window` / `document` / `navigator`.
    const mod = (await import('bwip-js/generic')) as unknown as
      | BwipModule
      | { default: BwipModule };
    return ('default' in mod ? mod.default : mod) as BwipModule;
  })();
  return bwipjsPromise;
};

// GTIN-13, GTIN-8, GTIN-12, GTIN-14
const validateCheckDigit = (input: string, checkDigitPos: number) => {
  let passCheckDigit = true;

  if (input.length === checkDigitPos) {
    const ds = input.slice(0, -1).replace(/[^0-9]/g, '');
    let sum = 0;
    let odd = 1;
    for (let i = ds.length - 1; i > -1; i -= 1) {
      sum += Number(ds[i]) * (odd ? 3 : 1);
      odd ^= 1;
      if (sum > 0xffffffffffff) {
        // ~2^48 at max
        sum %= 10;
      }
    }
    passCheckDigit = String(10 - (sum % 10)).slice(-1) === input.slice(-1);
  }

  return passCheckDigit;
};
export const validateBarcodeInput = (type: BarcodeTypes, input: string) => {
  if (!input) return false;

  if (!BARCODE_TYPES.includes(type)) return false;

  if (type === 'qrcode') {
    // Up to 500 characters
    return input.length < 500;
  }
  if (type === 'japanpost') {
    // For Japan Post: Postal codes must be digits (0-9) only.
    // Address display numbers can use alphanumeric characters (0-9, A-Z) and hyphen (-).
    const regexp = /^(\d{7})(\d|[A-Z]|-)+$/;
    return regexp.test(input);
  }
  if (type === 'ean13') {
    // For EAN-13: Valid characters are digits (0-9) only.
    // Either 12 digits (without check digit) or 13 digits (with check digit).
    const regexp = /^\d{12}$|^\d{13}$/;
    return regexp.test(input) && validateCheckDigit(input, 13);
  }
  if (type === 'ean8') {
    // For EAN-8: Valid characters are digits (0-9) only.
    // Either 7 digits (without check digit) or 8 digits (with check digit).
    const regexp = /^\d{7}$|^\d{8}$/;
    return regexp.test(input) && validateCheckDigit(input, 8);
  }
  if (type === 'code39') {
    // For Code39: Valid characters are digits (0-9), uppercase alphabets (A-Z),
    // symbols (-, ., $, /, +, %), and space.
    const regexp = /^(\d|[A-Z]|[-.$/+%]|\s)+$/;
    return regexp.test(input);
  }
  if (type === 'code128') {
    // For Code128: Valid characters are all except Kanji, Hiragana, and Katakana.
    // https://qiita.com/graminume/items/2ac8dd9c32277fa9da64
    return !input.match(
      /([\u30a0-\u30ff\u3040-\u309f\u3005-\u3006\u30e0-\u9fcf]|[Ａ-Ｚａ-ｚ０-９！＂＃＄％＆＇（）＊＋，－．／：；＜＝＞？＠［＼］＾＿｀｛｜｝〜　])+/,
    );
  }
  if (type === 'nw7') {
    // For NW-7: Valid characters are digits (0-9) and symbols (-, ., $, :, /, +).
    // The first and last characters must be one of the alphabets A-D (start/stop codes).
    const regexp = /^[A-Da-d]([0-9.$:/+-])+[A-Da-d]$/;
    return regexp.test(input);
  }
  if (type === 'itf14') {
    // For ITF-14: Valid characters are digits (0-9) only.
    // Either 13 digits (without check digit) or 14 digits (with check digit).
    const regexp = /^\d{13}$|^\d{14}$/;
    return regexp.test(input) && validateCheckDigit(input, 14);
  }
  if (type === 'itf') {
    // General Interleaved 2 of 5 (ITF): digits only, even number of digits.
    // Allow any even length supported by the symbology.
    const regexp = /^\d+$/;
    return regexp.test(input) && input.length % 2 === 0;
  }
  if (type === 'upca') {
    // For UPCA: Valid characters are digits (0-9) only.
    // Either 11 digits (without check digit) or 12 digits (with check digit).
    const regexp = /^\d{11}$|^\d{12}$/;
    return regexp.test(input) && validateCheckDigit(input, 12);
  }
  if (type === 'upce') {
    // For UPCE: Valid characters are digits (0-9) only.
    // The first digit (number system character) must be 0.
    // Either 7 digits (without check digit) or 8 digits (with check digit).
    const regexp = /^0(\d{6}$|\d{7}$)/;
    return regexp.test(input) && validateCheckDigit(input, 8);
  }
  if (type === 'gs1datamatrix') {
    let ret = false;
    // Find the GTIN application identifier: regex for "(01)" and the digits following it until another "(".
    const regexp = /\((01)\)(\d*)(\(|$)/;
    let res = input.match(regexp);
    if (
      res != null &&
      input.length <= 52 && // 52 is the max length of a GS1 DataMatrix barcode before bwip-js throws an error
      res[1] === '01' &&
      (res[2].length === 14 || res[2].length === 8 || res[2].length === 12 || res[2].length === 13)
    ) {
      let gtin = res[2];
      ret = validateCheckDigit(gtin, gtin.length);
    }
    return ret;
  }
  if (type === 'pdf417') {
    // PDF417 can encode a wide range of characters,
    // but considering performance and library limitations, the maximum number of characters is limited (up to 1000 characters here).
    return input.length > 0 && input.length <= 1000;
  }

  return false;
};

/**
 * The bwip.js lib has a different name for nw7 type barcodes
 */
export const barCodeType2Bcid = (type: BarcodeTypes) =>
  type === 'nw7' ? 'rationalizedCodabar' : type === 'itf' ? 'interleaved2of5' : type;

/**
 *  Normalise color codes for the bwip-js lib.
 *
 *  bwip-js (FixupOptions in bwip-js-gen.mjs) accepts:
 *    - 6-hex RGB:  `RRGGBB` or `#RRGGBB`
 *    - 3-hex RGB:  `RGB` or `#RGB`
 *    - 8-hex CMYK: `CCMMYYKK` (each pair is the 0-255 byte value of the
 *      C/M/Y/K channel — bwip-js converts this to the equivalent RGB
 *      internally before rasterising).
 *
 *  Authors more commonly express CMYK as `c100m0y0k0` (per-channel
 *  percentages, the textual form used by bwipp's PostScript options). To
 *  make that input shape work end-to-end (regression: pdfme/pdfme#460), we
 *  parse the c/m/y/k tokens here and normalise to bwip-js's 8-hex CMYK
 *  encoding so it falls into the existing CMYK -> RGB path inside
 *  FixupOptions.
 *
 *  KNOWN LIMITATION (pdfme/pdfme#460): the rasterised barcode is always
 *  embedded as an sRGB PNG via embedPng. Even when the caller provides
 *  CMYK colors, the final pdf object stores RGB pixels — preserving a true
 *  CMYK colorspace would require either (a) emitting the bwip-js SVG path
 *  with `device-cmyk(...)` fills (bwip-js currently emits hex RGB only)
 *  and teaching pdf-lib's drawSvg to honour them, or (b) post-processing
 *  the PNG to an indexed CMYK image before embedding. Both are out of
 *  scope of the dynamic-import bundling fix; until then, callers that
 *  need print-correct CMYK should use a pre-rendered SVG asset via the
 *  svg schema instead of the barcode plugin.
 */
const cmykPercentRegex = /^c(\d+(?:\.\d+)?)m(\d+(?:\.\d+)?)y(\d+(?:\.\d+)?)k(\d+(?:\.\d+)?)$/i;
export const mapHexColorForBwipJsLib = (color: string | undefined, fallback?: string) => {
  if (color) {
    const match = cmykPercentRegex.exec(color.trim());
    if (match) {
      const clamp = (n: number) => Math.max(0, Math.min(255, Math.round((n / 100) * 255)));
      const c = clamp(parseFloat(match[1]));
      const m = clamp(parseFloat(match[2]));
      const y = clamp(parseFloat(match[3]));
      const k = clamp(parseFloat(match[4]));
      const hex = (n: number) => n.toString(16).padStart(2, '0');
      return `${hex(c)}${hex(m)}${hex(y)}${hex(k)}`;
    }
    return color.replace('#', '');
  }
  return fallback ? fallback.replace('#', '') : '000000';
};

type BuildOptsArg = {
  type: BarcodeTypes;
  input: string;
  width: number;
  height: number;
  backgroundColor?: string;
  barColor?: string;
  textColor?: string;
  includetext?: boolean;
} & Partial<BarcodeSchema>;

const buildBwipOptions = (arg: BuildOptsArg): RenderOptions => {
  const {
    type,
    input,
    width,
    height,
    backgroundColor,
    barColor,
    textColor,
    includetext = DEFAULT_BARCODE_INCLUDETEXT,
    scale,
    scaleX,
    scaleY,
    padding,
    paddingtop,
    paddingleft,
    paddingright,
    paddingbottom,
    inkspread,
    showBorder,
    borderwidth,
    bordercolor,
    alttext,
    textxalign,
    textsize,
    textyalign,
    textyoffset,
    eclevel,
    version,
    mask,
    qzone,
    columns,
    rows,
    compact,
  } = arg;

  const bcid = barCodeType2Bcid(type);
  const bwipjsArg: RenderOptions = {
    bcid,
    text: input,
    width,
    height,
    scale: scale ?? 5,
    includetext,
    textxalign: 'center',
  };

  if (backgroundColor) bwipjsArg.backgroundcolor = mapHexColorForBwipJsLib(backgroundColor);
  if (barColor) bwipjsArg.barcolor = mapHexColorForBwipJsLib(barColor);
  if (textColor) bwipjsArg.textcolor = mapHexColorForBwipJsLib(textColor);

  if (typeof scaleX === 'number') (bwipjsArg as unknown as { scaleX: number }).scaleX = scaleX;
  if (typeof scaleY === 'number') (bwipjsArg as unknown as { scaleY: number }).scaleY = scaleY;

  if (typeof padding === 'number') (bwipjsArg as unknown as { padding: number }).padding = padding;
  if (typeof paddingtop === 'number')
    (bwipjsArg as unknown as { paddingtop: number }).paddingtop = paddingtop;
  if (typeof paddingleft === 'number')
    (bwipjsArg as unknown as { paddingleft: number }).paddingleft = paddingleft;
  if (typeof paddingright === 'number')
    (bwipjsArg as unknown as { paddingright: number }).paddingright = paddingright;
  if (typeof paddingbottom === 'number')
    (bwipjsArg as unknown as { paddingbottom: number }).paddingbottom = paddingbottom;
  if (typeof inkspread === 'number')
    (bwipjsArg as unknown as { inkspread: number }).inkspread = inkspread;
  // Border: only set when explicitly configured by schema
  if (showBorder === false) (bwipjsArg as unknown as { borderwidth: number }).borderwidth = 0;
  if (typeof borderwidth === 'number')
    (bwipjsArg as unknown as { borderwidth: number }).borderwidth = borderwidth;
  if (bordercolor)
    (bwipjsArg as unknown as { bordercolor: string }).bordercolor = mapHexColorForBwipJsLib(
      bordercolor,
    );

  if (includetext) {
    if (alttext) (bwipjsArg as unknown as { alttext: string }).alttext = alttext;
    if (textxalign)
      (bwipjsArg as unknown as { textxalign: 'left' | 'center' | 'right' }).textxalign = textxalign;
    if (textyalign)
      (bwipjsArg as unknown as { textyalign: 'above' | 'below' }).textyalign = textyalign;
    if (typeof textsize === 'number')
      (bwipjsArg as unknown as { textsize: number }).textsize = textsize;
    if (typeof textyoffset === 'number')
      (bwipjsArg as unknown as { textyoffset: number }).textyoffset = textyoffset;
  }

  if (type === 'qrcode') {
    if (eclevel) (bwipjsArg as unknown as { eclevel: 'L' | 'M' | 'Q' | 'H' }).eclevel = eclevel;
    if (typeof version === 'number')
      (bwipjsArg as unknown as { version: number }).version = version;
    if (typeof mask === 'number') (bwipjsArg as unknown as { mask: number }).mask = mask;
    if (typeof qzone === 'number') (bwipjsArg as unknown as { qzone: number }).qzone = qzone;
  }

  if (type === 'pdf417') {
    if (typeof columns === 'number')
      (bwipjsArg as unknown as { columns: number }).columns = columns;
    if (typeof rows === 'number') (bwipjsArg as unknown as { rows: number }).rows = rows;
    if (typeof compact === 'boolean')
      (bwipjsArg as unknown as { compact: boolean }).compact = compact;
    if (typeof eclevel === 'number')
      (bwipjsArg as unknown as { eclevel: number }).eclevel = eclevel as unknown as number;
  }

  return bwipjsArg;
};

export const createBarCode = async (arg: BuildOptsArg): Promise<Buffer> => {
  const bwipjsArg = buildBwipOptions(arg);
  const mod = await loadBwipjs();

  // Browser main thread: render onto a fresh <canvas>, export PNG via toDataURL.
  if (isBrowserMain() && typeof mod.toCanvas === 'function') {
    const canvas = document.createElement('canvas');
    mod.toCanvas(canvas, bwipjsArg);
    const dataUrl = canvas.toDataURL('image/png');
    return Buffer.from(b64toUint8Array(dataUrl).buffer);
  }

  // Node runtime: toBuffer is the canonical PNG path.
  if (typeof mod.toBuffer === 'function') {
    return mod.toBuffer(bwipjsArg);
  }

  // Web Worker / edge runtime: no `document`, no Node Buffer pipeline. Use
  // OffscreenCanvas + toCanvas if available — bwip-js's browser build accepts
  // an OffscreenCanvas instance directly without ever touching `document`.
  if (
    isWebWorker() &&
    typeof mod.toCanvas === 'function' &&
    typeof (globalThis as { OffscreenCanvas?: typeof OffscreenCanvas }).OffscreenCanvas !==
      'undefined'
  ) {
    const Offscreen = (globalThis as { OffscreenCanvas: typeof OffscreenCanvas }).OffscreenCanvas;
    const canvas = new Offscreen(1, 1);
    mod.toCanvas(canvas, bwipjsArg);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const ab = await blob.arrayBuffer();
    return Buffer.from(ab);
  }

  // Last-resort: surface an actionable error if we can't deliver a PNG buffer
  // in this environment (e.g., generic-only build). Callers should set
  // `format: "svg"` on the schema so the renderer takes the page.drawSvg
  // path via createBarCodeSvg, which works wherever JS runs.
  throw new Error(
    '[@pdfweave/schemas] bwip-js PNG output is unavailable in this environment. ' +
      'Render the barcode schema with `format: "svg"` (uses createBarCodeSvg) ' +
      'or run inside a context that exposes Node Buffer, browser <canvas>, ' +
      'or OffscreenCanvas.',
  );
};

export const createBarCodeSvg = async (arg: BuildOptsArg): Promise<string> => {
  const opts = buildBwipOptions(arg);
  const mod = await loadBwipjs();
  if (typeof mod.toSVG === 'function') {
    const svg = mod.toSVG(opts);
    return typeof svg === 'string' ? svg : String(svg);
  }
  // Fallback when toSVG is unavailable (e.g., certain browser builds)
  return '';
};
