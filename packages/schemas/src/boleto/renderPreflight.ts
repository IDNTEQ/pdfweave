import { getDefaultFont, getFallbackFontName, type Font } from '@pdfweave/common';
import { assertStaticPng, JpegEmbedder, PngEmbedder, toUint8Array } from '@pdfweave/pdf-lib';
import jpeg from 'jpeg-js';
import text from '../text/index.js';
import { escapeInlineMarkdown } from '../text/inlineMarkdown.js';
import { measureTextLines } from '../text/measure.js';
import type { TextSchema } from '../text/types.js';
import { getImageDimension } from '../graphics/imagehelper.js';
import type { BoletoLayout, BoletoTextPrimitive } from './layout.js';
import { BOLETO_ERROR_PREFIX } from './types.js';

const TEXT_FIT_EPSILON_MM = 0.05;
export const BOLETO_LOGO_MAX_DIMENSION_PX = 2048;
export const BOLETO_LOGO_MAX_PIXELS = 4_000_000;
export const BOLETO_LOGO_MAX_JPEG_DECODE_MEMORY_MB = 64;
const MAX_LOGO_COLLISION_BUCKET_ENTRIES = 4;
const MAX_RECENT_LOGO_FINGERPRINTS = 8;
const LOGO_CACHE_MARKER = 'pdfweave-boleto-logo-v1';
const LOGO_FINGERPRINT_CACHE_MARKER = 'pdfweave-boleto-logo-fingerprints-v1';
const LOGO_FINGERPRINT_CACHE_KEY = 'boleto-logo-fingerprints:v1';

export interface BoletoLogoPreflight {
  kind: 'jpeg' | 'png';
  width: number;
  height: number;
}

export const assertBoletoLogoDimensions = ({
  width,
  height,
}: {
  width: number;
  height: number;
}): void => {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > BOLETO_LOGO_MAX_DIMENSION_PX ||
    height > BOLETO_LOGO_MAX_DIMENSION_PX ||
    width * height > BOLETO_LOGO_MAX_PIXELS
  ) {
    throw new Error('dimensions are invalid or exceed the safe rendering limit');
  }
};

export interface BoletoLogoMemo {
  source: string;
  structural?: BoletoLogoPreflight;
  pendingStructural?: Promise<BoletoLogoPreflight>;
  pendingStructuralToken?: object;
  embeddedByDocument: WeakMap<object, Promise<unknown>>;
}

interface BoletoLogoMemoBucket {
  marker: typeof LOGO_CACHE_MARKER;
  entries: BoletoLogoMemo[];
}

interface BoletoLogoFingerprintEntry {
  source: string;
  cacheKey: string;
  memo?: BoletoLogoMemo;
}

interface BoletoLogoFingerprintCache {
  marker: typeof LOGO_FINGERPRINT_CACHE_MARKER;
  entries: BoletoLogoFingerprintEntry[];
}

const createLogoMemo = (source: string): BoletoLogoMemo => ({
  source,
  embeddedByDocument: new WeakMap(),
});

const isLogoMemoBucket = (value: unknown): value is BoletoLogoMemoBucket => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<BoletoLogoMemoBucket>;
  return candidate.marker === LOGO_CACHE_MARKER && Array.isArray(candidate.entries);
};

const isLogoFingerprintCache = (value: unknown): value is BoletoLogoFingerprintCache => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<BoletoLogoFingerprintCache>;
  return candidate.marker === LOGO_FINGERPRINT_CACHE_MARKER && Array.isArray(candidate.entries);
};

export const getBoletoLogoCacheKey = (value: string): string => {
  let firstHash = 2_166_136_261;
  let secondHash = 2_654_435_769;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.codePointAt(index) ?? 0;
    firstHash = Math.imul(firstHash ^ code, 16_777_619);
    secondHash = Math.imul(secondHash ^ code, 2_246_822_507);
    secondHash = (secondHash << 13) | (secondHash >>> 19);
  }
  return `boleto-logo:v1:${value.length.toString(36)}:${(firstHash >>> 0).toString(16).padStart(8, '0')}:${(secondHash >>> 0).toString(16).padStart(8, '0')}`;
};

