import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { getDefaultFont, isUrlSafeToFetch } from '@pdfweave/common';
import type { Font } from '@pdfweave/common';
import { CliError, fail } from './contract.js';

const CACHE_DIR = join(homedir(), '.pdfme', 'fonts');
const NOTO_SANS_JP_URL =
  'https://github.com/google/fonts/raw/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf';
export const NOTO_CACHE_FILE = join(CACHE_DIR, 'NotoSansJP-Regular.ttf');
const REMOTE_FONT_TIMEOUT_MS = 15000;
const MAX_REMOTE_FONT_BYTES = 32 * 1024 * 1024; // 32 MiB

export type ExplicitFontSourceKind = 'localPath' | 'url' | 'dataUri' | 'inlineBytes' | 'invalid';
export type ExplicitFontRemoteProvider =
  | 'genericPublic'
  | 'googleFontsAsset'
  | 'googleFontsStylesheet';

export interface ExplicitFontSourceDiagnosis {
  fontName: string;
  kind: ExplicitFontSourceKind;
  provider?: ExplicitFontRemoteProvider;
  path?: string;
  resolvedPath?: string;
  exists?: boolean;
  url?: string;
  mediaType?: string;
  formatHint?: string | null;
  supportedFormat?: boolean;
  needsNetwork: boolean;
  dataType?: string;
}

interface ResolveFontOptions {
  fontArgs?: string[];
  hasCJK: boolean;
  noAutoFont: boolean;
  verbose: boolean;
  hasExplicitFontConfig?: boolean;
}

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

export async function downloadNotoSansJP(verbose: boolean): Promise<Uint8Array | null> {
  if (existsSync(NOTO_CACHE_FILE)) {
    if (verbose) console.error('Using cached NotoSansJP from', NOTO_CACHE_FILE);
    return new Uint8Array(readFileSync(NOTO_CACHE_FILE)) as Uint8Array<ArrayBuffer>;
  }

  ensureCacheDir();
  console.error('Downloading NotoSansJP for CJK support...');

  try {
    const response = await fetch(NOTO_SANS_JP_URL);
    if (!response.ok) {
      console.error(`Warning: Failed to download NotoSansJP (HTTP ${response.status})`);
      return null;
    }
    const buffer = new Uint8Array(await response.arrayBuffer()) as Uint8Array<ArrayBuffer>;
    writeFileSync(NOTO_CACHE_FILE, buffer);
    console.error('Cached NotoSansJP to', NOTO_CACHE_FILE);
    return buffer;
  } catch (error) {
    console.error(
      'Warning: Could not download NotoSansJP. CJK text may not render correctly.',
      error instanceof Error ? error.message : '',
    );
    return null;
  }
}

export function parseCustomFonts(fontArgs: string[]): Font {
  const font: Font = {};
  for (let i = 0; i < fontArgs.length; i++) {
    const arg = fontArgs[i];
    const eqIndex = arg.indexOf('=');
    if (eqIndex === -1) {
      fail(
        `Invalid --font format ${JSON.stringify(arg)}. Expected name=path, for example "NotoSansJP=./fonts/NotoSansJP.ttf".`,
        { code: 'EARG', exitCode: 1 },
      );
    }
    const name = arg.slice(0, eqIndex);
    const filePath = resolve(arg.slice(eqIndex + 1));
    if (!existsSync(filePath)) {
      fail(`Font file not found: ${filePath}`, { code: 'EIO', exitCode: 3 });
    }

    const extension = extname(filePath).toLowerCase();
    if (extension !== '.ttf') {
      fail(
        `Unsupported font format for ${filePath}. @pdfweave/cli currently guarantees only .ttf custom fonts.`,
        { code: 'EUNSUPPORTED', exitCode: 1 },
      );
    }

    font[name] = {
      data: new Uint8Array(readFileSync(filePath)) as Uint8Array<ArrayBuffer>,
      fallback: i === 0,
      subset: true,
    };
  }
  return font;
}

export function analyzeExplicitFontRecord(
  fontRecord: Record<string, unknown>,
  templateDir?: string,
): {
  sources: ExplicitFontSourceDiagnosis[];
  issues: string[];
  warnings: string[];
} {
  const issues: string[] = [];
  const warnings: string[] = [];
  const sources: ExplicitFontSourceDiagnosis[] = [];

  for (const fontName of Object.keys(fontRecord).sort()) {
    const result = analyzeExplicitFontSource(fontName, fontRecord[fontName], templateDir);
    sources.push(result.source);
    issues.push(...result.issues);
    warnings.push(...result.warnings);
  }

  return { sources, issues, warnings };
}

