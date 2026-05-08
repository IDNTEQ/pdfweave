import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDynamicTemplate,
  getDynamicHeights,
  PAGE_BREAK_SCHEMA_TYPE,
} from '../src/dynamicTemplate.js';
import { Template, Schema, Font, Plugin, BasePdf } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sansData = readFileSync(path.join(__dirname, `/assets/fonts/NotoSans-Regular.ttf`));
const serifData = readFileSync(path.join(__dirname, `/assets/fonts/NotoSerif-Regular.ttf`));

const getSampleFont = (): Font => ({
  NotoSans: { fallback: true, data: sansData },
  NotoSerif: { data: serifData },
});

describe('getDynamicTemplate', () => {
  const height = 10;
  const aPositionY = 10;
  const bPositionY = 30;
  const padding = 10;
  const template: Template = {
    schemas: [
      [
        {
          name: 'a',
          content: 'a',
          type: 'a',
          position: { x: 10, y: aPositionY },
          width: 10,
          height,
        },
        {
          name: 'b',
          content: 'b',
          type: 'b',
          position: { x: 10, y: bPositionY },
          width: 10,
          height,
        },
      ],
    ],
    basePdf: { width: 100, height: 100, padding: [padding, padding, padding, padding] },
  };

  const input = { a: 'a', b: 'b' };
  const options = { font: getSampleFont() };
  const _cache = new Map();
  const getDynamicTemplateArg = { template, input, options, _cache };

  const createGetDynamicTemplateArg = (increaseHeights: number[], bHeight?: number) => ({
    ...getDynamicTemplateArg,
    getDynamicHeights: async (value: string, args: { schema: Schema }) => {
      if (args.schema.type === 'a') {
        return Promise.resolve(increaseHeights);
      }
      return Promise.resolve([bHeight || args.schema.height]);
    },
  });

  const verifyBasicStructure = (dynamicTemplate: Template) => {
    expect(dynamicTemplate.schemas).toBeDefined();
    expect(Array.isArray(dynamicTemplate.schemas)).toBe(true);
    expect(dynamicTemplate.basePdf).toEqual({
      width: 100,
      height: 100,
      padding: [padding, padding, padding, padding],
    });
  };

  describe('Single page scenarios', () => {
    test('should handle no page break', async () => {
      const increaseHeights = [10, 10, 10, 10, 10];
      const dynamicTemplate = await getDynamicTemplate(
        createGetDynamicTemplateArg(increaseHeights),
      );

      verifyBasicStructure(dynamicTemplate);
      expect(dynamicTemplate.schemas.length).toBe(1);
      expect(dynamicTemplate.schemas[0][0].position.y).toEqual(aPositionY);
      expect(dynamicTemplate.schemas[0][0].name).toEqual('a');
      expect(dynamicTemplate.schemas[0][1].position.y).toEqual(
        increaseHeights.reduce((a, b) => a + b, 0) - height + bPositionY,
      );
      expect(dynamicTemplate.schemas[0][1].name).toEqual('b');
    });

    test('should resolve bounded two-axis anchors before dynamic height offsets', async () => {
      const anchoredTemplate: Template = {
        schemas: [
          [
            {
              name: 'table',
              content: 'table',
              type: 'table',
              position: { x: 20, y: 20 },
              width: 50,
              height: 10,
            },
            {
              name: 'total',
              content: 'total',
              type: 'text',
              position: { x: 0, y: 0 },
              width: 20,
              height: 10,
              layout: {
                mode: 'anchored',
                x: { mode: 'alignRightEdge', ref: { schemaId: 'table' } },
                y: { mode: 'belowBottomEdge', ref: { schemaId: 'table' }, offsetMm: 10 },
              },
            },
            {
              name: 'qr',
              content: 'qr',
              type: 'text',
              position: { x: 0, y: 0 },
              width: 8,
              height: 8,
              layout: {
                mode: 'anchored',
                x: { mode: 'afterRightEdge', ref: { schemaId: 'total' }, offsetMm: 5 },
                y: { mode: 'pageTop', offsetMm: 12 },
              },
            },
          ],
        ],
        basePdf: { width: 100, height: 100, padding: [padding, padding, padding, padding] },
      };
      const originalTemplateJson = JSON.stringify(anchoredTemplate);

      const dynamicTemplate = await getDynamicTemplate({
        template: anchoredTemplate,
        input: { table: 'table', total: 'total', qr: 'qr' },
        options,
        _cache,
        getDynamicLayout: async (_value: string, args: { schema: Schema }) => {
          if (args.schema.type === 'table') {
            return { dynamicHeights: [10, 10, 10, 10], height: 40 };
          }
          return { width: args.schema.width, height: args.schema.height };
        },
      });

      const total = dynamicTemplate.schemas[0].find((schema) => schema.name === 'total');
      const qr = dynamicTemplate.schemas[0].find((schema) => schema.name === 'qr');

      expect(total?.position.x).toBe(50);
      expect(total?.position.y).toBe(70);
      expect(qr?.position.x).toBe(75);
      expect(qr?.position.y).toBe(12);
      expect(JSON.stringify(anchoredTemplate)).toBe(originalTemplateJson);
    });

    test('should resolve anchors by stable schema id', async () => {
      const anchoredTemplate: Template = {
        schemas: [
          [
            {
              id: 'schema-table',
              name: 'renamedTable',
              content: 'table',
              type: 'table',
              position: { x: 20, y: 20 },
              width: 50,
              height: 10,
            },
            {
              id: 'schema-total',
              name: 'renamedTotal',
              content: 'total',
              type: 'text',
              position: { x: 0, y: 0 },
              width: 20,
              height: 10,
              layout: {
                mode: 'anchored',
                x: { mode: 'alignRightEdge', ref: { schemaId: 'schema-table' }, offsetMm: 0 },
                y: { mode: 'belowBottomEdge', ref: { schemaId: 'schema-table' }, offsetMm: 10 },
              },
            },
          ],
        ],
        basePdf: { width: 100, height: 100, padding: [padding, padding, padding, padding] },
      };

      const dynamicTemplate = await getDynamicTemplate({
        template: anchoredTemplate,
        input: { renamedTable: 'table', renamedTotal: 'total' },
        options,
        _cache,
      });

      const total = dynamicTemplate.schemas[0].find((schema) => schema.id === 'schema-total');

      expect(total?.position.x).toBe(50);
      expect(total?.position.y).toBe(40);
    });
  });

  describe('Multiple page scenarios', () => {
    test('should handle page break with a on page 1 and b on page 2', async () => {
      const increaseHeights = [20, 20, 20, 20];
      const dynamicTemplate = await getDynamicTemplate(
        createGetDynamicTemplateArg(increaseHeights),
      );

      verifyBasicStructure(dynamicTemplate);
      expect(dynamicTemplate.schemas.length).toBe(2);
      expect(dynamicTemplate.schemas[0][0].position.y).toEqual(aPositionY);
      expect(dynamicTemplate.schemas[0][0].name).toEqual('a');
      expect(dynamicTemplate.schemas[0][1]).toBeUndefined();
      expect(dynamicTemplate.schemas[1][0].name).toEqual('b');
      // b maintains its relative offset from a's end position
      // a ends at y=90 (page content), b was 20 units below a, so b is at y=10 in page coords + padding = 20
      expect(dynamicTemplate.schemas[1][0].position.y).toEqual(padding + padding);
      expect(dynamicTemplate.schemas[1][1]).toBeUndefined();
    });

    test('should handle page break with a on page 1 and 2, b on page 2', async () => {
      const increaseHeights = [20, 20, 20, 20, 20];
      const dynamicTemplate = await getDynamicTemplate(
        createGetDynamicTemplateArg(increaseHeights),
      );

      verifyBasicStructure(dynamicTemplate);
      expect(dynamicTemplate.schemas.length).toBe(2);
      expect(dynamicTemplate.schemas[0][0].position.y).toEqual(aPositionY);
      expect(dynamicTemplate.schemas[0][0].name).toEqual('a');
      expect(dynamicTemplate.schemas[0][1]).toBeUndefined();
      expect(dynamicTemplate.schemas[1][0].position.y).toEqual(padding);
      expect(dynamicTemplate.schemas[1][0].name).toEqual('a');
      expect(dynamicTemplate.schemas[1][1].position.y).toEqual(
        increaseHeights.slice(3).reduce((a, b) => a + b, 0) - height + padding,
      );
      expect(dynamicTemplate.schemas[1][1].name).toEqual('b');
    });

    test('should handle multiple page breaks', async () => {
      const increaseHeights = [50, 50, 50, 50, 50];
      const dynamicTemplate = await getDynamicTemplate(
        createGetDynamicTemplateArg(increaseHeights),
      );

      verifyBasicStructure(dynamicTemplate);
      expect(dynamicTemplate.schemas.length).toBe(5);

      // Verify 'a' elements across pages
      // Page 0: 'a' first segment (50px)
      expect(dynamicTemplate.schemas[0][0]).toBeDefined();
      expect(dynamicTemplate.schemas[0][0].position.y).toEqual(aPositionY);
      expect(dynamicTemplate.schemas[0][0].height).toEqual(50);
      expect(dynamicTemplate.schemas[0][0].name).toEqual('a');

      // Page 1: 'a' second segment (50px)
      expect(dynamicTemplate.schemas[1][0]).toBeDefined();
      expect(dynamicTemplate.schemas[1][0].position.y).toEqual(padding);
      expect(dynamicTemplate.schemas[1][0].height).toEqual(50);
      expect(dynamicTemplate.schemas[1][0].name).toEqual('a');

      // Page 2: 'a' third segment (50px)
      expect(dynamicTemplate.schemas[2][0]).toBeDefined();
      expect(dynamicTemplate.schemas[2][0].position.y).toEqual(padding);
      expect(dynamicTemplate.schemas[2][0].height).toEqual(50);
      expect(dynamicTemplate.schemas[2][0].name).toEqual('a');

      // Page 3: 'a' fourth segment (50px)
      expect(dynamicTemplate.schemas[3][0]).toBeDefined();
      expect(dynamicTemplate.schemas[3][0].position.y).toEqual(padding);
      expect(dynamicTemplate.schemas[3][0].height).toEqual(50);
      expect(dynamicTemplate.schemas[3][0].name).toEqual('a');

      // Page 4: 'a' fifth segment (50px) and 'b' element (10px)
      expect(dynamicTemplate.schemas[4][0]).toBeDefined();
      expect(dynamicTemplate.schemas[4][0].position.y).toEqual(padding);
      expect(dynamicTemplate.schemas[4][0].height).toEqual(50);
      expect(dynamicTemplate.schemas[4][0].name).toEqual('a');

      expect(dynamicTemplate.schemas[4][1]).toBeDefined();
      expect(dynamicTemplate.schemas[4][1].position.y).toEqual(70);
      expect(dynamicTemplate.schemas[4][1].height).toEqual(10);
      expect(dynamicTemplate.schemas[4][1].name).toEqual('b');
    });

    test('should handle both a and b on next page', async () => {
      const increaseHeights = [80, 10, 10];
      const dynamicTemplate = await getDynamicTemplate(
        createGetDynamicTemplateArg(increaseHeights),
      );

      verifyBasicStructure(dynamicTemplate);
      expect(dynamicTemplate.schemas.length).toBe(2);

      // Check first page
      expect(dynamicTemplate.schemas[0][0]).toBeDefined();
      expect(dynamicTemplate.schemas[0][0].position.y).toEqual(aPositionY);
      expect(dynamicTemplate.schemas[0][0].height).toEqual(80);
      expect(dynamicTemplate.schemas[0][1]).toBeUndefined();

      // Check second page
      expect(dynamicTemplate.schemas[1][0]).toBeDefined();
      expect(dynamicTemplate.schemas[1][0].position.y).toEqual(padding);
      expect(dynamicTemplate.schemas[1][0].height).toEqual(20);

      expect(dynamicTemplate.schemas[1][1]).toBeDefined();
      expect(dynamicTemplate.schemas[1][1].position.y).toBeGreaterThanOrEqual(
        dynamicTemplate.schemas[1][0].position.y + dynamicTemplate.schemas[1][0].height,
      );
    });
  });

  describe('Element height modifications', () => {
    test('should handle increased height for b', async () => {
      const increaseHeights = [10, 10, 10, 10, 10];
      const bHeight = 30;
      const dynamicTemplate = await getDynamicTemplate(
        createGetDynamicTemplateArg(increaseHeights, bHeight),
      );

      verifyBasicStructure(dynamicTemplate);
      expect(dynamicTemplate.schemas.length).toBe(2);

      // Check 'a' element
      expect(dynamicTemplate.schemas[0][0]).toBeDefined();
      expect(dynamicTemplate.schemas[0][0].position.y).toEqual(aPositionY);
      expect(dynamicTemplate.schemas[0][0].height).toEqual(50);
      expect(dynamicTemplate.schemas[0][0].name).toEqual('a');

      // Check 'b' element
      expect(dynamicTemplate.schemas[1][0]).toBeDefined();
      expect(dynamicTemplate.schemas[1][0].position.y).toEqual(padding);
      expect(dynamicTemplate.schemas[1][0].height).toEqual(bHeight);
      expect(dynamicTemplate.schemas[1][0].name).toEqual('b');
    });
  });

  describe('Validation (pdfme#1346)', () => {
    // Reproduces upstream pdfme#1346: a schema whose y is above the top
    // padding band crashed deep in the layout pass with an opaque
    // "Cannot read properties of undefined (reading 'push')". The fix
    // throws a clear validation error before generation runs.
    test('throws a clear error when schema.position.y < paddingTop', async () => {
      const badTemplate: Template = {
        schemas: [
          [
            {
              name: 'tooHigh',
              type: 'text',
              content: 'x',
              position: { x: 10, y: 10 },
              width: 50,
              height: 10,
            },
          ],
        ],
        basePdf: { width: 100, height: 100, padding: [20, 10, 10, 10] },
      };

      await expect(
        getDynamicTemplate({
          template: badTemplate,
          input: { tooHigh: 'x' },
          options: {},
          _cache: new Map(),
        }),
      ).rejects.toThrow(
        '[@pdfweave/common] Schema "tooHigh" position.y (10) must be >= basePdf.padding[0] (20).',
      );
    });

    test('accepts schema.position.y == paddingTop without throwing', async () => {
      const okTemplate: Template = {
        schemas: [
          [
            {
              name: 'flush',
              type: 'text',
              content: 'x',
              position: { x: 10, y: 20 },
              width: 50,
              height: 10,
            },
          ],
        ],
        basePdf: { width: 100, height: 100, padding: [20, 10, 10, 10] },
      };

      const dynamicTemplate = await getDynamicTemplate({
        template: okTemplate,
        input: { flush: 'x' },
        options: {},
        _cache: new Map(),
      });
      expect(dynamicTemplate.schemas[0][0].name).toBe('flush');
    });

    test('skips anchored schemas — their final y is computed during reflow', async () => {
      // An anchored schema may declare position.y = 0 because reflow
      // overwrites it; that must NOT trip the up-front validator.
      const anchoredTemplate: Template = {
        schemas: [
          [
            {
              name: 'anchor',
              type: 'text',
              content: 'a',
              position: { x: 10, y: 25 },
              width: 50,
              height: 10,
            },
            {
              name: 'follower',
              type: 'text',
              content: 'b',
              position: { x: 0, y: 0 },
              width: 50,
              height: 10,
              layout: {
                mode: 'anchored',
                x: { mode: 'pageLeft', offsetMm: 10 },
                y: { mode: 'belowBottomEdge', ref: { schemaId: 'anchor' }, offsetMm: 5 },
              },
            },
          ],
        ],
        basePdf: { width: 100, height: 100, padding: [20, 10, 10, 10] },
      };

      const dynamicTemplate = await getDynamicTemplate({
        template: anchoredTemplate,
        input: { anchor: 'a', follower: 'b' },
        options: {},
        _cache: new Map(),
      });
      expect(dynamicTemplate.schemas[0].length).toBe(2);
    });
  });

  describe('Edge cases', () => {
    test('should handle empty increase heights', async () => {
      const increaseHeights: number[] = [];
      const dynamicTemplate = await getDynamicTemplate(
        createGetDynamicTemplateArg(increaseHeights),
      );

      verifyBasicStructure(dynamicTemplate);
      expect(dynamicTemplate.schemas.length).toBe(1);
      // Both schemas are placed; 'a' with height 0, 'b' follows
      expect(dynamicTemplate.schemas[0][0]).toBeDefined();
      expect(dynamicTemplate.schemas[0][0].name).toEqual('a');
      expect(dynamicTemplate.schemas[0][0].height).toEqual(0);
      expect(dynamicTemplate.schemas[0][1]).toBeDefined();
      expect(dynamicTemplate.schemas[0][1].name).toEqual('b');
    });

    test('should handle very large increase heights', async () => {
      const increaseHeights = [1000, 1000];
      const dynamicTemplate = await getDynamicTemplate(
        createGetDynamicTemplateArg(increaseHeights),
      );

      verifyBasicStructure(dynamicTemplate);
      expect(dynamicTemplate.schemas.length).toBeGreaterThan(1);
    });
  });

  describe('Long page flow (cross-template-page)', () => {
    test('should process pages independently - static pages are added as-is without offset propagation', async () => {
      // New behavior: pages without dynamic content are added as-is,
      // without being affected by previous page's table expansion.
      // This reduces computation cost by skipping layout calculations for static pages.
      const templateWithTwoPages: Template = {
        schemas: [
          [
            {
              name: 'table',
              content: 'table',
              type: 'table',
              position: { x: 10, y: 60 },
              width: 80,
              height: 10,
            },
          ],
          [
            {
              name: 'text',
              content: 'text',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 80,
              height: 10,
            },
          ],
        ],
        basePdf: { width: 100, height: 100, padding: [10, 10, 10, 10] },
      };

      const dynamicTemplate = await getDynamicTemplate({
        template: templateWithTwoPages,
        input: { table: 'table', text: 'text' },
        options: { font: getSampleFont() },
        _cache: new Map(),
        getDynamicHeights: async (value: string, args: { schema: Schema }) => {
          if (args.schema.type === 'table') {
            return [10, 10, 10, 10]; // 40 total height, will cause page break
          }
          return [args.schema.height];
        },
      });

      verifyBasicStructure(dynamicTemplate);
      // Page 1: table starts at y=60, with 40 height, will split across pages
      // Page 2: table continuation
      // Page 3: text from template page 2 (added as-is, no offset propagation)
      expect(dynamicTemplate.schemas.length).toBe(3);

      // First page has table
      expect(dynamicTemplate.schemas[0].some((s) => s.name === 'table')).toBe(true);
      // Second page has table continuation
      expect(dynamicTemplate.schemas[1].some((s) => s.name === 'table')).toBe(true);
      // Third page has text (from template page 2, added as-is)
      expect(dynamicTemplate.schemas[2].some((s) => s.name === 'text')).toBe(true);

      // Text position should be unchanged from template (y=10)
      const textOnPage3 = dynamicTemplate.schemas[2].find((s) => s.name === 'text');
      expect(textOnPage3).toBeDefined();
      expect(textOnPage3!.position.y).toBe(10);
    });

    test('should keep static page schemas together with dynamic page when both on same template page', async () => {
      // When table and text are on the SAME template page, they should be processed together
      const templateWithOnePage: Template = {
        schemas: [
          [
            {
              name: 'table',
              content: 'table',
              type: 'table',
              position: { x: 10, y: 10 },
              width: 80,
              height: 10,
            },
            {
              name: 'text',
              content: 'text',
              type: 'text',
              position: { x: 10, y: 30 },
              width: 80,
              height: 10,
            },
          ],
        ],
        basePdf: { width: 100, height: 100, padding: [10, 10, 10, 10] },
      };

      const dynamicTemplate = await getDynamicTemplate({
        template: templateWithOnePage,
        input: { table: 'table', text: 'text' },
        options: { font: getSampleFont() },
        _cache: new Map(),
        getDynamicHeights: async (value: string, args: { schema: Schema }) => {
          if (args.schema.type === 'table') {
            return [10, 10, 10, 10]; // 40 total height
          }
          return [args.schema.height];
        },
      });

      verifyBasicStructure(dynamicTemplate);
      // Table expands from 10 to 40, pushing text down by 30
      // Both should still fit on one page (table ends at 50, text at 70)
      expect(dynamicTemplate.schemas.length).toBe(1);
      expect(dynamicTemplate.schemas[0].some((s) => s.name === 'table')).toBe(true);
      expect(dynamicTemplate.schemas[0].some((s) => s.name === 'text')).toBe(true);

      const table = dynamicTemplate.schemas[0].find((s) => s.name === 'table');
      const text = dynamicTemplate.schemas[0].find((s) => s.name === 'text');
      expect(table!.height).toBe(40);
      // Text should be pushed down: original y=30 + (40-10) offset = 60
      expect(text!.position.y).toBe(60);
    });
  });
});