const getMemoizedBoletoLogoFingerprint = (
  value: string,
  cache: Map<string | number, unknown>,
): BoletoLogoFingerprintEntry => {
  const cached = cache.get(LOGO_FINGERPRINT_CACHE_KEY);
  const fingerprints: BoletoLogoFingerprintCache = isLogoFingerprintCache(cached)
    ? cached
    : { marker: LOGO_FINGERPRINT_CACHE_MARKER, entries: [] };
  if (!isLogoFingerprintCache(cached)) {
    cache.set(LOGO_FINGERPRINT_CACHE_KEY, fingerprints);
  }

  const existing = fingerprints.entries.find((entry) => entry.source === value);
  if (existing) {
    return existing;
  }

  const cacheKey = getBoletoLogoCacheKey(value);
  if (fingerprints.entries.length >= MAX_RECENT_LOGO_FINGERPRINTS) {
    fingerprints.entries.shift();
  }
  const fingerprint = { source: value, cacheKey };
  fingerprints.entries.push(fingerprint);
  return fingerprint;
};

export const getBoletoLogoMemo = (
  value: string,
  cache: Map<string | number, unknown>,
): BoletoLogoMemo => {
  const fingerprint = getMemoizedBoletoLogoFingerprint(value, cache);
  if (fingerprint.memo) {
    return fingerprint.memo;
  }

  const { cacheKey } = fingerprint;
  const cached = cache.get(cacheKey);
  const bucket: BoletoLogoMemoBucket = isLogoMemoBucket(cached)
    ? cached
    : { marker: LOGO_CACHE_MARKER, entries: [] };
  if (!isLogoMemoBucket(cached)) {
    cache.set(cacheKey, bucket);
  }

  const existing = bucket.entries.find((entry) => entry.source === value);
  if (existing) {
    fingerprint.memo = existing;
    return existing;
  }

  const memo = createLogoMemo(value);
  if (bucket.entries.length < MAX_LOGO_COLLISION_BUCKET_ENTRIES) {
    bucket.entries.push(memo);
  }
  fingerprint.memo = memo;
  return memo;
};

const getMinimumFontSize = (primitive: BoletoTextPrimitive): number =>
  primitive.minimumFontSize ?? Math.min(4, primitive.fontSize);

export const getBoletoTextValue = (primitive: BoletoTextPrimitive): string =>
  primitive.bold ? `**${escapeInlineMarkdown(primitive.value)}**` : primitive.value;

export const createBoletoTextSchema = (
  primitive: BoletoTextPrimitive,
  position: TextSchema['position'],
): TextSchema => ({
  ...(text.propPanel.defaultSchema as TextSchema),
  name: `__boleto-${primitive.id}`,
  type: 'text',
  content: '',
  position,
  width: primitive.width / (primitive.horizontalScale ?? 1),
  height: primitive.height,
  rotate: 0,
  opacity: primitive.opacity ?? 1,
  alignment: primitive.alignment ?? 'left',
  verticalAlignment: 'top',
  fontSize: primitive.fontSize,
  lineHeight: 1.08,
  characterSpacing: 0,
  dynamicFontSize: {
    min: getMinimumFontSize(primitive),
    max: primitive.fontSize,
    fit: 'vertical',
  },
  fontColor: primitive.color ?? '#000000',
  backgroundColor: '',
  overflow: 'hidden',
  textFormat: primitive.bold ? 'inline-markdown' : 'plain',
  readOnly: true,
});

