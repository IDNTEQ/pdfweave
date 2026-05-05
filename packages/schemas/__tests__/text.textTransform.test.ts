import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fontkit from 'fontkit';
import { PDFDocument } from '@pdfweave/pdf-lib';
import * as pdfLib from '@pdfweave/pdf-lib';
import { BLANK_PDF, type Font, type PDFRenderProps } from '@pdfweave/common';
import { applyTextTransform } from '../src/text/helper.js';
import { pdfRender } from '../src/text/pdfRender.js';
import type { TextSchema } from '../src/text/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sansData = readFileSync(path.join(__dirname, `/assets/fonts/SauceHanSansJP.ttf`));

const getFont = (): Font => ({
  SauceHanSansJP: { fallback: true, data: sansData },
});

const baseSchema = (overrides: Partial<TextSchema> = {}): TextSchema =>
  ({
    name: 't',
    type: 'text',
    content: 'hello world',
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    alignment: 'left',
    verticalAlignment: 'top',
    fontColor: '#000000',
    backgroundColor: '',
    lineHeight: 1.3,
    characterSpacing: 0,
    fontSize: 12,
    ...overrides,
  }) as TextSchema;

const renderText = async (schema: TextSchema, value: string) => {
  const pdfDoc = await PDFDocument.create();
  // @ts-expect-error registerFontkit method is not in type definitions but exists at runtime
  pdfDoc.registerFontkit(fontkit);
  const page = pdfDoc.addPage();
  const textCalls: Array<Record<string, unknown>> = [];
  const origDrawText = page.drawText.bind(page);
  page.drawText = (text: string, args: Parameters<typeof origDrawText>[1]) => {
    textCalls.push({ text, ...args });
    return origDrawText(text, args);
  };
  await pdfRender({
    value,
    schema,
    basePdf: BLANK_PDF,
    pdfLib,
    pdfDoc,
    page,
    options: { font: getFont() },
    _cache: new Map(),
  } as unknown as PDFRenderProps<TextSchema>);
  return textCalls;
};

/**
 * Pure-function coverage for the textTransform helper added in pdfme/pdfme#707.
 *
 * Tested at the helper level rather than the render level because the
 * transform's only contract is "string in, string out" — the render paths
 * are thin wrappers that call it and pass the result on. CSS-equivalent
 * semantics are spelled out in `applyTextTransform`'s JSDoc.
 */
describe('applyTextTransform (pdfme/pdfme#707)', () => {
  it('returns the value unchanged for "none" / undefined', () => {
    expect(applyTextTransform('Hello World', 'none')).toBe('Hello World');
    expect(applyTextTransform('Hello World', undefined)).toBe('Hello World');
  });
  it('uppercases the entire string', () => {
    expect(applyTextTransform('hello', 'uppercase')).toBe('HELLO');
    expect(applyTextTransform('Hello World', 'uppercase')).toBe('HELLO WORLD');
  });
  it('lowercases the entire string', () => {
    expect(applyTextTransform('HELLO', 'lowercase')).toBe('hello');
    expect(applyTextTransform('Hello World', 'lowercase')).toBe('hello world');
  });
  it('capitalizes the first letter of each whitespace-separated word', () => {
    expect(applyTextTransform('hello world', 'capitalize')).toBe('Hello World');
    // CSS semantics: only the first letter is touched, internal letters
    // stay as-is. iPhone → IPhone (NOT Iphone), preserving brand casing.
    expect(applyTextTransform('iphone xs and ipad', 'capitalize')).toBe('Iphone Xs And Ipad');
  });
  it('preserves whitespace runs through capitalize', () => {
    // Multiple internal spaces and a tab must round-trip; capitalize must
    // not collapse whitespace.
    expect(applyTextTransform('a  b\tc', 'capitalize')).toBe('A  B\tC');
  });
  it('leaves non-letter characters alone', () => {
    expect(applyTextTransform('123 abc', 'capitalize')).toBe('123 Abc');
    expect(applyTextTransform('-x', 'capitalize')).toBe('-x');
  });
});

/**
 * The pdf render path applies textTransform to `value` *before* drawing —
 * the schema's own `content` and the caller's `value` aren't mutated. We
 * verify by spying on `page.drawText` and asserting the text actually drawn.
 * pdfme/pdfme#707.
 */
describe('text pdfRender textTransform integration (pdfme/pdfme#707)', () => {
  it('renders uppercased glyphs when textTransform="uppercase"', async () => {
    const calls = await renderText(baseSchema({ textTransform: 'uppercase' }), 'hello');
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0].text).toBe('HELLO');
  });
  it('default (no textTransform) leaves the rendered text untouched', async () => {
    const calls = await renderText(baseSchema(), 'Hello');
    expect(calls[0].text).toBe('Hello');
  });
});