describe('getDynamicHeights (generic plugin.measure dispatch)', () => {
  // Reproduces upstream pdfme/pdfme#1418: a custom schema (not type === 'table')
  // that exposes a `measure` hook should participate in dynamic-height layout
  // exactly like the built-in table plugin does.

  const baseSchema: Schema = {
    name: 'autoFitText',
    type: 'autoFitText',
    content: 'hello world',
    position: { x: 10, y: 10 },
    width: 80,
    height: 12,
  };

  const basePdf: BasePdf = {
    width: 100,
    height: 100,
    padding: [10, 10, 10, 10],
  };

  const measureArgs = {
    schema: baseSchema,
    basePdf,
    options: {},
    _cache: new Map<string | number, unknown>(),
  };

  test('returns the height reported by a custom plugin.measure hook', async () => {
    const customPlugin = {
      pdf: () => undefined,
      ui: () => undefined,
      propPanel: { schema: {}, defaultSchema: baseSchema },
      measure: async () => ({ width: baseSchema.width, height: 42 }),
    } as unknown as Plugin;

    const heights = await getDynamicHeights('hello world', measureArgs, customPlugin);
    expect(heights).toEqual([42]);
  });

  test('honours dynamicHeights from the measure result for splittable content', async () => {
    const splittablePlugin = {
      pdf: () => undefined,
      ui: () => undefined,
      propPanel: { schema: {}, defaultSchema: baseSchema },
      measure: async () => ({
        width: baseSchema.width,
        height: 30,
        dynamicHeights: [10, 10, 10],
      }),
    } as unknown as Plugin;

    const heights = await getDynamicHeights('a\nb\nc', measureArgs, splittablePlugin);
    expect(heights).toEqual([10, 10, 10]);
  });

  test('honours fragments from the measure result when dynamicHeights are absent', async () => {
    const fragmentingPlugin = {
      pdf: () => undefined,
      ui: () => undefined,
      propPanel: { schema: {}, defaultSchema: baseSchema },
      measure: async () => ({
        fragments: [
          { width: baseSchema.width, height: 25 },
          { width: baseSchema.width, height: 18 },
        ],
      }),
    } as unknown as Plugin;

    const heights = await getDynamicHeights('multi-page', measureArgs, fragmentingPlugin);
    expect(heights).toEqual([25, 18]);
  });

  test('fans out text lineRange fragments onto synthesized split chunks', async () => {
    const template: Template = {
      schemas: [
        [
          {
            name: 'expandText',
            type: 'text',
            content: '',
            position: { x: 10, y: 10 },
            width: 80,
            height: 10,
          },
        ],
      ],
      basePdf: { width: 100, height: 50, padding: [10, 10, 10, 10] },
    };

    const dynamicTemplate = await getDynamicTemplate({
      template,
      input: { expandText: 'x' },
      options: {},
      _cache: new Map(),
      getDynamicLayout: async () => ({
        fragments: [
          { height: 10, lineRange: { start: 0, end: 1 } },
          { height: 10, lineRange: { start: 1, end: 2 } },
          { height: 10, lineRange: { start: 2, end: 3 } },
          { height: 10, lineRange: { start: 3, end: 4 } },
        ],
      }),
    });

    expect(dynamicTemplate.schemas).toHaveLength(2);
    expect(dynamicTemplate.schemas[0][0]).toMatchObject({
      name: 'expandText',
      height: 30,
      __textLineRange: { start: 0, end: 3 },
    });
    expect(dynamicTemplate.schemas[1][0]).toMatchObject({
      name: 'expandText',
      height: 10,
      __textLineRange: { start: 3, end: 4 },
    });
    expect(dynamicTemplate.schemas[0][0].__bodyRange).toBeUndefined();
  });

  test('falls back to the static schema height when no plugin is registered', async () => {
    const heights = await getDynamicHeights('any', measureArgs, undefined);
    expect(heights).toEqual([baseSchema.height]);
  });

  test('falls back to the static schema height when the plugin has no measure hook', async () => {
    const renderOnlyPlugin = {
      pdf: () => undefined,
      ui: () => undefined,
      propPanel: { schema: {}, defaultSchema: baseSchema },
    } as unknown as Plugin;

    const heights = await getDynamicHeights('any', measureArgs, renderOnlyPlugin);
    expect(heights).toEqual([baseSchema.height]);
  });
});

