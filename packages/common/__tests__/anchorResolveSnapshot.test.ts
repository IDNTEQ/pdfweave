/**
 * Snapshot baseline for anchor resolution.
 *
 * Goal: protect against regressions in render output produced by the
 * three call sites that used to host their own copies of the anchor
 * geometry. The committed JSON baseline captures the per-page schema
 * positions/sizes after `getDynamicTemplate` has resolved a small but
 * non-trivial anchored template.
 *
 * If this baseline ever changes, anchor *behaviour* changed — which
 * (per the rules of the refactor that introduced this file) should not
 * happen via a change to the anchorGeometry module unless the change
 * is intentional and reviewed.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getDynamicTemplate } from '../src/dynamicTemplate.js';
import type { Schema, Template } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.join(__dirname, '__snapshots__', 'anchor-resolve-baseline.json');

const buildAnchoredTemplate = (): Template => ({
  basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
  schemas: [
    [
      // Anchored to page top-left with offsets — exercises pageLeft/pageTop.
      {
        name: 'header',
        id: 'header',
        type: 'text',
        content: 'Header',
        position: { x: 0, y: 0 }, // will be overwritten by anchor resolve
        width: 80,
        height: 12,
        layout: {
          mode: 'anchored',
          x: { mode: 'pageLeft', offsetMm: 15 },
          y: { mode: 'pageTop', offsetMm: 12 },
        },
      },
      // Anchored to header's right edge horizontally, page top vertically —
      // exercises afterRightEdge.
      {
        name: 'logo',
        id: 'logo',
        type: 'image',
        content: '',
        position: { x: 0, y: 0 },
        width: 20,
        height: 12,
        layout: {
          mode: 'anchored',
          x: { mode: 'afterRightEdge', ref: { schemaId: 'header' }, offsetMm: 5 },
          y: { mode: 'pageTop', offsetMm: 12 },
        },
      },
      // Anchored below the header — exercises belowBottomEdge.
      {
        name: 'subtitle',
        id: 'subtitle',
        type: 'text',
        content: 'Subtitle',
        position: { x: 15, y: 0 },
        width: 80,
        height: 8,
        layout: {
          mode: 'anchored',
          x: { mode: 'pageLeft', offsetMm: 15 },
          y: { mode: 'belowBottomEdge', ref: { schemaId: 'header' }, offsetMm: 4 },
        },
      },
      // Right-aligned to header — exercises alignRightEdge.
      {
        name: 'badge',
        id: 'badge',
        type: 'text',
        content: 'BETA',
        position: { x: 0, y: 0 },
        width: 14,
        height: 6,
        layout: {
          mode: 'anchored',
          x: { mode: 'alignRightEdge', ref: { schemaId: 'header' }, offsetMm: 0 },
          y: { mode: 'belowBottomEdge', ref: { schemaId: 'subtitle' }, offsetMm: 2 },
        },
      },
      // Plain absolute schema (no anchor) — sanity check that the resolver
      // doesn't disturb non-anchored entries.
      {
        name: 'fixed',
        id: 'fixed',
        type: 'text',
        content: 'fixed',
        position: { x: 100, y: 100 },
        width: 30,
        height: 10,
      },
    ],
  ],
});

const summarize = (schemas: Schema[][]) =>
  schemas.map((page) =>
    page.map((schema) => ({
      name: schema.name,
      x: round(schema.position.x),
      y: round(schema.position.y),
      width: round(schema.width),
      height: round(schema.height),
    })),
  );

const round = (value: number): number => Math.round(value * 1000) / 1000;

describe('anchor resolution snapshot baseline', () => {
  it('matches the committed baseline (anchor-resolve-baseline.json)', async () => {
    const template = buildAnchoredTemplate();
    const result = await getDynamicTemplate({
      template,
      input: {},
      _cache: new Map(),
      options: {},
    });
    const actual = summarize(result.schemas);

    const expected: unknown = JSON.parse(readFileSync(baselinePath, 'utf8'));
    expect(actual).toEqual(expected);
  });
});