const decodeBoletoLogo = async (value: string): Promise<BoletoLogoPreflight> => {
  const pngMime = value.startsWith('data:image/png;base64,');
  const jpegMime = value.startsWith('data:image/jpeg;base64,');
  if (!pngMime && !jpegMime) {
    throw new Error(`${BOLETO_ERROR_PREFIX} Institution logo must be a PNG or JPEG data URI`);
  }

  let bytes: Uint8Array;
  try {
    bytes = toUint8Array(value);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${BOLETO_ERROR_PREFIX} Institution logo cannot be decoded: ${detail}`);
  }
  const signatureMatches = pngMime
    ? bytes[0] === 137 &&
      bytes[1] === 80 &&
      bytes[2] === 78 &&
      bytes[3] === 71 &&
      bytes[4] === 13 &&
      bytes[5] === 10 &&
      bytes[6] === 26 &&
      bytes[7] === 10
    : bytes[0] === 255 && bytes[1] === 216;
  if (!signatureMatches) {
    throw new Error(`${BOLETO_ERROR_PREFIX} Institution logo MIME type does not match its data`);
  }

  try {
    const headerDimensions = getImageDimension(value);
    assertBoletoLogoDimensions(headerDimensions);
    if (pngMime) {
      assertStaticPng(bytes);
    }

    const decoded = pngMime ? await PngEmbedder.for(bytes) : await JpegEmbedder.for(bytes);
    const { width, height } = decoded;
    assertBoletoLogoDimensions({ width, height });
    if (!pngMime) {
      const raster = jpeg.decode(bytes, {
        useTArray: true,
        formatAsRGBA: false,
        tolerantDecoding: false,
        maxResolutionInMP: BOLETO_LOGO_MAX_PIXELS / 1_000_000,
        maxMemoryUsageInMB: BOLETO_LOGO_MAX_JPEG_DECODE_MEMORY_MB,
      });
      if (
        raster.width !== width ||
        raster.height !== height ||
        raster.data.length !== width * height * 3
      ) {
        throw new Error('decoded JPEG raster does not match its declared dimensions');
      }
    }
    return { kind: pngMime ? 'png' : 'jpeg', width, height };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${BOLETO_ERROR_PREFIX} Institution logo cannot be decoded: ${detail}`);
  }
};

export const preflightBoletoLogo = async (
  value: string,
  cache: Map<string | number, unknown>,
): Promise<BoletoLogoPreflight> => {
  const memo = getBoletoLogoMemo(value, cache);
  if (memo.structural) {
    return memo.structural;
  }
  if (memo.pendingStructural) {
    return memo.pendingStructural;
  }

  const pending = decodeBoletoLogo(value);
  const pendingToken = {};
  memo.pendingStructural = pending;
  memo.pendingStructuralToken = pendingToken;
  try {
    const result = await pending;
    memo.structural = result;
    return result;
  } finally {
    if (memo.pendingStructuralToken === pendingToken) {
      memo.pendingStructural = undefined;
      memo.pendingStructuralToken = undefined;
    }
  }
};

export const preflightBoletoLayout = async ({
  layout,
  font,
  _cache,
}: {
  layout: BoletoLayout;
  font?: Font;
  _cache: Map<string | number, unknown>;
}): Promise<Map<string, TextSchema>> => {
  for (const primitive of layout.images) {
    await preflightBoletoLogo(primitive.value, _cache);
  }

  const resolvedFont = font ?? getDefaultFont();
  const fallbackFontName = getFallbackFontName(resolvedFont);
  const resolvedSchemas = new Map<string, TextSchema>();
  for (const primitive of layout.texts) {
    const schema = {
      ...createBoletoTextSchema(primitive, { x: 0, y: 0 }),
      fontName: fallbackFontName,
    };
    if (!primitive.value) {
      resolvedSchemas.set(primitive.id, { ...schema, dynamicFontSize: undefined });
      continue;
    }

    const { measuredHeight, fontSize } = await measureTextLines({
      value: getBoletoTextValue(primitive),
      schema,
      font: resolvedFont,
      _cache,
    });
    if (measuredHeight > primitive.height + TEXT_FIT_EPSILON_MM) {
      throw new Error(
        `${BOLETO_ERROR_PREFIX} Text field "${primitive.id}" does not fit its ${String(primitive.height)} mm box at the minimum supported font size`,
      );
    }
    resolvedSchemas.set(primitive.id, {
      ...schema,
      fontSize,
      dynamicFontSize: undefined,
    });
  }
  return resolvedSchemas;
};
