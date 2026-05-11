import { migrateTemplateToAnchored, PAGE_BREAK_SCHEMA_TYPE } from '../src/index.js';
import type { Template } from '../src/index.js';

const blankBasePdf = { width: 200, height: 297, padding: [10, 10, 10, 10] } as const;

describe('migrateTemplateToAnchored', () => {
  test('first schema on page becomes anchored to pageTop with offset = its y', () => {
    const before: Template = {
      basePdf: blankBasePdf,
      schemas: [
        [
          {
            name: 'a',
            content: 'a',
            type: 'text',
            position: { x: 15, y: 25 },
            width: 80,
            height: 10,
          },
        ],
      ],
    };
    const after = migrateTemplateToAnchored(before);
    expect((after.schemas[0][0] as Record<string, unknown>).layout).toEqual({
      mode: 'anchored',
      x: { mode: 'pageLeft', offsetMm: 15 },
      y: { mode: 'pageTop', offsetMm: 25 },
    });
  });

  test('subsequent schema chains belowBottomEdge of predecessor with computed gap', () => {
    const before: Template = {
      basePdf: blankBasePdf,
      schemas: [
        [
          {
            name: 'a',
            content: 'a',
            type: 'text',
            position: { x: 10, y: 20 },
            width: 80,
            height: 30,
          },
          {
            // 20mm below a (a's bottom is 50, b is at 70)
            name: 'b',
            content: 'b',
            type: 'text',
            position: { x: 10, y: 70 },
            width: 80,
            height: 10,
          },
        ],
      ],
    };
    const after = migrateTemplateToAnchored(before);
    expect((after.schemas[0][1] as Record<string, unknown>).layout).toEqual({
      mode: 'anchored',
      x: { mode: 'pageLeft', offsetMm: 10 },
      y: {
        mode: 'belowBottomEdge',
        ref: { schemaId: 'a' },
        offsetMm: 20,
      },
    });
  });

  test('same-Y siblings encoded via negative offset (chain preserves visual layout)', () => {
    const before: Template = {
      basePdf: blankBasePdf,
      schemas: [
        [
          // a and b at same y, side-by-side (think label + value).
          {
            name: 'a',
            content: 'a',
            type: 'text',
            position: { x: 10, y: 50 },
            width: 40,
            height: 10,
          },
          {
            name: 'b',
            content: 'b',
            type: 'text',
            position: { x: 60, y: 50 },
            width: 40,
            height: 10,
          },
        ],
      ],
    };
    const after = migrateTemplateToAnchored(before);
    // b chains to a with offset = b.y (50) - a.y (50) - a.height (10) = -10.
    // resolveAnchorY then evaluates b.y = a.y + a.height + (-10) = 50.
    expect((after.schemas[0][1] as Record<string, unknown>).layout).toEqual({
      mode: 'anchored',
      x: { mode: 'pageLeft', offsetMm: 60 },
      y: {
        mode: 'belowBottomEdge',
        ref: { schemaId: 'a' },
        offsetMm: -10,
      },
    });
  });

  test('overlapping schemas (b inside a\'s vertical range) preserved via negative offset', () => {
    const before: Template = {
      basePdf: blankBasePdf,
      schemas: [
        [
          {
            name: 'a',
            content: 'a',
            type: 'text',
            position: { x: 10, y: 10 },
            width: 80,
            height: 30,
          },
          {
            // b overlaps a (sits at y=15, a spans 10..40)
            name: 'b',
            content: 'b',
            type: 'text',
            position: { x: 10, y: 15 },
            width: 80,
            height: 5,
          },
        ],
      ],
    };
    const after = migrateTemplateToAnchored(before);
    // offset = 15 - 10 - 30 = -25. resolveAnchorY: 10 + 30 + (-25) = 15. ✓
    expect((after.schemas[0][1] as Record<string, unknown>).layout).toEqual({
      mode: 'anchored',
      x: { mode: 'pageLeft', offsetMm: 10 },
      y: {
        mode: 'belowBottomEdge',
        ref: { schemaId: 'a' },
        offsetMm: -25,
      },
    });
  });

  test('schemas with existing layout are left untouched (idempotent)', () => {
    const existingLayout = {
      mode: 'anchored' as const,
      x: { mode: 'alignRightEdge' as const, ref: { schemaId: 'header' } },
      y: { mode: 'pageTop' as const, offsetMm: 50 },
    };
    const before: Template = {
      basePdf: blankBasePdf,
      schemas: [
        [
          {
            name: 'header',
            content: 'h',
            type: 'text',
            position: { x: 10, y: 10 },
            width: 80,
            height: 10,
          },
          {
            name: 'preanchored',
            content: 'p',
            type: 'text',
            position: { x: 10, y: 50 },
            width: 80,
            height: 10,
            layout: existingLayout,
          },
        ],
      ],
    };
    const after = migrateTemplateToAnchored(before);
    // Pre-anchored schema preserved exactly.
    expect((after.schemas[0][1] as Record<string, unknown>).layout).toEqual(existingLayout);
  });

  test('pageBreak markers are skipped — they don\'t become predecessors and don\'t get layouts', () => {
    const before: Template = {
      basePdf: blankBasePdf,
      schemas: [
        [
          {
            name: 'a',
            content: 'a',
            type: 'text',
            position: { x: 10, y: 20 },
            width: 80,
            height: 10,
          },
          {
            name: 'br',
            content: '',
            type: PAGE_BREAK_SCHEMA_TYPE,
            position: { x: 0, y: 30 },
            width: 0,
            height: 0,
          },
          {
            name: 'b',
            content: 'b',
            type: 'text',
            position: { x: 10, y: 50 },
            width: 80,
            height: 10,
          },
        ],
      ],
    };
    const after = migrateTemplateToAnchored(before);
    // The pageBreak entry stays unchanged.
    expect((after.schemas[0][1] as Record<string, unknown>).layout).toBeUndefined();
    // b chains to a (skipping pageBreak): offset = 50 - 20 - 10 = 20.
    expect((after.schemas[0][2] as Record<string, unknown>).layout).toEqual({
      mode: 'anchored',
      x: { mode: 'pageLeft', offsetMm: 10 },
      y: {
        mode: 'belowBottomEdge',
        ref: { schemaId: 'a' },
        offsetMm: 20,
      },
    });
  });

  test('does not mutate the input template', () => {
    const before: Template = {
      basePdf: blankBasePdf,
      schemas: [
        [
          {
            name: 'a',
            content: 'a',
            type: 'text',
            position: { x: 10, y: 20 },
            width: 80,
            height: 10,
          },
        ],
      ],
    };
    const beforeJson = JSON.stringify(before);
    migrateTemplateToAnchored(before);
    expect(JSON.stringify(before)).toBe(beforeJson);
  });

  test('multi-page templates chain independently per page', () => {
    const before: Template = {
      basePdf: blankBasePdf,
      schemas: [
        [
          {
            name: 'a1',
            content: 'a1',
            type: 'text',
            position: { x: 10, y: 20 },
            width: 80,
            height: 10,
          },
          {
            name: 'b1',
            content: 'b1',
            type: 'text',
            position: { x: 10, y: 40 },
            width: 80,
            height: 10,
          },
        ],
        [
          {
            name: 'a2',
            content: 'a2',
            type: 'text',
            position: { x: 10, y: 25 },
            width: 80,
            height: 10,
          },
        ],
      ],
    };
    const after = migrateTemplateToAnchored(before);
    // page 0: a1 → pageTop offset 20; b1 → belowBottomEdge of a1 offset 10
    expect((after.schemas[0][0] as Record<string, unknown>).layout).toEqual({
      mode: 'anchored',
      x: { mode: 'pageLeft', offsetMm: 10 },
      y: { mode: 'pageTop', offsetMm: 20 },
    });
    expect((after.schemas[0][1] as Record<string, unknown>).layout).toEqual({
      mode: 'anchored',
      x: { mode: 'pageLeft', offsetMm: 10 },
      y: {
        mode: 'belowBottomEdge',
        ref: { schemaId: 'a1' },
        offsetMm: 10,
      },
    });
    // page 1: a2 → pageTop offset 25 (does not chain to a1 from page 0)
    expect((after.schemas[1][0] as Record<string, unknown>).layout).toEqual({
      mode: 'anchored',
      x: { mode: 'pageLeft', offsetMm: 10 },
      y: { mode: 'pageTop', offsetMm: 25 },
    });
  });
});
