import {
  substituteVariables,
  substituteVariablesAsInlineMarkdownLiterals,
  validateVariables,
} from '../src/multiVariableText/helper.js';
import { parseInlineMarkdown, stripInlineMarkdown } from '../src/text/inlineMarkdown.js';
import { MultiVariableTextSchema } from '../src/multiVariableText/types.js';
import multiVariableTextPlugin from '../src/multiVariableText/index.js';
import { measureTextLines } from '../src/text/measure.js';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BasePdf, Font } from '@pdfweave/common';
import {
  countUniqueVariableNames,
  getVariableIndices,
  getVariableNames,
} from '../src/multiVariableText/variables.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sansData = readFileSync(path.join(__dirname, `/assets/fonts/SauceHanSansJP.ttf`));
const serifData = readFileSync(path.join(__dirname, `/assets/fonts/SauceHanSerifJP.ttf`));

const getSampleFont = (): Font => ({
  SauceHanSansJP: { fallback: true, data: sansData },
  SauceHanSerifJP: { data: serifData },
});

const blankBasePdf: BasePdf = { width: 100, height: 100, padding: [10, 10, 10, 10] };

const createMeasureSchema = (
  overrides: Partial<MultiVariableTextSchema> = {},
): MultiVariableTextSchema => ({
  name: 'mvt',
  type: 'multiVariableText',
  content: '{}',
  text: 'Hello {name}',
  variables: ['name'],
  position: { x: 0, y: 10 },
  width: 28,
  height: 8,
  alignment: 'left',
  verticalAlignment: 'top',
  fontColor: '#000000',
  backgroundColor: '#ffffff',
  lineHeight: 1,
  characterSpacing: 0,
  fontSize: 14,
  overflow: 'expand',
  ...overrides,
});

const measureMvt = async (
  value: string,
  schema: MultiVariableTextSchema,
  basePdf = blankBasePdf,
) => {
  const result = await multiVariableTextPlugin.measure?.({
    value,
    schema,
    basePdf,
    options: { font: getSampleFont() },
    _cache: new Map(),
  });
  if (!result) throw new Error('MVT plugin did not return a measure result');
  return result;
};

const expectFragments = (result: Awaited<ReturnType<typeof measureMvt>>) => {
  if (!result.fragments) throw new Error('expected measure result to contain fragments');
  return result.fragments;
};

describe('substituteVariables', () => {
  it('should substitute variables in a string', () => {
    const text = 'Hello, {name}!';
    const variables = { name: 'World' };
    const result = substituteVariables(text, variables);
    expect(result).toBe('Hello, World!');
  });

  it('should handle special characters in variable names', () => {
    const text = 'Hello, {*na-me}!';
    const variables = { '*na-me': 'World' };
    const result = substituteVariables(text, variables);
    expect(result).toBe('Hello, World!');
  });

  it('should handle numeric variable names', () => {
    let text = 'Hello, {123}!';
    let variables = { '123': 'World' };
    let result = substituteVariables(text, variables);
    expect(result).toBe('Hello, World!');
  });

  it('should remove variables that were not substituted', () => {
    const text = 'Hello, {name}! Welcome to {place}.';
    const variables = { name: 'World' };
    const result = substituteVariables(text, variables);
    expect(result).toBe('Hello, World! Welcome to .');
  });

  it('should handle empty input strings', () => {
    const text = '';
    const variables = { name: 'World' };
    const result = substituteVariables(text, variables);
    expect(result).toBe('');
  });

  it('should handle empty variables', () => {
    const text = 'Hello, {name}!';
    const variables = {};
    const result = substituteVariables(text, variables);
    expect(result).toBe('Hello, !');
  });

  it('should handle variables as a JSON string', () => {
    const text = 'Hello, {name}!';
    const variables = '{"name": "World"}';
    const result = substituteVariables(text, variables);
    expect(result).toBe('Hello, World!');
  });

  it('should handle invalid JSON string for variables', () => {
    const text = 'Hello, {name}!';
    const variables = 'invalid json';
    expect(() => substituteVariables(text, variables)).toThrow(SyntaxError);
  });

  it('should keep inline markdown variables as literal text while preserving template styling', () => {
    const text = '**{name}** uses `{code}`';
    const variables = { name: 'A **bold** user', code: 'PDF `42`' };
    const result = substituteVariablesAsInlineMarkdownLiterals(text, variables);

    expect(stripInlineMarkdown(result)).toBe('A **bold** user uses PDF `42`');
    expect(parseInlineMarkdown(result)).toEqual([
      { text: 'A **bold** user', bold: true },
      { text: ' uses ' },
      { text: 'PDF `42`', code: true },
    ]);
  });
});