describe('getDynamicTemplate staticSchema-aware reflow (pdfme#1434)', () => {
  // Reproduces upstream pdfme/pdfme#1434: when reflowing content (e.g. a
  // table) crosses pages, content from staticSchema gets painted under the
  // dynamic content area because the available page height was computed
  // from basePdf.padding alone, ignoring staticSchema's vertical extent.

  test('footer-like staticSchema reduces the available content height', async () => {
    // Page 100 mm tall, 5 mm padding all sides → naive contentHeight = 90.
    // A footer staticSchema at y=80, height=15 (extends to y=95, inside the
    // bottom padding band partially) should pull contentBottom up to y=80,
    // giving an effective contentHeight of 75 (80 - 5).
    const template: Template = {
      schemas: [
        [
          {
            name: 'reflowing',
            type: 'reflowing',
            content: '',
            position: { x: 10, y: 5 },
            width: 80,
            height: 10,
          },
        ],
      ],
      basePdf: {
        width: 100,
        height: 100,
        padding: [5, 5, 5, 5],
        staticSchema: [
          {
            name: 'footer',
            type: 'text',
            content: 'page footer',
            position: { x: 10, y: 80 },
            width: 80,
            height: 15,
          },
        ],
      },
    };

    // Two equally sized rows of 50 mm each = 100 mm of content.
    // Naive contentHeight (90) would fit one row + half the second on page 1.
    // Effective contentHeight (75) only fits one 50 mm row per page.
    const dynamicTemplate = await getDynamicTemplate({
      template,
      input: { reflowing: 'x' },
      options: {},
      _cache: new Map(),
      getDynamicHeights: async () => [50, 50],
    });

    // Expectation: each 50 mm row lands on its own page (footer present).
    expect(dynamicTemplate.schemas.length).toBe(2);

    // The reflowed schema must never extend below the footer's top edge (80).
    for (const page of dynamicTemplate.schemas) {
      for (const schema of page) {
        const bottom = schema.position.y + schema.height;
        expect(bottom).toBeLessThanOrEqual(80 + 0.01);
      }
    }
  });

  test('header-like staticSchema pushes reflow start downward', async () => {
    // A header staticSchema at y=2, height=20 (extends past padding[0]=5
    // into the content area) should move contentTop from 5 to 22.
    const template: Template = {
      schemas: [
        [
          {
            name: 'reflowing',
            type: 'reflowing',
            content: '',
            position: { x: 10, y: 5 },
            width: 80,
            height: 10,
          },
        ],
      ],
      basePdf: {
        width: 100,
        height: 100,
        padding: [5, 5, 5, 5],
        staticSchema: [
          {
            name: 'header',
            type: 'text',
            content: 'page header',
            position: { x: 10, y: 2 },
            width: 80,
            height: 20,
          },
        ],
      },
    };

    const dynamicTemplate = await getDynamicTemplate({
      template,
      input: { reflowing: 'x' },
      options: {},
      _cache: new Map(),
      getDynamicHeights: async () => [10],
    });

    // The reflowed schema should sit at-or-below the header's bottom edge (22).
    expect(dynamicTemplate.schemas[0][0].position.y).toBeGreaterThanOrEqual(22 - 0.01);
  });

  test('side-margin staticSchema (no horizontal overlap) does not change reflow', async () => {
    // A staticSchema entirely inside the right padding band — does not
    // collide with reflowing content and should not change page bounds.
    const template: Template = {
      schemas: [
        [
          {
            name: 'reflowing',
            type: 'reflowing',
            content: '',
            position: { x: 10, y: 5 },
            width: 80,
            height: 10,
          },
        ],
      ],
      basePdf: {
        width: 100,
        height: 100,
        padding: [5, 5, 5, 10],
        staticSchema: [
          {
            name: 'sideDecoration',
            type: 'text',
            content: '|',
            position: { x: 96, y: 30 },
            width: 3,
            height: 40,
          },
        ],
      },
    };

    // Two 50 mm rows. With NO staticSchema impact, naive contentHeight=90
    // fits row 1 (50) on page 1 and row 2 (50) on page 2 — i.e. 2 pages
    // because together they exceed 90.
    const dynamicTemplate = await getDynamicTemplate({
      template,
      input: { reflowing: 'x' },
      options: {},
      _cache: new Map(),
      getDynamicHeights: async () => [50, 50],
    });

    expect(dynamicTemplate.schemas.length).toBe(2);
    // Reflowed first row stays at the original padding-derived top (5).
    expect(dynamicTemplate.schemas[0][0].position.y).toBe(5);
  });
});