export async function normalizeExplicitFontOption(
  jobFont: unknown,
  templateDir?: string,
): Promise<Font | undefined> {
  if (jobFont === undefined) {
    return undefined;
  }

  if (typeof jobFont !== 'object' || jobFont === null || Array.isArray(jobFont)) {
    fail('Unified job options.font must be an object.', {
      code: 'EARG',
      exitCode: 1,
    });
  }

  const normalized: Font = {};
  const fontRecord = jobFont as Record<string, unknown>;

  for (const fontName of Object.keys(fontRecord).sort()) {
    normalized[fontName] = await normalizeExplicitFontSource(
      fontName,
      fontRecord[fontName],
      templateDir,
    );
  }

  return normalized;
}

function analyzeExplicitFontSource(
  fontName: string,
  value: unknown,
  templateDir?: string,
): {
  source: ExplicitFontSourceDiagnosis;
  issues: string[];
  warnings: string[];
} {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    issues.push(`Font config for ${fontName} must be an object with a "data" field.`);
    return {
      source: {
        fontName,
        kind: 'invalid',
        needsNetwork: false,
        dataType: getValueType(value),
      },
      issues,
      warnings,
    };
  }

  const record = value as Record<string, unknown>;
  const data = record.data;
  if (data === undefined) {
    issues.push(`Font config for ${fontName} is missing "data".`);
    return {
      source: {
        fontName,
        kind: 'invalid',
        needsNetwork: false,
        dataType: 'missing',
      },
      issues,
      warnings,
    };
  }

  if (typeof data === 'string') {
    if (data.startsWith('data:')) {
      return analyzeDataUriFontSource(fontName, data);
    }

    const parsedUrl = tryParseUrl(data);
    if (parsedUrl) {
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        return analyzeUrlFontSource(fontName, parsedUrl);
      }

      issues.push(
        `Font source for ${fontName} uses unsupported URL protocol "${parsedUrl.protocol}". Use a local .ttf path, a data URI, or an https URL.`,
      );
      return {
        source: {
          fontName,
          kind: 'invalid',
          needsNetwork: false,
          dataType: 'string',
        },
        issues,
        warnings,
      };
    }

    return analyzeLocalFontSource(fontName, data, templateDir);
  }

  if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    return {
      source: {
        fontName,
        kind: 'inlineBytes',
        needsNetwork: false,
        dataType: getValueType(data),
      },
      issues,
      warnings,
    };
  }

  issues.push(`Font source for ${fontName} has unsupported data type ${getValueType(data)}.`);
  return {
    source: {
      fontName,
      kind: 'invalid',
      needsNetwork: false,
      dataType: getValueType(data),
    },
    issues,
    warnings,
  };
}

function analyzeLocalFontSource(
  fontName: string,
  pathValue: string,
  templateDir?: string,
): {
  source: ExplicitFontSourceDiagnosis;
  issues: string[];
  warnings: string[];
} {
  const issues: string[] = [];
  const warnings: string[] = [];
  const resolvedPath = templateDir ? resolve(templateDir, pathValue) : resolve(pathValue);
  const exists = existsSync(resolvedPath);
  const formatHint = detectPathFormatHint(resolvedPath);
  const formatResult = evaluateFontFormat(fontName, formatHint, `Font file for ${fontName}`);

  if (!exists) {
    issues.push(`Font file for ${fontName} not found: ${resolvedPath}`);
  }
  if (formatResult.issue) {
    issues.push(formatResult.issue);
  }
  if (formatResult.warning) {
    warnings.push(formatResult.warning);
  }

  return {
    source: {
      fontName,
      kind: 'localPath',
      path: pathValue,
      resolvedPath,
      exists,
      formatHint,
      supportedFormat: formatResult.supportedFormat,
      needsNetwork: false,
      dataType: 'string',
    },
    issues,
    warnings,
  };
}