describe('multiVariableText overflow expand measure', () => {
  test('short resolved content keeps the authored height', async () => {
    const schema = createMeasureSchema({ height: 30 });

    await expect(measureMvt(JSON.stringify({ name: 'Ada' }), schema)).resolves.toEqual({
      height: schema.height,
    });
  });

  test('long resolved content that fits the current page grows to measured height', async () => {
    const schema = createMeasureSchema({ text: '{body}', variables: ['body'], height: 4 });
    const result = await measureMvt(JSON.stringify({ body: 'Long text '.repeat(20) }), schema, {
      width: 100,
      height: 140,
      padding: [10, 10, 10, 10],
    });

    expect(result.fragments).toBeUndefined();
    expect(result.height).toBeGreaterThan(schema.height);
    expect(result.height).toBeLessThan(120);
  });

  test('resolved content that crosses the page returns line fragments with ranges', async () => {
    const schema = createMeasureSchema({
      text: '{body}',
      variables: ['body'],
      position: { x: 0, y: 40 },
      height: 4,
    });
    const result = await measureMvt(JSON.stringify({ body: 'Long text '.repeat(80) }), schema, {
      width: 100,
      height: 60,
      padding: [10, 10, 10, 10],
    });
    const fragments = expectFragments(result);

    expect(fragments.length).toBeGreaterThan(1);
    expect(fragments.slice(0, 3).map((fragment) => fragment.lineRange)).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 3 },
    ]);
  });

  test('expand ignores dynamicFontSize and measures with the declared font size', async () => {
    const schema = createMeasureSchema({
      text: '{body}',
      variables: ['body'],
      dynamicFontSize: { min: 4, max: 14, fit: 'vertical' },
      height: 8,
    });
    const value = 'Dynamic font should not shrink this expanded text '.repeat(8);
    const font = getSampleFont();
    const cache = new Map<string | number, unknown>();
    const declared = await measureTextLines({
      value,
      schema,
      font,
      _cache: cache,
      ignoreDynamicFontSize: true,
    });
    const shrunk = await measureTextLines({
      value,
      schema: { ...schema, overflow: 'visible' },
      font,
      _cache: cache,
      ignoreDynamicFontSize: false,
    });
    const result = await measureMvt(JSON.stringify({ body: value }), schema);

    expect(declared.fontSize).toBe(schema.fontSize);
    expect(shrunk.fontSize).toBeLessThan(declared.fontSize);
    expect(result.height ?? result.fragments?.reduce((sum, fragment) => sum + fragment.height, 0)).toBeCloseTo(
      declared.measuredHeight,
      6,
    );
  });

  test('empty resolved content keeps the authored height', async () => {
    const schema = createMeasureSchema({ text: '{body}', variables: ['body'], height: 12 });

    await expect(measureMvt(JSON.stringify({ body: '' }), schema)).resolves.toEqual({
      height: schema.height,
    });
  });

  test('a single unwrapped resolved line can still become one line fragment', async () => {
    const schema = createMeasureSchema({
      text: '{body}',
      variables: ['body'],
      position: { x: 0, y: 49 },
      width: 500,
      height: 1,
    });
    const result = await measureMvt(JSON.stringify({ body: 'singleunwrappedword' }), schema, {
      width: 100,
      height: 60,
      padding: [10, 10, 10, 10],
    });
    const fragments = expectFragments(result);

    expect(fragments).toHaveLength(1);
    expect(fragments[0].lineRange).toEqual({ start: 0, end: 1 });
  });
});

describe('multiVariableText variable scanning', () => {
  it('should record variable start indices for well-formed placeholders', () => {
    const indices = getVariableIndices('{first} {second}');

    expect(indices.get(0)).toBe('first');
    expect(indices.get(8)).toBe('second');
  });

  it('should restart from the latest opening brace in malformed input', () => {
    expect(getVariableNames('Hello {{name}}')).toEqual(['name']);
  });

  it('should match the innermost completed placeholder when braces are nested', () => {
    expect(getVariableNames('{a{b}')).toEqual(['b']);
  });

  it('should count only unique completed variable names', () => {
    expect(countUniqueVariableNames('{name} {name} {city')).toBe(1);
  });
});

describe('validateVariables', () => {
  // @ts-ignore
  const schema: MultiVariableTextSchema = {
    name: 'test',
    variables: ['var1', 'var2'],
    required: true,
  };

  it('should return true for valid input with all required variables', () => {
    const value = JSON.stringify({ var1: 'value1', var2: 'value2' });
    expect(validateVariables(value, schema)).toBe(true);
  });

  it('should throw an error for missing required variables', () => {
    const value = JSON.stringify({ var1: 'value1' });
    expect(() => validateVariables(value, schema)).toThrow(
      '[@pdfweave/generator] variable var2 is missing for field test'
    );
  });

  it('should return false for missing non-required variables', () => {
    // @ts-ignore
    const nonRequiredSchema: MultiVariableTextSchema = {
      name: 'test',
      variables: ['var1', 'var2'],
      required: false,
    };
    const value = JSON.stringify({ var1: 'value1' });
    expect(validateVariables(value, nonRequiredSchema)).toBe(false);
  });

  it('should throw an error for invalid JSON input', () => {
    const value = '{ var1: value1 var2: value2 }'; // Invalid JSON
    expect(() => validateVariables(value, schema)).toThrow(SyntaxError);
  });

  it('should return true for a string with no variables', () => {
    // @ts-ignore
    const readOnlyText: MultiVariableTextSchema = {
      name: 'test',
      variables: [],
      required: true,
    };
    const value = '';
    expect(validateVariables(value, readOnlyText)).toBe(true);
  });

  it('should return false for a string with variables but no input JSON and required set to false', () => {
    // @ts-ignore
    const readOnlyText: MultiVariableTextSchema = {
      variables: ['var'],
      required: false,
    };
    const value = '';
    expect(validateVariables(value, readOnlyText)).toBe(false);
  });
});