describe('pageBreak schema type (pdfme#637)', () => {
  // Reproduces upstream pdfme#637: a built-in primitive that forces
  // subsequent schemas onto a new page during the dynamic reflow pass —
  // CSS `break-before: page`. The layout engine recognises the type tag
  // and emits no rendered output for the marker itself; the paired
  // render-time plugin (a no-op) ships in @pdfweave/schemas.
  test('exports the type marker constant', () => {
    expect(PAGE_BREAK_SCHEMA_TYPE).toBe('pageBreak');
  });

  test('a [text, pageBreak, text] template puts the second text on page 2', async () => {
    const template: Template = {
      schemas: [
        [
          {
            name: 'first',
            type: 'text',
            content: 'first',
            position: { x: 10, y: 10 },
            width: 80,
            height: 10,
          },
          {
            name: 'br',
            type: PAGE_BREAK_SCHEMA_TYPE,
            content: '',
            position: { x: 0, y: 30 },
            width: 0,
            height: 0,
          },
          {
            name: 'second',
            type: 'text',
            content: 'second',
            position: { x: 10, y: 50 },
            width: 80,
            height: 10,
          },
        ],
      ],
      basePdf: { width: 100, height: 100, padding: [10, 10, 10, 10] },
    };

    const dynamicTemplate = await getDynamicTemplate({
      template,
      input: { first: 'first', second: 'second' },
      options: {},
      _cache: new Map(),
    });

    // Two pages: first text on page 1, second text on page 2.
    // The pageBreak itself is not emitted to the rendered output.
    expect(dynamicTemplate.schemas.length).toBe(2);
    expect(dynamicTemplate.schemas[0].some((s) => s.name === 'first')).toBe(true);
    expect(dynamicTemplate.schemas[0].some((s) => s.name === 'second')).toBe(false);
    expect(dynamicTemplate.schemas[1].some((s) => s.name === 'second')).toBe(true);

    // No pageBreak markers leak into the rendered output.
    for (const page of dynamicTemplate.schemas) {
      for (const schema of page) {
        expect(schema.type).not.toBe(PAGE_BREAK_SCHEMA_TYPE);
      }
    }
  });
});