function analyzeUrlFontSource(
  fontName: string,
  url: URL,
): {
  source: ExplicitFontSourceDiagnosis;
  issues: string[];
  warnings: string[];
} {
  const issues: string[] = [];
  const warnings: string[] = [];
  const provider = detectRemoteFontProvider(url);
  const formatHint = detectPathFormatHint(url.pathname);
  const formatResult = evaluateFontFormat(fontName, formatHint, `Font URL for ${fontName}`);

  if (provider === 'googleFontsStylesheet') {
    issues.push(
      `Font URL for ${fontName} uses the unsupported Google Fonts stylesheet API. Use the direct fonts.gstatic.com asset URL or download the font locally.`,
    );
  }
  if (!isUrlSafeToFetch(url.toString())) {
    issues.push(
      `Font URL for ${fontName} is invalid or unsafe. Only http: and https: URLs pointing to public hosts are allowed.`,
    );
  }
  if (provider !== 'googleFontsStylesheet' && formatResult.issue) {
    issues.push(formatResult.issue);
  }
  if (provider !== 'googleFontsStylesheet' && formatResult.warning) {
    warnings.push(formatResult.warning);
  }

  return {
    source: {
      fontName,
      kind: 'url',
      provider,
      url: url.toString(),
      formatHint,
      supportedFormat: formatResult.supportedFormat,
      needsNetwork: true,
      dataType: 'string',
    },
    issues,
    warnings,
  };
}

function analyzeDataUriFontSource(
  fontName: string,
  dataUri: string,
): {
  source: ExplicitFontSourceDiagnosis;
  issues: string[];
  warnings: string[];
} {
  const issues: string[] = [];
  const warnings: string[] = [];
  const mediaType = getDataUriMediaType(dataUri);
  const formatHint = detectDataUriFormatHint(mediaType);
  const formatResult = evaluateFontFormat(fontName, formatHint, `Font data URI for ${fontName}`);

  if (formatResult.issue) {
    issues.push(formatResult.issue);
  }
  if (formatResult.warning) {
    warnings.push(formatResult.warning);
  }

  return {
    source: {
      fontName,
      kind: 'dataUri',
      mediaType,
      formatHint,
      supportedFormat: formatResult.supportedFormat,
      needsNetwork: false,
      dataType: 'string',
    },
    issues,
    warnings,
  };
}

async function normalizeExplicitFontSource(
  fontName: string,
  value: unknown,
  templateDir?: string,
): Promise<Font[string]> {
  const analysis = analyzeExplicitFontSource(fontName, value, templateDir);

  for (const issue of analysis.issues) {
    const code = issue.includes('not found')
      ? 'EIO'
      : issue.includes('unsupported') || issue.includes('unsafe') || issue.includes('uses .')
        ? 'EUNSUPPORTED'
        : 'EARG';
    fail(issue, { code, exitCode: code === 'EIO' ? 3 : 1 });
  }

  const record = value as Record<string, unknown>;
  const data = record.data;

  if (analysis.source.kind === 'localPath') {
    return {
      ...record,
      data: new Uint8Array(readFileSync(analysis.source.resolvedPath!)) as Uint8Array<ArrayBuffer>,
    };
  }

  if (analysis.source.kind === 'url') {
    return {
      ...record,
      data: await fetchRemoteFontSource(analysis.source),
    };
  }

  if (analysis.source.kind === 'dataUri' || analysis.source.kind === 'inlineBytes') {
    const normalizedData =
      typeof data === 'string'
        ? data
        : data instanceof Uint8Array
          ? (data as Uint8Array<ArrayBuffer>)
          : (data as ArrayBuffer);
    return {
      ...record,
      data: normalizedData,
    };
  }

  fail(`Font source for ${fontName} has unsupported data type ${getValueType(data)}.`, {
    code: 'EARG',
    exitCode: 1,
  });
}

