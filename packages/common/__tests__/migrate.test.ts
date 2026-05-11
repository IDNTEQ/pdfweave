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

  test('same-Y siblings in the first group both anchor to pageTop (group-aware)', () => {
    const before: Template = {
      basePdf: blankBasePdf,
      schemas: [
        [
          // a and b at same y, side-by-side (label + value pattern).
          // No earlier group → both anchor to pageTop independently.
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
    expect((after.schemas[0][0] as Record<string, unknown>).layout).toEqual({
      mode: 'anchored',
      x: { mode: 'pageLeft', offsetMm: 10 },
      y: { mode: 'pageTop', offsetMm: 50 },
    });
    expect((after.schemas[0][1] as Record<string, unknown>).layout).toEqual({
      mode: 'anchored',
      x: { mode: 'pageLeft', offsetMm: 60 },
      y: { mode: 'pageTop', offsetMm: 50 },
    });
  });

  test('overlapping schemas form one group; downstream group chains to group host', () => {
    // a and b overlap (b sits inside a's vertical range) → same group.
    // c sits below the group → chains to the group HOST (the tallest
    // member, here a) with a positive offset.
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
          {
            // c sits below the a/b group at y=50
            name: 'c',
            content: 'c',
            type: 'text',
            position: { x: 10, y: 50 },
            width: 80,
            height: 10,
          },
        ],
      ],
    };
    const after = migrateTemplateToAnchored(before);
    // Both a and b are in the first group → both anchor to pageTop.
    expect((after.schemas[0][0] as Record<string, unknown>).layout).toEqual({
      mode: 'anchored',
      x: { mode: 'pageLeft', offsetMm: 10 },
      y: { mode: 'pageTop', offsetMm: 10 },
    });
    expect((after.schemas[0][1] as Record<string, unknown>).layout).toEqual({
      mode: 'anchored',
      x: { mode: 'pageLeft', offsetMm: 10 },
      y: { mode: 'pageTop', offsetMm: 15 },
    });
    // c chains to the group host (a, with the bottom-most edge).
    // offset = c.y (50) - a.y (10) - a.height (30) = 10.
    expect((after.schemas[0][2] as Record<string, unknown>).layout).toEqual({
      mode: 'anchored',
      x: { mode: 'pageLeft', offsetMm: 10 },
      y: {
        mode: 'belowBottomEdge',
        ref: { schemaId: 'a' },
        offsetMm: 10,
      },
    });
  });

  test('overlapping siblings in a non-first group both anchor to the previous group host', () => {
    // Header schema h at y=10..20 forms group 1.
    // Then x at y=30 (height 10) and y at y=33 (height 5) overlap each
    // other (ranges 30..40 and 33..38) → group 2. Both should anchor
    // to h with offsets computed from their respective Ys.
    const before: Template = {
      basePdf: blankBasePdf,
      schemas: [
        [
          {
            name: 'h',
            content: 'h',
            type: 'text',
            position: { x: 10, y: 10 },
            width: 80,
            height: 10,
          },
          {
            name: 'x',
            content: 'x',
            type: 'text',
            position: { x: 10, y: 30 },
            width: 40,
            height: 10,
          },
          {
            name: 'y',
            content: 'y',
            type: 'text',
            position: { x: 50, y: 33 },
            width: 40,
            height: 5,
          },
        ],
      ],
    };
    const after = migrateTemplateToAnchored(before);

    expect((after.schemas[0][0] as Record<string, unknown>).layout).toEqual({
      mode: 'anchored',
      x: { mode: 'pageLeft', offsetMm: 10 },
      y: { mode: 'pageTop', offsetMm: 10 },
    });
    // Both x and y anchor to h (previous group's host) with offsets
    // computed from their Y minus h.y minus h.height (= 20).
    expect((after.schemas[0][1] as Record<string, unknown>).layout).toEqual({
      mode: 'anchored',
      x: { mode: 'pageLeft', offsetMm: 10 },
      y: {
        mode: 'belowBottomEdge',
        ref: { schemaId: 'h' },
        offsetMm: 10, // 30 - 10 - 10
      },
    });
    expect((after.schemas[0][2] as Record<string, unknown>).layout).toEqual({
      mode: 'anchored',
      x: { mode: 'pageLeft', offsetMm: 50 },
      y: {
        mode: 'belowBottomEdge',
        ref: { schemaId: 'h' },
        offsetMm: 13, // 33 - 10 - 10
      },
    });
  });

  test('document order does NOT determine chain order — Y order does', () => {
    // a is at y=80, b at y=10. Document order has a first, but the
    // migration must use Y order (b first since y=10 < y=80) and chain
    // a to b (not the other way around).
    const before: Template = {
      basePdf: blankBasePdf,
      schemas: [
        [
          {
            name: 'a',
            content: 'a',
            type: 'text',
            position: { x: 10, y: 80 },
            width: 80,
            height: 10,
          },
          {
            name: 'b',
            content: 'b',
            type: 'text',
            position: { x: 10, y: 10 },
            width: 80,
            height: 10,
          },
        ],
      ],
    };
    const after = migrateTemplateToAnchored(before);
    // b is the first group (y=10) → anchor to pageTop.
    expect((after.schemas[0][1] as Record<string, unknown>).layout).toEqual({
      mode: 'anchored',
      x: { mode: 'pageLeft', offsetMm: 10 },
      y: { mode: 'pageTop', offsetMm: 10 },
    });
    // a (y=80) chains to b (the previous group's host) with
    // offset = 80 - 10 - 10 = 60.
    expect((after.schemas[0][0] as Record<string, unknown>).layout).toEqual({
      mode: 'anchored',
      x: { mode: 'pageLeft', offsetMm: 10 },
      y: {
        mode: 'belowBottomEdge',
        ref: { schemaId: 'b' },
        offsetMm: 60,
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