describe('Same Y position scenarios (horizontal layout) — pdfme#1489', () => {
  // Two expandable schemas placed side by side at the same baseY must not
  // affect each other's position when one expands. Schemas below the group
  // get pushed down by the group's largest expansion, not by each
  // member's individual expansion.
  //
  // Backported from upstream pdfme/pdfme#1489 (5 cases) + 2 PDFweave-
  // specific cases covering the pageBreak primitive interaction and
  // anchored siblings (which exercise the same engine path).

  const sameYBasePdf: BasePdf = { width: 200, height: 200, padding: [10, 10, 10, 10] };

  test('side-by-side siblings: one expands, the other stays put', async () => {
    const template: Template = {
      basePdf: sameYBasePdf,
      schemas: [
        [
          { name: 'a', content: 'a', type: 'a', position: { x: 10, y: 10 }, width: 80, height: 10 },
          { name: 'b', content: 'b', type: 'b', position: { x: 100, y: 10 }, width: 80, height: 10 },
        ],
      ],
    };

    const dynamic = await getDynamicTemplate({
      template,
      input: { a: 'a', b: 'b' },
      options: {},
      _cache: new Map(),
      getDynamicHeights: async (_value, args: { schema: Schema }) => {
        if (args.schema.name === 'a') return [10, 10, 10]; // +20
        return [args.schema.height];
      },
    });

    expect(dynamic.schemas.length).toBe(1);
    const a = dynamic.schemas[0].find((s) => s.name === 'a');
    const b = dynamic.schemas[0].find((s) => s.name === 'b');
    expect(a?.position.y).toBe(10);
    expect(a?.height).toBe(30);
    // b is at the same Y as a and must remain at its original position.
    expect(b?.position.y).toBe(10);
    expect(b?.height).toBe(10);
  });

  test('schema below same-Y group is pushed by the group\'s largest expansion', async () => {
    const template: Template = {
      basePdf: sameYBasePdf,
      schemas: [
        [
          { name: 'a', content: 'a', type: 'a', position: { x: 10, y: 10 }, width: 80, height: 10 },
          { name: 'b', content: 'b', type: 'b', position: { x: 100, y: 10 }, width: 80, height: 10 },
          { name: 'c', content: 'c', type: 'c', position: { x: 10, y: 30 }, width: 80, height: 10 },
        ],
      ],
    };

    const dynamic = await getDynamicTemplate({
      template,
      input: { a: 'a', b: 'b', c: 'c' },
      options: {},
      _cache: new Map(),
      getDynamicHeights: async (_value, args: { schema: Schema }) => {
        if (args.schema.name === 'a') return [10, 10, 10]; // +20
        return [args.schema.height];
      },
    });

    const a = dynamic.schemas[0].find((s) => s.name === 'a');
    const b = dynamic.schemas[0].find((s) => s.name === 'b');
    const c = dynamic.schemas[0].find((s) => s.name === 'c');
    expect(a?.position.y).toBe(10);
    expect(b?.position.y).toBe(10);
    // c sits below the group; pushed down by the max group expansion (+20).
    expect(c?.position.y).toBe(50);
  });

  test('near-Y schemas (overlapping ranges) are treated as one group', async () => {
    // y=20 and y=21 with height=10 each: ranges [20,30] and [21,31] overlap.
    // Manual placement drift of 1pt should not split them into separate groups.
    const template: Template = {
      basePdf: sameYBasePdf,
      schemas: [
        [
          { name: 'a', content: 'a', type: 'a', position: { x: 10, y: 20 }, width: 80, height: 10 },
          { name: 'b', content: 'b', type: 'b', position: { x: 100, y: 21 }, width: 80, height: 10 },
        ],
      ],
    };

    const dynamic = await getDynamicTemplate({
      template,
      input: { a: 'a', b: 'b' },
      options: {},
      _cache: new Map(),
      getDynamicHeights: async (_value, args: { schema: Schema }) => {
        if (args.schema.name === 'a') return [10, 10, 10];
        return [args.schema.height];
      },
    });

    const a = dynamic.schemas[0].find((s) => s.name === 'a');
    const b = dynamic.schemas[0].find((s) => s.name === 'b');
    expect(a?.position.y).toBe(20);
    expect(a?.height).toBe(30);
    // b overlaps a's range, so it stays at its original y=21.
    expect(b?.position.y).toBe(21);
    expect(b?.height).toBe(10);
  });

  test('larger expansion wins when both same-Y schemas expand', async () => {
    const template: Template = {
      basePdf: sameYBasePdf,
      schemas: [
        [
          { name: 'a', content: 'a', type: 'a', position: { x: 10, y: 10 }, width: 80, height: 10 },
          { name: 'b', content: 'b', type: 'b', position: { x: 100, y: 10 }, width: 80, height: 10 },
          { name: 'c', content: 'c', type: 'c', position: { x: 10, y: 30 }, width: 80, height: 10 },
        ],
      ],
    };

    const dynamic = await getDynamicTemplate({
      template,
      input: { a: 'a', b: 'b', c: 'c' },
      options: {},
      _cache: new Map(),
      getDynamicHeights: async (_value, args: { schema: Schema }) => {
        if (args.schema.name === 'a') return [10, 10]; // +10
        if (args.schema.name === 'b') return [10, 10, 10]; // +20
        return [args.schema.height];
      },
    });

    const a = dynamic.schemas[0].find((s) => s.name === 'a');
    const b = dynamic.schemas[0].find((s) => s.name === 'b');
    const c = dynamic.schemas[0].find((s) => s.name === 'c');
    expect(a?.position.y).toBe(10);
    expect(b?.position.y).toBe(10);
    // c is pushed down by max(b's +20, a's +10) = +20.
    expect(c?.position.y).toBe(50);
  });

  test('schemas below same-Y group correct after a sibling spans pages', async () => {
    const template: Template = {
      basePdf: sameYBasePdf,
      schemas: [
        [
          { name: 'a', content: 'a', type: 'a', position: { x: 10, y: 10 }, width: 80, height: 10 },
          { name: 'b', content: 'b', type: 'b', position: { x: 100, y: 10 }, width: 80, height: 10 },
          { name: 'c', content: 'c', type: 'c', position: { x: 10, y: 30 }, width: 80, height: 10 },
        ],
      ],
    };

    const dynamic = await getDynamicTemplate({
      template,
      input: { a: 'a', b: 'b', c: 'c' },
      options: {},
      _cache: new Map(),
      getDynamicHeights: async (_value, args: { schema: Schema }) => {
        if (args.schema.name === 'a') return [90, 90, 30];
        return [args.schema.height];
      },
    });

    expect(dynamic.schemas.length).toBe(2);
    const firstPageA = dynamic.schemas[0].find((s) => s.name === 'a');
    const firstPageB = dynamic.schemas[0].find((s) => s.name === 'b');
    const secondPageA = dynamic.schemas[1].find((s) => s.name === 'a');
    const secondPageC = dynamic.schemas[1].find((s) => s.name === 'c');
    expect(firstPageA?.position.y).toBe(10);
    expect(firstPageA?.height).toBe(180);
    expect(firstPageB?.position.y).toBe(10);
    expect(firstPageB?.height).toBe(10);
    expect(secondPageA?.position.y).toBe(10);
    expect(secondPageA?.height).toBe(30);
    // c preserves its original 10pt gap below the same-Y group after a splits.
    expect(secondPageC?.position.y).toBe(50);
    expect(secondPageC?.height).toBe(10);
  });

  test('PDFweave: pageBreak commits the current same-Y group', async () => {
    // Adaptation specific to pdfweave's pageBreak primitive (pdfme#637).
    // A and B form a same-Y group on page 1; A expands (+20). The
    // pageBreak between the group and C must commit the group BEFORE
    // snapping to page 2, so C lands at the top of page 2 (no extra
    // accumulated offset). Without the commitGroup() call at the
    // page-break branch, C would be pushed an extra ~20pt past the
    // page-2 origin.
    const template: Template = {
      basePdf: sameYBasePdf,
      schemas: [
        [
          { name: 'a', content: 'a', type: 'a', position: { x: 10, y: 10 }, width: 80, height: 10 },
          { name: 'b', content: 'b', type: 'b', position: { x: 100, y: 10 }, width: 80, height: 10 },
          {
            name: 'br',
            type: PAGE_BREAK_SCHEMA_TYPE,
            content: '',
            position: { x: 0, y: 30 },
            width: 0,
            height: 0,
          },
          { name: 'c', content: 'c', type: 'c', position: { x: 10, y: 50 }, width: 80, height: 10 },
        ],
      ],
    };

    const dynamic = await getDynamicTemplate({
      template,
      input: { a: 'a', b: 'b', c: 'c' },
      options: {},
      _cache: new Map(),
      getDynamicHeights: async (_value, args: { schema: Schema }) => {
        if (args.schema.name === 'a') return [10, 10, 10]; // +20
        return [args.schema.height];
      },
    });

    expect(dynamic.schemas.length).toBe(2);
    const firstPageA = dynamic.schemas[0].find((s) => s.name === 'a');
    const firstPageB = dynamic.schemas[0].find((s) => s.name === 'b');
    const secondPageC = dynamic.schemas[1].find((s) => s.name === 'c');
    expect(firstPageA?.position.y).toBe(10);
    expect(firstPageA?.height).toBe(30);
    expect(firstPageB?.position.y).toBe(10);
    // pageBreak is at template y=30, c is at template y=50 — a 20pt
    // baseY gap. After snap to page 2, c preserves that gap below
    // page 2's content top (paddingTop=10): template y=30.
    // Without commitGroup() at the pageBreak branch, the group's +20
    // expansion would not be folded into the snap accounting and c
    // would land at template y=20 instead.
    expect(secondPageC?.position.y).toBe(30);
    expect(secondPageC?.height).toBe(10);
  });

  test('PDFweave: anchored same-Y siblings stay at their pageTop offset', async () => {
    // Anchored schemas pass through the same processDynamicPage path,
    // so two pageTop-anchored siblings at the same Y were also affected
    // by the same-Y bug. With the grouped-offset fix, they too remain
    // at their original Y when one expands.
    const template: Template = {
      basePdf: sameYBasePdf,
      schemas: [
        [
          {
            name: 'a',
            content: 'a',
            type: 'a',
            position: { x: 10, y: 10 },
            width: 80,
            height: 10,
            layout: { mode: 'anchored', x: { mode: 'pageLeft', offsetMm: 10 }, y: { mode: 'pageTop', offsetMm: 10 } },
          } as Schema,
          {
            name: 'b',
            content: 'b',
            type: 'b',
            position: { x: 100, y: 10 },
            width: 80,
            height: 10,
            layout: { mode: 'anchored', x: { mode: 'pageLeft', offsetMm: 100 }, y: { mode: 'pageTop', offsetMm: 10 } },
          } as Schema,
        ],
      ],
    };

    const dynamic = await getDynamicTemplate({
      template,
      input: { a: 'a', b: 'b' },
      options: {},
      _cache: new Map(),
      getDynamicHeights: async (_value, args: { schema: Schema }) => {
        if (args.schema.name === 'a') return [10, 10, 10];
        return [args.schema.height];
      },
    });

    const a = dynamic.schemas[0].find((s) => s.name === 'a');
    const b = dynamic.schemas[0].find((s) => s.name === 'b');
    expect(a?.position.y).toBe(10);
    expect(a?.height).toBe(30);
    expect(b?.position.y).toBe(10);
    expect(b?.height).toBe(10);
  });
});