async function fetchRemoteFontSource(
  source: ExplicitFontSourceDiagnosis,
): Promise<Uint8Array<ArrayBuffer>> {
  const url = source.url!;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REMOTE_FONT_TIMEOUT_MS),
    });
    if (!response.ok) {
      failRemoteFontFetch(
        source,
        `Failed to fetch remote font data from ${url}. HTTP ${response.status}`,
      );
    }

    const contentLengthHeader = response.headers.get('content-length');
    const declaredLength = contentLengthHeader ? Number(contentLengthHeader) : Number.NaN;
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REMOTE_FONT_BYTES) {
      failRemoteFontFetch(
        source,
        `Remote font data from ${url} exceeds the ${MAX_REMOTE_FONT_BYTES}-byte safety limit.`,
      );
    }

    const buffer = await readResponseBodyWithLimit(response, source);
    return buffer;
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    failRemoteFontFetch(
      source,
      `Failed to fetch remote font data from ${url}. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function failRemoteFontFetch(source: ExplicitFontSourceDiagnosis, message: string): never {
  fail(message, {
    code: 'EFONT',
    exitCode: 2,
    details: {
      fontName: source.fontName,
      url: source.url,
      provider: source.provider,
      timeoutMs: REMOTE_FONT_TIMEOUT_MS,
      maxBytes: MAX_REMOTE_FONT_BYTES,
    },
  });
}

async function readResponseBodyWithLimit(
  response: Response,
  source: ExplicitFontSourceDiagnosis,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer()) as Uint8Array<ArrayBuffer>;
    if (buffer.byteLength > MAX_REMOTE_FONT_BYTES) {
      failRemoteFontFetch(
        source,
        `Remote font data from ${source.url} exceeds the ${MAX_REMOTE_FONT_BYTES}-byte safety limit.`,
      );
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    total += value.byteLength;
    if (total > MAX_REMOTE_FONT_BYTES) {
      failRemoteFontFetch(
        source,
        `Remote font data from ${source.url} exceeds the ${MAX_REMOTE_FONT_BYTES}-byte safety limit.`,
      );
    }

    chunks.push(value);
  }

  const merged = new Uint8Array(total) as Uint8Array<ArrayBuffer>;
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function detectRemoteFontProvider(url: URL): ExplicitFontRemoteProvider {
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'fonts.gstatic.com' || hostname.endsWith('.fonts.gstatic.com')) {
    return 'googleFontsAsset';
  }
  if (hostname === 'fonts.googleapis.com' || hostname.endsWith('.fonts.googleapis.com')) {
    return 'googleFontsStylesheet';
  }
  return 'genericPublic';
}

function getDataUriMediaType(value: string): string | undefined {
  const match = value.match(/^data:([^;,]+)/i);
  return match ? match[1] : undefined;
}

function detectPathFormatHint(value: string): string | null {
  const extension = extname(value).toLowerCase();
  return extension ? extension.slice(1) : null;
}

function detectDataUriFormatHint(mediaType?: string): string | null {
  if (!mediaType) {
    return null;
  }

  const lower = mediaType.toLowerCase();
  if (lower.includes('ttf') || lower.endsWith('/sfnt')) {
    return 'ttf';
  }
  if (lower.includes('otf')) {
    return 'otf';
  }
  if (lower.includes('ttc')) {
    return 'ttc';
  }
  return null;
}

function evaluateFontFormat(
  fontName: string,
  formatHint: string | null,
  sourceLabel: string,
): {
  supportedFormat?: boolean;
  issue?: string;
  warning?: string;
} {
  if (formatHint === 'ttf') {
    return { supportedFormat: true };
  }

  if (formatHint === null) {
    return {
      warning: `${sourceLabel} does not clearly advertise a .ttf format. @pdfweave/cli currently guarantees only .ttf custom fonts.`,
    };
  }

  return {
    supportedFormat: false,
    issue: `${sourceLabel} uses .${formatHint}. @pdfweave/cli currently guarantees only .ttf custom fonts for ${fontName}.`,
  };
}

function getValueType(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (value instanceof Uint8Array) return 'Uint8Array';
  if (value instanceof ArrayBuffer) return 'ArrayBuffer';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export async function resolveFont(options: ResolveFontOptions): Promise<Font> {
  const { fontArgs, hasCJK, noAutoFont, verbose, hasExplicitFontConfig = false } = options;

  if (fontArgs && fontArgs.length > 0) {
    return parseCustomFonts(fontArgs);
  }

  const defaultFont = getDefaultFont();

  if (!hasCJK || hasExplicitFontConfig) {
    return defaultFont;
  }

  if (noAutoFont) {
    fail(
      'CJK text detected, but automatic NotoSansJP download is disabled by --noAutoFont and no explicit font source was provided. Provide --font or options.font.',
      {
        code: 'EFONT',
        exitCode: 2,
        details: {
          fontName: 'NotoSansJP',
          cacheFile: NOTO_CACHE_FILE,
          autoFont: false,
        },
      },
    );
  }

  const notoData = await downloadNotoSansJP(verbose);
  if (!notoData) {
    fail(
      'CJK text detected, but NotoSansJP could not be resolved automatically. Re-run with network access, warm the font cache, or provide --font / options.font.',
      {
        code: 'EFONT',
        exitCode: 2,
        details: {
          fontName: 'NotoSansJP',
          cacheFile: NOTO_CACHE_FILE,
          downloadUrl: NOTO_SANS_JP_URL,
          autoFont: true,
        },
      },
    );
  }

  return {
    NotoSansJP: { data: notoData, fallback: true, subset: true },
    ...Object.fromEntries(
      Object.entries(defaultFont).map(([k, v]) => [k, { ...v, fallback: false }]),
    ),
  } as Font;
}
