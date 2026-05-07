import { describe, expect, it } from 'vitest';
import {
  ANCHOR_EPSILON,
  buildSchemaIndex,
  detectAnchorCycle,
  findAnchorReferentX,
  findAnchorReferentY,
  getAnchoredLayout,
  getSchemaAnchorIds,
  isAnchoredLayout,
  resolveAnchor,
  resolveAnchorX,
  resolveAnchorY,
  reverseAnchorOffsetX,
  reverseAnchorOffsetY,
} from '../src/anchorGeometry.js';
import type { Schema } from '../src/types.js';

const makeSchema = (overrides: Partial<Schema> & { name: string }): Schema => ({
  type: 'text',
  content: '',
  position: { x: 0, y: 0 },
  width: 10,
  height: 10,
  ...overrides,
});

describe('anchorGeometry', () => {
  describe('getSchemaAnchorIds', () => {
    it('returns both name and id when both are present', () => {
      const schema = makeSchema({ name: 'foo', id: 'abc' });
      expect(getSchemaAnchorIds(schema)).toEqual(['foo', 'abc']);
    });

    it('de-dupes when name and id are equal', () => {
      const schema = makeSchema({ name: 'foo', id: 'foo' });
      expect(getSchemaAnchorIds(schema)).toEqual(['foo']);
    });

    it('skips empty / non-string ids', () => {
      const schema = makeSchema({ name: 'foo' });
      expect(getSchemaAnchorIds(schema)).toEqual(['foo']);
    });

    it('skips schemas with no usable id at all', () => {
      const schema = makeSchema({ name: '' });
      expect(getSchemaAnchorIds(schema)).toEqual([]);
    });
  });

  describe('buildSchemaIndex', () => {
    it('indexes schemas by both id and name', () => {
      const schema = makeSchema({ name: 'foo', id: 'abc' });
      const index = buildSchemaIndex([schema]);
      expect(index.get('foo')).toBe(schema);
      expect(index.get('abc')).toBe(schema);
    });

    it('returns the last schema when ids collide', () => {
      const a = makeSchema({ name: 'shared', id: 'a' });
      const b = makeSchema({ name: 'shared', id: 'b' });
      const index = buildSchemaIndex([a, b]);
      expect(index.get('shared')).toBe(b);
    });

    it('returns the last schema when names collide', () => {
      const a = makeSchema({ name: 'a', id: 'shared' });
      const b = makeSchema({ name: 'b', id: 'shared' });
      const index = buildSchemaIndex([a, b]);
      expect(index.get('shared')).toBe(b);
    });

    it('skips schemas without any usable id', () => {
      const a = makeSchema({ name: '' });
      const b = makeSchema({ name: 'b' });
      const index = buildSchemaIndex([a, b]);
      expect(index.size).toBe(1);
      expect(index.get('b')).toBe(b);
    });
  });

  describe('isAnchoredLayout / getAnchoredLayout', () => {
    it('isAnchoredLayout recognises the anchored variant', () => {
      expect(
        isAnchoredLayout({
          mode: 'anchored',
          x: { mode: 'pageLeft', offsetMm: 0 },
          y: { mode: 'pageTop', offsetMm: 0 },
        }),
      ).toBe(true);
    });

    it('isAnchoredLayout rejects null / undefined / wrong-mode values', () => {
      // eslint-disable-next-line unicorn/no-useless-undefined
      expect(isAnchoredLayout(undefined)).toBe(false);
      expect(isAnchoredLayout(null)).toBe(false);
      expect(isAnchoredLayout({ mode: 'absolute' })).toBe(false);
      expect(isAnchoredLayout({})).toBe(false);
    });

    it('getAnchoredLayout returns undefined for non-anchored schemas', () => {
      const schema = makeSchema({ name: 'foo' });
      expect(getAnchoredLayout(schema)).toBeUndefined();
    });
  });

  describe('resolveAnchorX', () => {
    it('pageLeft: returns the absolute offsetMm', () => {
      const schema = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'pageLeft', offsetMm: 25 },
          y: { mode: 'pageTop', offsetMm: 0 },
        },
      });
      const index = buildSchemaIndex([schema]);
      expect(resolveAnchorX(schema, index)).toBe(25);
    });

    it('afterRightEdge: places schema after target right edge + offset', () => {
      const target = makeSchema({ name: 'target', position: { x: 10, y: 0 }, width: 30 });
      const schema = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'afterRightEdge', ref: { schemaId: 'target' }, offsetMm: 5 },
          y: { mode: 'pageTop', offsetMm: 0 },
        },
      });
      const index = buildSchemaIndex([target, schema]);
      // target right = 10 + 30 = 40; +5 = 45
      expect(resolveAnchorX(schema, index)).toBe(45);
    });

    it('alignRightEdge: schema right edge sits on target right edge + offset', () => {
      const target = makeSchema({ name: 'target', position: { x: 10, y: 0 }, width: 30 });
      const schema = makeSchema({
        name: 'a',
        width: 8,
        layout: {
          mode: 'anchored',
          x: { mode: 'alignRightEdge', ref: { schemaId: 'target' }, offsetMm: 0 },
          y: { mode: 'pageTop', offsetMm: 0 },
        },
      });
      const index = buildSchemaIndex([target, schema]);
      // target right = 40; schema right edge should sit at 40, so x = 40 - 8 = 32
      expect(resolveAnchorX(schema, index)).toBe(32);
    });

    it('alignRightEdge: treats omitted offsetMm as 0', () => {
      const target = makeSchema({ name: 'target', position: { x: 10, y: 0 }, width: 30 });
      const schema = makeSchema({
        name: 'a',
        width: 8,
        layout: {
          mode: 'anchored',
          // offsetMm omitted on purpose
          x: { mode: 'alignRightEdge', ref: { schemaId: 'target' } },
          y: { mode: 'pageTop', offsetMm: 0 },
        },
      });
      const index = buildSchemaIndex([target, schema]);
      expect(resolveAnchorX(schema, index)).toBe(32);
    });

    it('returns null when the referent is missing', () => {
      const schema = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'afterRightEdge', ref: { schemaId: 'missing' }, offsetMm: 5 },
          y: { mode: 'pageTop', offsetMm: 0 },
        },
      });
      const index = buildSchemaIndex([schema]);
      expect(resolveAnchorX(schema, index)).toBeNull();
    });

    it('returns null for a non-anchored schema', () => {
      const schema = makeSchema({ name: 'a' });
      const index = buildSchemaIndex([schema]);
      expect(resolveAnchorX(schema, index)).toBeNull();
    });
  });

  describe('resolveAnchorY', () => {
    it('pageTop: returns the absolute offsetMm', () => {
      const schema = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'pageLeft', offsetMm: 0 },
          y: { mode: 'pageTop', offsetMm: 12 },
        },
      });
      const index = buildSchemaIndex([schema]);
      expect(resolveAnchorY(schema, index)).toBe(12);
    });

    it('belowBottomEdge: places schema below target + offset', () => {
      const target = makeSchema({ name: 'target', position: { x: 0, y: 20 }, height: 15 });
      const schema = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'pageLeft', offsetMm: 0 },
          y: { mode: 'belowBottomEdge', ref: { schemaId: 'target' }, offsetMm: 4 },
        },
      });
      const index = buildSchemaIndex([target, schema]);
      // target bottom = 20 + 15 = 35; +4 = 39
      expect(resolveAnchorY(schema, index)).toBe(39);
    });

    it('returns null when the referent is missing', () => {
      const schema = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'pageLeft', offsetMm: 0 },
          y: { mode: 'belowBottomEdge', ref: { schemaId: 'missing' }, offsetMm: 4 },
        },
      });
      const index = buildSchemaIndex([schema]);
      expect(resolveAnchorY(schema, index)).toBeNull();
    });
  });

  describe('resolveAnchor', () => {
    it('returns both axes when both resolve', () => {
      const target = makeSchema({ name: 'target', position: { x: 5, y: 7 }, width: 10, height: 4 });
      const schema = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'afterRightEdge', ref: { schemaId: 'target' }, offsetMm: 1 },
          y: { mode: 'belowBottomEdge', ref: { schemaId: 'target' }, offsetMm: 2 },
        },
      });
      const index = buildSchemaIndex([target, schema]);
      expect(resolveAnchor(schema, index)).toEqual({ x: 5 + 10 + 1, y: 7 + 4 + 2 });
    });
  });

  describe('reverseAnchorOffsetX (round-trips with resolveAnchorX)', () => {
    const target = makeSchema({ name: 'target', position: { x: 4, y: 0 }, width: 12 });

    it('round-trips pageLeft', () => {
      const schema = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'pageLeft', offsetMm: 17 },
          y: { mode: 'pageTop', offsetMm: 0 },
        },
      });
      const index = buildSchemaIndex([schema]);
      const resolved = resolveAnchorX(schema, index);
      expect(resolved).toBe(17);
      const layout = getAnchoredLayout(schema)!;
      // eslint-disable-next-line unicorn/no-useless-undefined
      expect(reverseAnchorOffsetX(resolved!, layout.x, schema.width, undefined)).toBe(17);
    });

    it('round-trips afterRightEdge', () => {
      const schema = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'afterRightEdge', ref: { schemaId: 'target' }, offsetMm: 3 },
          y: { mode: 'pageTop', offsetMm: 0 },
        },
      });
      const index = buildSchemaIndex([target, schema]);
      const resolved = resolveAnchorX(schema, index);
      const layout = getAnchoredLayout(schema)!;
      expect(reverseAnchorOffsetX(resolved!, layout.x, schema.width, target)).toBe(3);
    });

    it('round-trips alignRightEdge', () => {
      const schema = makeSchema({
        name: 'a',
        width: 6,
        layout: {
          mode: 'anchored',
          x: { mode: 'alignRightEdge', ref: { schemaId: 'target' }, offsetMm: 2 },
          y: { mode: 'pageTop', offsetMm: 0 },
        },
      });
      const index = buildSchemaIndex([target, schema]);
      const resolved = resolveAnchorX(schema, index);
      const layout = getAnchoredLayout(schema)!;
      expect(reverseAnchorOffsetX(resolved!, layout.x, schema.width, target)).toBe(2);
    });
  });

  describe('reverseAnchorOffsetY (round-trips with resolveAnchorY)', () => {
    const target = makeSchema({ name: 'target', position: { x: 0, y: 5 }, height: 9 });

    it('round-trips pageTop', () => {
      const schema = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'pageLeft', offsetMm: 0 },
          y: { mode: 'pageTop', offsetMm: 13 },
        },
      });
      const index = buildSchemaIndex([schema]);
      const resolved = resolveAnchorY(schema, index);
      expect(resolved).toBe(13);
      const layout = getAnchoredLayout(schema)!;
      // eslint-disable-next-line unicorn/no-useless-undefined
      expect(reverseAnchorOffsetY(resolved!, layout.y, undefined)).toBe(13);
    });

    it('round-trips belowBottomEdge', () => {
      const schema = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'pageLeft', offsetMm: 0 },
          y: { mode: 'belowBottomEdge', ref: { schemaId: 'target' }, offsetMm: 7 },
        },
      });
      const index = buildSchemaIndex([target, schema]);
      const resolved = resolveAnchorY(schema, index);
      const layout = getAnchoredLayout(schema)!;
      expect(reverseAnchorOffsetY(resolved!, layout.y, target)).toBe(7);
    });
  });

  describe('findAnchorReferentX / findAnchorReferentY', () => {
    it('returns the referent when present', () => {
      const target = makeSchema({ name: 'target' });
      const schema = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'afterRightEdge', ref: { schemaId: 'target' }, offsetMm: 0 },
          y: { mode: 'belowBottomEdge', ref: { schemaId: 'target' }, offsetMm: 0 },
        },
      });
      const index = buildSchemaIndex([target, schema]);
      expect(findAnchorReferentX(schema, index)).toBe(target);
      expect(findAnchorReferentY(schema, index)).toBe(target);
    });

    it('returns undefined for page-anchored axes (no referent)', () => {
      const schema = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'pageLeft', offsetMm: 0 },
          y: { mode: 'pageTop', offsetMm: 0 },
        },
      });
      const index = buildSchemaIndex([schema]);
      expect(findAnchorReferentX(schema, index)).toBeUndefined();
      expect(findAnchorReferentY(schema, index)).toBeUndefined();
    });

    it('returns undefined when the referent is missing', () => {
      const schema = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'afterRightEdge', ref: { schemaId: 'missing' }, offsetMm: 0 },
          y: { mode: 'belowBottomEdge', ref: { schemaId: 'missing' }, offsetMm: 0 },
        },
      });
      const index = buildSchemaIndex([schema]);
      expect(findAnchorReferentX(schema, index)).toBeUndefined();
      expect(findAnchorReferentY(schema, index)).toBeUndefined();
    });

    it('returns the schema itself for self-references (caller decides what to do)', () => {
      // We document this as the current behaviour: findAnchorReferent does
      // not block self-refs; cycle detection is the dedicated tool.
      const schema = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'afterRightEdge', ref: { schemaId: 'a' }, offsetMm: 0 },
          y: { mode: 'pageTop', offsetMm: 0 },
        },
      });
      const index = buildSchemaIndex([schema]);
      expect(findAnchorReferentX(schema, index)).toBe(schema);
    });

    it('returns undefined for non-anchored schemas', () => {
      const schema = makeSchema({ name: 'a' });
      const index = buildSchemaIndex([schema]);
      expect(findAnchorReferentX(schema, index)).toBeUndefined();
      expect(findAnchorReferentY(schema, index)).toBeUndefined();
    });
  });

  describe('detectAnchorCycle', () => {
    it('returns null when there is no cycle', () => {
      const a = makeSchema({ name: 'a' });
      const b = makeSchema({
        name: 'b',
        layout: {
          mode: 'anchored',
          x: { mode: 'pageLeft', offsetMm: 0 },
          y: { mode: 'belowBottomEdge', ref: { schemaId: 'a' }, offsetMm: 0 },
        },
      });
      expect(detectAnchorCycle([a, b])).toBeNull();
    });

    it('detects a simple A→B→A cycle', () => {
      const a = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'afterRightEdge', ref: { schemaId: 'b' }, offsetMm: 0 },
          y: { mode: 'pageTop', offsetMm: 0 },
        },
      });
      const b = makeSchema({
        name: 'b',
        layout: {
          mode: 'anchored',
          x: { mode: 'afterRightEdge', ref: { schemaId: 'a' }, offsetMm: 0 },
          y: { mode: 'pageTop', offsetMm: 0 },
        },
      });
      const cycle = detectAnchorCycle([a, b]);
      expect(cycle).not.toBeNull();
      expect(cycle).toEqual([a, b]);
    });

    it('detects a longer A→B→C→A cycle', () => {
      const a = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'afterRightEdge', ref: { schemaId: 'c' }, offsetMm: 0 },
          y: { mode: 'pageTop', offsetMm: 0 },
        },
      });
      const b = makeSchema({
        name: 'b',
        layout: {
          mode: 'anchored',
          x: { mode: 'afterRightEdge', ref: { schemaId: 'a' }, offsetMm: 0 },
          y: { mode: 'pageTop', offsetMm: 0 },
        },
      });
      const c = makeSchema({
        name: 'c',
        layout: {
          mode: 'anchored',
          x: { mode: 'afterRightEdge', ref: { schemaId: 'b' }, offsetMm: 0 },
          y: { mode: 'pageTop', offsetMm: 0 },
        },
      });
      const cycle = detectAnchorCycle([a, b, c]);
      expect(cycle).not.toBeNull();
      expect(cycle?.length).toBe(3);
      // The cycle should contain all three; visit order starts at `a` (DFS root).
      expect(new Set(cycle)).toEqual(new Set([a, b, c]));
    });

    it('detects a self-reference (degenerate cycle)', () => {
      const a = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'afterRightEdge', ref: { schemaId: 'a' }, offsetMm: 0 },
          y: { mode: 'pageTop', offsetMm: 0 },
        },
      });
      const cycle = detectAnchorCycle([a]);
      expect(cycle).toEqual([a]);
    });

    it('ignores rules pointing at non-existent referents', () => {
      const a = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'afterRightEdge', ref: { schemaId: 'missing' }, offsetMm: 0 },
          y: { mode: 'pageTop', offsetMm: 0 },
        },
      });
      expect(detectAnchorCycle([a])).toBeNull();
    });

    it('also walks cross-axis edges (x→y) when forming cycles', () => {
      const a = makeSchema({
        name: 'a',
        layout: {
          mode: 'anchored',
          x: { mode: 'pageLeft', offsetMm: 0 },
          y: { mode: 'belowBottomEdge', ref: { schemaId: 'b' }, offsetMm: 0 },
        },
      });
      const b = makeSchema({
        name: 'b',
        layout: {
          mode: 'anchored',
          x: { mode: 'afterRightEdge', ref: { schemaId: 'a' }, offsetMm: 0 },
          y: { mode: 'pageTop', offsetMm: 0 },
        },
      });
      expect(detectAnchorCycle([a, b])).not.toBeNull();
    });
  });

  describe('ANCHOR_EPSILON', () => {
    it('is a small positive number', () => {
      expect(ANCHOR_EPSILON).toBeGreaterThan(0);
      expect(ANCHOR_EPSILON).toBeLessThan(1);
    });
  });
});
