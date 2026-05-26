import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDynamicTemplate,
  getDynamicHeights,
  PAGE_BREAK_SCHEMA_TYPE,
  sanitizeHeight,
  sanitizeHeights,
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
    // The "should handle no page break" test was deleted in Phase 4 of
    // RFC 0001 — it asserted that absolute schema `b` is pushed down
    // when its predecessor `a` (also absolute) expands. Under Option C
    // (Phase 4), absolute means literal coords and does not move.
    // Templates that depended on that flow propagation must be migrated
    // via `migrateTemplateToAnchored` (chain-anchored predecessors).

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

  // Multiple page scenarios + Element height modifications: removed in
  // Phase 4 of RFC 0001. They asserted the engine's `totalYOffset`
  // grouped-offset flow propagation (e.g. "absolute b is pushed onto
  // page 2 because absolute a expanded across page 1"). Under Option C
  // that propagation is gone — absolute means literal coords. The
  // anchored equivalent (chain-anchored b → belowBottomEdge of a) is
  // what `migrateTemplateToAnchored` produces, and is exercised by the
  // generator-package playground integration tests.

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

    // "should keep static page schemas together with dynamic page when
    // both on same template page" was deleted in Phase 4 — under
    // Option C, an absolute text below an absolute (dynamic) table is
    // NOT pushed by the table's expansion. The migration script
    // chain-anchors them; the chain-anchored equivalent is exercised
    // by the generator-package playground integration tests.
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
  // The PAGE_BREAK_SCHEMA_TYPE constant remains exported for the
  // migration tool's skip logic and any third-party code that still
  // references it. The runtime "force next page" semantics that
  // pdfme#637 originally added were tied to the engine's grouped-offset
  // flow; that flow is gone in Phase 4 (RFC 0001), so a pageBreak
  // marker now renders as a no-op in the layout engine. If/when an
  // anchored equivalent is requested, it'll arrive as a new anchor mode.
  test('exports the type marker constant', () => {
    expect(PAGE_BREAK_SCHEMA_TYPE).toBe('pageBreak');
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

  // The Phase 1 stop-gap (grouped offset, near-Y group detection,
  // pageBreak group commit) lived in `processDynamicPage` and was
  // deleted in Phase 4 along with the rest of the engine flow. Most
  // of these tests asserted that flow propagation (e.g. "absolute c
  // below the same-Y group is pushed down by the group's max
  // expansion"). Under Option C, absolute means literal coords —
  // there's nothing to push. The migration tool produces
  // chain-anchored equivalents, exercised end-to-end by the generator
  // package's playground integration snapshot tests.

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

describe('non-blank-PDF early return — anchor resolution only', () => {
  // For templates whose basePdf is a CustomPdf (base64 / URL), the
  // dynamic-reflow engine doesn't run at all — there's no measure pass
  // and no per-page page-break logic. We still resolve the anchor
  // graph so anchored schemas land at sensible coords. This branch
  // exists so that anchored layouts work in templates that paint over
  // an externally-supplied PDF page.
  test('resolves anchored schemas in topo order against declared heights', async () => {
    const template: Template = {
      // Custom-base64 PDF (CustomPdf) bypasses the reflow engine.
      basePdf:
        'data:application/pdf;base64,JVBERi0xLjcKJeLjz9MKNSAwIG9iago8PAovRmlsdGVyIC9GbGF0ZURlY29kZQovTGVuZ3RoIDM4Cj4+CnN0cmVhbQp4nCvkMlAwUDC1NNUzMVGwMDHUszRSKErlCtfiyuMK5AIAXQ8GCgplbmRzdHJlYW0KZW5kb2JqCjQgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL01lZGlhQm94IFswIDAgNTk1LjQ0IDg0MS45Ml0KL1Jlc291cmNlcyA8PAo+PgovQ29udGVudHMgNSAwIFIKL1BhcmVudCAyIDAgUgo+PgplbmRvYmoKMiAwIG9iago8PAovVHlwZSAvUGFnZXMKL0tpZHMgWzQgMCBSXQovQ291bnQgMQo+PgplbmRvYmoKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL3RyYXBwZWQgKGZhbHNlKQovQ3JlYXRvciAoU2VyaWYgQWZmaW5pdHkgRGVzaWduZXIgMS4xMC40KQovVGl0bGUgKFVudGl0bGVkLnBkZikKL0NyZWF0aW9uRGF0ZSAoRDoyMDIyMDEwNjE0MDg1OCswOScwMCcpCi9Qcm9kdWNlciAoaUxvdmVQREYpCi9Nb2REYXRlIChEOjIwMjIwMTA2MDUwOTA5WikKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL1NpemUgNwovUm9vdCAxIDAgUgovSW5mbyAzIDAgUgovSUQgWzwyODhCM0VENTAyOEU0MDcyNERBNzNCOUE0Nzk4OUEwQT4gPEY1RkJGNjg4NkVERDZBQUNBNDRCNEZDRjBBRDUxRDlDPl0KL1R5cGUgL1hSZWYKL1cgWzEgMiAyXQovRmlsdGVyIC9GbGF0ZURlY29kZQovSW5kZXggWzAgN10KL0xlbmd0aCAzNgo+PgpzdHJlYW0KeJxjYGD4/5+RUZmBgZHhFZBgDAGxakAEP5BgEmFgAABlRwQJCmVuZHN0cmVhbQplbmRvYmoKc3RhcnR4cmVmCjUzMgolJUVPRgo=',
      schemas: [
        [
          {
            name: 'header',
            content: 'header',
            type: 'text',
            position: { x: 10, y: 20 },
            width: 80,
            height: 10,
          },
          {
            name: 'body',
            content: 'body',
            type: 'text',
            position: { x: 0, y: 0 },
            width: 80,
            height: 30,
            layout: {
              mode: 'anchored',
              x: { mode: 'pageLeft', offsetMm: 10 },
              y: { mode: 'belowBottomEdge', ref: { schemaId: 'header' }, offsetMm: 5 },
            },
          },
        ],
      ],
    };

    const dynamic = await getDynamicTemplate({
      template,
      input: { header: 'h', body: 'b' },
      options: {},
      _cache: new Map(),
    });

    const body = dynamic.schemas[0].find((s) => s.name === 'body');
    // body.y = header.position.y (20) + header.height (10) + offset (5) = 35
    expect(body?.position.y).toBe(35);
  });
});

describe('Runtime anchor re-resolution (Phase 2 — RFC 0001)', () => {
  // Phase 2 wires the anchor graph as the runtime source of truth for
  // anchored schemas. Anchored items are placed by the topological
  // resolve walk in getDynamicTemplate using actual measured heights of
  // their dependencies; processDynamicPage skips them so their positions
  // are not double-shifted by the engine's grouped-offset flow.
  //
  // The four cases below cover the new code path:
  //   1. anchored chain (B belowBottomEdge of A; A dynamic)
  //   2. anchored siblings sharing a pageTop offset (A dynamic, B static)
  //   3. mixed-mode (B anchored to an absolute target whose content grows)
  //   4. two-axis deps (B X-anchored to A, Y-anchored to C; both dynamic)

  const phase2BasePdf: BasePdf = { width: 200, height: 400, padding: [10, 10, 10, 10] };

  test('anchored chain: B re-resolves below A using A\'s actual height', async () => {
    const template: Template = {
      basePdf: phase2BasePdf,
      schemas: [
        [
          {
            name: 'a',
            content: 'a',
            type: 'a',
            position: { x: 10, y: 10 },
            width: 80,
            height: 10,
          },
          {
            name: 'b',
            content: 'b',
            type: 'b',
            position: { x: 10, y: 20 },
            width: 80,
            height: 10,
            layout: {
              mode: 'anchored',
              x: { mode: 'pageLeft', offsetMm: 10 },
              y: { mode: 'belowBottomEdge', ref: { schemaId: 'a' }, offsetMm: 5 },
            },
          },
        ],
      ],
    };

    const dynamic = await getDynamicTemplate({
      template,
      input: { a: 'a', b: 'b' },
      options: {},
      _cache: new Map(),
      getDynamicHeights: async (_value, args: { schema: Schema }) => {
        if (args.schema.name === 'a') return [10, 10, 10]; // a expands 10 -> 30
        return [args.schema.height];
      },
    });

    const a = dynamic.schemas[0].find((s) => s.name === 'a');
    const b = dynamic.schemas[0].find((s) => s.name === 'b');
    expect(a?.position.y).toBe(10);
    expect(a?.height).toBe(30);
    // B = A.position.y (10) + A.actualHeight (30) + offset (5) = 45.
    // Pre-Phase-2 the answer happens to be the same via the engine's
    // grouped offset; this test asserts the topo walk produces it
    // independently of the engine.
    expect(b?.position.y).toBe(45);
  });

  test('anchored siblings at pageTop: one grows, the other stays put', async () => {
    const template: Template = {
      basePdf: phase2BasePdf,
      schemas: [
        [
          {
            name: 'a',
            content: 'a',
            type: 'a',
            position: { x: 10, y: 0 },
            width: 80,
            height: 10,
            layout: {
              mode: 'anchored',
              x: { mode: 'pageLeft', offsetMm: 10 },
              y: { mode: 'pageTop', offsetMm: 10 },
            },
          },
          {
            name: 'b',
            content: 'b',
            type: 'b',
            position: { x: 100, y: 0 },
            width: 80,
            height: 10,
            layout: {
              mode: 'anchored',
              x: { mode: 'pageLeft', offsetMm: 100 },
              y: { mode: 'pageTop', offsetMm: 10 },
            },
          },
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

    const a = dynamic.schemas[0].find((s) => s.name === 'a');
    const b = dynamic.schemas[0].find((s) => s.name === 'b');
    // Both anchored at pageTop offset 10; A's expansion does not affect B.
    // Anchored items skip the engine's grouped-offset pass entirely.
    expect(a?.position.y).toBe(10);
    expect(a?.height).toBe(30);
    expect(b?.position.y).toBe(10);
    expect(b?.height).toBe(10);
  });

  test('mixed mode: B anchored to absolute A; uses A\'s actual height', async () => {
    const template: Template = {
      basePdf: phase2BasePdf,
      schemas: [
        [
          {
            name: 'a',
            content: 'a',
            type: 'a',
            position: { x: 10, y: 50 },
            width: 80,
            height: 10,
          },
          {
            name: 'b',
            content: 'b',
            type: 'b',
            position: { x: 10, y: 20 },
            width: 80,
            height: 10,
            layout: {
              mode: 'anchored',
              x: { mode: 'pageLeft', offsetMm: 10 },
              y: { mode: 'belowBottomEdge', ref: { schemaId: 'a' }, offsetMm: 5 },
            },
          },
        ],
      ],
    };

    const dynamic = await getDynamicTemplate({
      template,
      input: { a: 'a', b: 'b' },
      options: {},
      _cache: new Map(),
      getDynamicHeights: async (_value, args: { schema: Schema }) => {
        if (args.schema.name === 'a') return [10, 10, 10]; // +20 actual
        return [args.schema.height];
      },
    });

    const a = dynamic.schemas[0].find((s) => s.name === 'a');
    const b = dynamic.schemas[0].find((s) => s.name === 'b');
    expect(a?.position.y).toBe(50);
    expect(a?.height).toBe(30);
    // B = A.position.y (50) + A.actualHeight (30) + offset (5) = 85.
    // The anchor reads A's measured height regardless of A's layout
    // mode — `mode: 'absolute'` fixes A's position, not its rendered
    // content height.
    expect(b?.position.y).toBe(85);
  });

  test('absolute item below an anchored item that grew stays at template y (Option C)', async () => {
    // Option C semantics: `mode: 'absolute'` means literal coords, never
    // pushed by neighbour growth. An anchored item growing into an
    // absolute neighbour's space results in visual overlap — that's
    // the user's contract. (Pre-Phase-2 the engine pushed b past a,
    // but that flow propagation is being deleted; Phase 4 ships a
    // migration script for templates that depended on it.)
    const template: Template = {
      basePdf: phase2BasePdf,
      schemas: [
        [
          {
            name: 'a',
            content: 'a',
            type: 'a',
            position: { x: 10, y: 0 },
            width: 80,
            height: 10,
            layout: {
              mode: 'anchored',
              x: { mode: 'pageLeft', offsetMm: 10 },
              y: { mode: 'pageTop', offsetMm: 0 },
            },
          },
          {
            name: 'b',
            content: 'b',
            type: 'b',
            position: { x: 10, y: 30 },
            width: 80,
            height: 10,
          },
        ],
      ],
    };

    const dynamic = await getDynamicTemplate({
      template,
      input: { a: 'a', b: 'b' },
      options: {},
      _cache: new Map(),
      getDynamicHeights: async (_value, args: { schema: Schema }) => {
        if (args.schema.name === 'a') return [10, 10, 10, 10, 10]; // a 10 -> 50
        return [args.schema.height];
      },
    });

    const a = dynamic.schemas[0].find((s) => s.name === 'a');
    const b = dynamic.schemas[0].find((s) => s.name === 'b');
    expect(a?.position.y).toBe(10);
    expect(a?.height).toBe(50);
    // b stays at template-declared y=30 even though a now extends from
    // y=10 to y=60. Overlap is intentional under Option C.
    expect(b?.position.y).toBe(30);
  });

  test('anchored item targets a (no-longer-pushed) absolute neighbour — uses literal y', async () => {
    // The Phase 2 version of this test asserted that an upstream
    // absolute X (dynamic) would push A (absolute, declared below X)
    // via the engine, and B (anchored to A) would resolve against A's
    // post-engine y. Phase 4 deletes that engine push: under Option C,
    // absolute items don't move regardless of upstream growth.
    // X grows but stays at y=10; A stays at y=30 even though X now
    // overlaps it. B (anchored to A) resolves against A's literal y=30.
    const template: Template = {
      basePdf: phase2BasePdf,
      schemas: [
        [
          {
            name: 'x',
            content: 'x',
            type: 'x',
            position: { x: 10, y: 10 },
            width: 80,
            height: 10,
          },
          {
            name: 'a',
            content: 'a',
            type: 'a',
            position: { x: 10, y: 30 },
            width: 80,
            height: 10,
          },
          {
            name: 'b',
            content: 'b',
            type: 'b',
            position: { x: 10, y: 0 },
            width: 80,
            height: 10,
            layout: {
              mode: 'anchored',
              x: { mode: 'pageLeft', offsetMm: 10 },
              y: { mode: 'belowBottomEdge', ref: { schemaId: 'a' }, offsetMm: 5 },
            },
          },
        ],
      ],
    };

    const dynamic = await getDynamicTemplate({
      template,
      input: { x: 'x', a: 'a', b: 'b' },
      options: {},
      _cache: new Map(),
      getDynamicHeights: async (_value, args: { schema: Schema }) => {
        if (args.schema.name === 'x') return [10, 10, 10, 10, 10]; // x 10 -> 50
        return [args.schema.height];
      },
    });

    const x = dynamic.schemas[0].find((s) => s.name === 'x');
    const a = dynamic.schemas[0].find((s) => s.name === 'a');
    const b = dynamic.schemas[0].find((s) => s.name === 'b');
    expect(x?.position.y).toBe(10);
    expect(x?.height).toBe(50);
    // a stays at template y=30 even though x now overlaps it (Option C).
    expect(a?.position.y).toBe(30);
    // b = a.position.y (30) + a.height (10) + offset (5) = 45.
    expect(b?.position.y).toBe(45);
  });

  test('anchored chain where upstream target paginates: B uses A\'s last-fragment bottom', async () => {
    // Regression for CodeRabbit feedback on PR #46:
    // anchored-to-anchored chain where the upstream target spans
    // pages. B targets A's bottom; A's actual content overflows page 1
    // and continues onto page 2. B must resolve against A's
    // LAST-fragment bottom (on page 2), not A's start-page-y +
    // measured-height (which would put B too high).
    //
    // Setup: drawable height = 90mm (page 110, padding 10/10). A is
    // anchored at pageTop, dynamic with 5×30mm fragments (total 150mm).
    // 3 rows fit per page (90mm drawable / 30mm row): rows 1-3 on
    // page 1 (y=10..100), rows 4-5 on page 2 (y=10..70). placeRowsOnPages
    // emits one chunk per page, so a's last fragment lands on page 2.
    const splitBasePdf: BasePdf = { width: 100, height: 110, padding: [10, 10, 10, 10] };
    const template: Template = {
      basePdf: splitBasePdf,
      schemas: [
        [
          {
            name: 'a',
            content: 'a',
            type: 'a',
            position: { x: 10, y: 0 },
            width: 80,
            height: 30,
            layout: {
              mode: 'anchored',
              x: { mode: 'pageLeft', offsetMm: 10 },
              y: { mode: 'pageTop', offsetMm: 0 },
            },
          },
          {
            name: 'b',
            content: 'b',
            type: 'b',
            position: { x: 10, y: 0 },
            width: 80,
            height: 10,
            layout: {
              mode: 'anchored',
              x: { mode: 'pageLeft', offsetMm: 10 },
              y: { mode: 'belowBottomEdge', ref: { schemaId: 'a' }, offsetMm: 5 },
            },
          },
        ],
      ],
    };

    const dynamic = await getDynamicTemplate({
      template,
      input: { a: 'a', b: 'b' },
      options: {},
      _cache: new Map(),
      getDynamicHeights: async (_value, args: { schema: Schema }) => {
        // a: five 30mm rows. With 90mm drawable, 3 rows fit per page.
        if (args.schema.name === 'a') return [30, 30, 30, 30, 30];
        return [args.schema.height];
      },
    });

    // a should split across two pages: 3 rows on page 1 (y=10..100),
    // 2 rows on page 2 (y=10..70).
    expect(dynamic.schemas.length).toBe(2);
    const aFragmentsP1 = dynamic.schemas[0].filter((s) => s.name === 'a');
    const aFragmentsP2 = dynamic.schemas[1].filter((s) => s.name === 'a');
    expect(aFragmentsP1.length).toBeGreaterThanOrEqual(1);
    expect(aFragmentsP2.length).toBeGreaterThanOrEqual(1);
    // a's last fragment lands on page 2.
    const aLast = aFragmentsP2[aFragmentsP2.length - 1];
    // b must land on page 2, below a's last fragment + offset 5.
    const b = dynamic.schemas[1].find((s) => s.name === 'b');
    expect(b).toBeDefined();
    expect(b?.position.y).toBe((aLast.position.y ?? 0) + (aLast.height ?? 0) + 5);
  });

  test('two-axis deps: B X-anchored to A, Y-anchored to C', async () => {
    const template: Template = {
      basePdf: phase2BasePdf,
      schemas: [
        [
          {
            name: 'a',
            content: 'a',
            type: 'a',
            position: { x: 20, y: 10 },
            width: 50,
            height: 10,
          },
          {
            name: 'c',
            content: 'c',
            type: 'c',
            position: { x: 10, y: 30 },
            width: 80,
            height: 10,
          },
          {
            name: 'b',
            content: 'b',
            type: 'b',
            position: { x: 0, y: 0 },
            width: 20,
            height: 10,
            layout: {
              mode: 'anchored',
              x: { mode: 'afterRightEdge', ref: { schemaId: 'a' }, offsetMm: 5 },
              y: { mode: 'belowBottomEdge', ref: { schemaId: 'c' }, offsetMm: 8 },
            },
          },
        ],
      ],
    };

    const dynamic = await getDynamicTemplate({
      template,
      input: { a: 'a', b: 'b', c: 'c' },
      options: {},
      _cache: new Map(),
      getDynamicHeights: async (_value, args: { schema: Schema }) => {
        if (args.schema.name === 'c') return [10, 10, 10, 10]; // c expands 10 -> 40
        return [args.schema.height];
      },
    });

    const a = dynamic.schemas[0].find((s) => s.name === 'a');
    const c = dynamic.schemas[0].find((s) => s.name === 'c');
    const b = dynamic.schemas[0].find((s) => s.name === 'b');
    expect(a?.position.y).toBe(10);
    expect(c?.height).toBe(40);
    // B.x = A.x (20) + A.width (50) + offset (5) = 75
    // B.y = C.position.y (30) + C.actualHeight (40) + offset (8) = 78
    expect(b?.position.x).toBe(75);
    expect(b?.position.y).toBe(78);
  });
});

describe('sanitizeHeight / sanitizeHeights (defensive guards)', () => {
  it('passes through valid positive heights', () => {
    expect(sanitizeHeight(42.5, 10)).toBe(42.5);
    expect(sanitizeHeights([10, 20.1, 0], 5)).toEqual([10, 20.1, 0]);
  });

  it('rejects NaN, negative, and Infinity and falls back to declared height', () => {
    expect(sanitizeHeight(NaN, 15)).toBe(15);
    expect(sanitizeHeight(-5, 15)).toBe(15);
    expect(sanitizeHeight(Infinity, 15)).toBe(15);
    expect(sanitizeHeights([NaN, -3, Infinity], 12)).toEqual([12, 12, 12]);
  });

  it('never returns negative fallback', () => {
    expect(sanitizeHeight(NaN, -7)).toBe(0);
  });
});

describe('Page-aware anchor resolution (Phase 3 — RFC 0001)', () => {
  // Phase 3 ratifies cross-page anchor refs. The mechanism is the
  // global-Y encoding from Phase 2's syncLastFragmentGeometry: when a
  // target paginates, its `position.y` is rewritten to
  // `lastPageIndex * contentHeight + lastFragmentY` so resolveAnchorY's
  // `target.position.y + target.height` arithmetic yields the bottom
  // edge in global-Y space, and placeRowsOnPages's
  // `floor(globalY / contentHeight)` derivation places the dependent
  // on the correct page. These tests cover the cases that go beyond
  // the single Phase-2 paginated-target test.

  // Drawable height = 90mm (page 110, padding 10/10). Wide pages so
  // X-position arithmetic doesn't interfere with the cross-page Y tests.
  const splitBasePdf: BasePdf = { width: 200, height: 110, padding: [10, 10, 10, 10] };

  test('anchored chain where two upstream items both paginate (A → B → C)', async () => {
    // A paginates (5×30mm = 150mm > 90mm drawable → 2 pages),
    // B (anchored below A) also paginates (4×30mm = 120mm), and C
    // (anchored below B) lands wherever B's last fragment ends. The
    // Pass 3 sync-after-each-anchored-placement chain must propagate
    // each link's last-fragment global-Y forward.
    const template: Template = {
      basePdf: splitBasePdf,
      schemas: [
        [
          {
            name: 'a',
            content: 'a',
            type: 'a',
            position: { x: 10, y: 0 },
            width: 80,
            height: 30,
            layout: {
              mode: 'anchored',
              x: { mode: 'pageLeft', offsetMm: 10 },
              y: { mode: 'pageTop', offsetMm: 0 },
            },
          },
          {
            name: 'b',
            content: 'b',
            type: 'b',
            position: { x: 10, y: 0 },
            width: 80,
            height: 30,
            layout: {
              mode: 'anchored',
              x: { mode: 'pageLeft', offsetMm: 10 },
              y: { mode: 'belowBottomEdge', ref: { schemaId: 'a' }, offsetMm: 0 },
            },
          },
          {
            name: 'c',
            content: 'c',
            type: 'c',
            position: { x: 10, y: 0 },
            width: 80,
            height: 10,
            layout: {
              mode: 'anchored',
              x: { mode: 'pageLeft', offsetMm: 10 },
              y: { mode: 'belowBottomEdge', ref: { schemaId: 'b' }, offsetMm: 5 },
            },
          },
        ],
      ],
    };

    const dynamic = await getDynamicTemplate({
      template,
      input: { a: 'a', b: 'b', c: 'c' },
      options: {},
      _cache: new Map(),
      getDynamicHeights: async (_value, args: { schema: Schema }) => {
        if (args.schema.name === 'a') return [30, 30, 30, 30, 30];
        if (args.schema.name === 'b') return [30, 30, 30, 30];
        return [args.schema.height];
      },
    });

    // A's last fragment lands somewhere; B follows; C follows B.
    // Just assert C lands directly below B's last placed fragment.
    const allBs = dynamic.schemas.flatMap((page, p) =>
      page.filter((s) => s.name === 'b').map((s) => ({ schema: s, page: p })),
    );
    const bLast = allBs[allBs.length - 1];
    const c = dynamic.schemas
      .flatMap((page, p) => page.filter((s) => s.name === 'c').map((s) => ({ schema: s, page: p })))
      .at(-1);
    expect(bLast).toBeDefined();
    expect(c).toBeDefined();
    expect(c?.page).toBe(bLast.page);
    expect(c?.schema.position.y).toBe(
      (bLast.schema.position.y ?? 0) + (bLast.schema.height ?? 0) + 5,
    );
  });

  // The "anchored item targets an absolute that the engine pushed
  // across pages" test was deleted in Phase 4 of RFC 0001. It
  // validated that an anchored dependent resolved against the engine's
  // post-flow-push position of an absolute target. Phase 4 removes the
  // engine push entirely (Option C: absolute items don't move).
  // Cross-page chains are still supported when the *anchor target* is
  // anchored (the chain naturally tracks the upstream's last fragment
  // via the global-Y encoding); see the surrounding cross-page tests.

  test('X-anchor across pages: X coord stays correct regardless of which page B lands on', async () => {
    // A is on page 1. B is anchored Y-belowBottomEdge of a
    // page-spanning C (so B lands on page 2), but B's X anchor is
    // afterRightEdge of A (page 1). X is page-independent — B's x
    // should still be A.x + A.width + offset.
    const template: Template = {
      basePdf: splitBasePdf,
      schemas: [
        [
          {
            name: 'a',
            content: 'a',
            type: 'a',
            position: { x: 20, y: 10 },
            width: 60,
            height: 10,
          },
          {
            name: 'c',
            content: 'c',
            type: 'c',
            position: { x: 10, y: 30 },
            width: 80,
            height: 30,
            layout: {
              mode: 'anchored',
              x: { mode: 'pageLeft', offsetMm: 10 },
              y: { mode: 'pageTop', offsetMm: 30 },
            },
          },
          {
            name: 'b',
            content: 'b',
            type: 'b',
            position: { x: 0, y: 0 },
            width: 20,
            height: 10,
            layout: {
              mode: 'anchored',
              x: { mode: 'afterRightEdge', ref: { schemaId: 'a' }, offsetMm: 5 },
              y: { mode: 'belowBottomEdge', ref: { schemaId: 'c' }, offsetMm: 5 },
            },
          },
        ],
      ],
    };

    const dynamic = await getDynamicTemplate({
      template,
      input: { a: 'a', b: 'b', c: 'c' },
      options: {},
      _cache: new Map(),
      getDynamicHeights: async (_value, args: { schema: Schema }) => {
        if (args.schema.name === 'c') return [30, 30, 30]; // 3×30 → 2 pages
        return [args.schema.height];
      },
    });

    const b = dynamic.schemas
      .flatMap((page, p) => page.filter((s) => s.name === 'b').map((s) => ({ schema: s, page: p })))
      .at(-1);
    expect(b).toBeDefined();
    // B.x = A.x (20) + A.width (60) + offset (5) = 85
    // — independent of which page B ends up on.
    expect(b?.schema.position.x).toBe(85);
  });
});
