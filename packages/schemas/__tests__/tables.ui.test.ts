// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Font, UIRenderProps } from '@pdfweave/common';
import { uiRender } from '../src/tables/uiRender.js';
import type { TableSchema } from '../src/tables/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sansData = readFileSync(path.join(__dirname, '/assets/fonts/SauceHanSansJP.ttf'));

const getSampleFont = (): Font => ({
  SauceHanSansJP: { fallback: true, data: sansData },
});

const baseStyles = () => ({
  fontName: 'SauceHanSansJP',
  alignment: 'left' as const,
  verticalAlignment: 'middle' as const,
  fontSize: 10,
  lineHeight: 1,
  characterSpacing: 0,
  fontColor: '#000000',
  backgroundColor: '',
  borderColor: '#000000',
  borderWidth: { top: 0, right: 0, bottom: 0, left: 0 },
  padding: { top: 1, right: 1, bottom: 1, left: 1 },
});

const makeTableSchema = (id: string): TableSchema =>
  ({
    id,
    name: id,
    type: 'table',
    position: { x: 0, y: 0 },
    width: 60,
    height: 20,
    showHead: true,
    head: ['A', 'B'],
    headWidthPercentages: [50, 50],
    tableStyles: { borderColor: '#000000', borderWidth: 0.1 },
    headStyles: { ...baseStyles(), fontColor: '#ffffff', backgroundColor: '#222' },
    bodyStyles: { ...baseStyles(), alternateBackgroundColor: '' },
    columnStyles: {},
  }) as unknown as TableSchema;

type Arg = UIRenderProps<TableSchema>;

const buildArg = (
  schema: TableSchema,
  rootElement: HTMLDivElement,
  mode: 'viewer' | 'form' | 'designer',
): Arg =>
  ({
    schema,
    rootElement,
    mode,
    value: JSON.stringify([
      ['1', '2'],
      ['3', '4'],
    ]),
    onChange: () => {},
    options: { font: getSampleFont() },
    _cache: new Map(),
    theme: { colorPrimary: '#1677ff' },
    scale: 1,
  }) as unknown as Arg;

const flushAsync = async () => {
  // The cell ui render is fire-and-forget (`void cellUiRender(...)`), so we
  // wait a couple of microtask + macrotask ticks to let the inner async work
  // (font kit loading via cache, DOM mutation) settle.
  for (let i = 0; i < 5; i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
};

const countContentEditable = (root: HTMLElement): number =>
  Array.from(root.querySelectorAll('*')).filter((el) => {
    const ce = (el as HTMLElement).contentEditable;
    return ce === 'true' || ce === 'plaintext-only';
  }).length;

const findFirstBodyCellDiv = (root: HTMLElement): HTMLDivElement | undefined => {
  // Body cells live below the head; in form mode the cell `div` registers a
  // click listener at the table layer. Body cells in this layout are the
  // ones whose top offset is greater than 0 (the head row sits at top:0mm).
  const candidates = Array.from(root.children).filter(
    (el): el is HTMLDivElement =>
      el instanceof HTMLDivElement && el.style.position === 'absolute',
  );
  return candidates.find((el) => {
    const top = parseFloat(el.style.top);
    return Number.isFinite(top) && top > 0;
  });
};

describe('table editing state is per-instance (issue #24)', () => {
  it('does not leak editing focus between two table instances on the same page', async () => {
    const rootA = document.createElement('div');
    const rootB = document.createElement('div');
    document.body.appendChild(rootA);
    document.body.appendChild(rootB);

    const schemaA = makeTableSchema('table-a');
    const schemaB = makeTableSchema('table-b');

    const argA = buildArg(schemaA, rootA, 'form');
    const argB = buildArg(schemaB, rootB, 'form');

    await uiRender(argA);
    await uiRender(argB);
    await flushAsync();

    // Sanity: neither table starts with any editing cell.
    expect(countContentEditable(rootA)).toBe(0);
    expect(countContentEditable(rootB)).toBe(0);

    // Click a body cell on table A — this triggers an internal re-render of A
    // and sets A's editing position, but must NOT affect B's editing state.
    const bodyCellA = findFirstBodyCellDiv(rootA);
    if (!bodyCellA) throw new Error('test setup: could not locate a body cell on table A');
    bodyCellA.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAsync();

    // A now has an editing cell.
    expect(countContentEditable(rootA)).toBeGreaterThan(0);

    // B must still have no editing cell — re-rendering B from scratch must
    // produce a clean, non-editing state. With the pre-fix module-global
    // editing position, B inherited A's editing position and rendered an
    // editable cell at the same coordinates.
    rootB.innerHTML = '';
    await uiRender(buildArg(schemaB, rootB, 'form'));
    await flushAsync();
    expect(countContentEditable(rootB)).toBe(0);
  });
});
