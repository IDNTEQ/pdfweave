import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { SchemaForUI } from '@pdfweave/common';
import { useSelectionHelpers } from '../../../../src/components/Designer/Canvas/hooks/useSelectionHelpers.js';
import { SELECTABLE_CLASSNAME } from '../../../../src/constants.js';

const schema = (id: string, group?: string): SchemaForUI =>
  ({
    id,
    name: id,
    type: 'text',
    position: { x: 0, y: 0 },
    width: 50,
    height: 20,
    content: '',
    ...(group ? { group } : {}),
  }) as unknown as SchemaForUI;

const makeElement = (id: string, klass = SELECTABLE_CLASSNAME): HTMLElement => {
  const el = document.createElement('div');
  el.id = id;
  el.className = klass;
  document.body.appendChild(el);
  return el;
};

describe('useSelectionHelpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('exposes activeIds derived from activeElements', () => {
    const a = makeElement('a');
    const b = makeElement('b');
    const { result } = renderHook(() =>
      useSelectionHelpers({
        activeElements: [a, b],
        hoveringSchemaId: null,
        schemasList: [[schema('a'), schema('b')]],
        pageCursor: 0,
        onEdit: vi.fn(),
      }),
    );

    expect(result.current.activeIds).toEqual(['a', 'b']);
  });

  it('focusedSchemaIds includes the hovering schema', () => {
    const a = makeElement('a');
    const { result } = renderHook(() =>
      useSelectionHelpers({
        activeElements: [a],
        hoveringSchemaId: 'b',
        schemasList: [[schema('a'), schema('b')]],
        pageCursor: 0,
        onEdit: vi.fn(),
      }),
    );

    expect(result.current.focusedSchemaIds).toEqual(new Set(['a', 'b']));
  });

  it('schemaPageIndexById maps each schema id to its page index', () => {
    const { result } = renderHook(() =>
      useSelectionHelpers({
        activeElements: [],
        hoveringSchemaId: null,
        schemasList: [[schema('a'), schema('b')], [schema('c')]],
        pageCursor: 0,
        onEdit: vi.fn(),
      }),
    );

    expect(result.current.schemaPageIndexById.get('a')).toBe(0);
    expect(result.current.schemaPageIndexById.get('b')).toBe(0);
    expect(result.current.schemaPageIndexById.get('c')).toBe(1);
  });

  it('expandIdsByGroups returns the input when no schema in the selection has a group', () => {
    const { result } = renderHook(() =>
      useSelectionHelpers({
        activeElements: [],
        hoveringSchemaId: null,
        schemasList: [[schema('a'), schema('b'), schema('c')]],
        pageCursor: 0,
        onEdit: vi.fn(),
      }),
    );

    expect(result.current.expandIdsByGroups(['a'])).toEqual(['a']);
  });

  it('expandIdsByGroups pulls in all schemas that share a group with any selected', () => {
    const { result } = renderHook(() =>
      useSelectionHelpers({
        activeElements: [],
        hoveringSchemaId: null,
        schemasList: [[schema('a', 'g1'), schema('b', 'g1'), schema('c'), schema('d', 'g2')]],
        pageCursor: 0,
        onEdit: vi.fn(),
      }),
    );

    // Selecting 'a' should expand to include 'b' (same group). 'c' and 'd' stay out.
    expect(result.current.expandIdsByGroups(['a'])).toEqual(['a', 'b']);
  });

  it('getElementsByIds finds elements by id, preferring SELECTABLE_CLASSNAME ones', () => {
    const a = makeElement('a');
    const b = makeElement('b', 'other-class');

    const { result } = renderHook(() =>
      useSelectionHelpers({
        activeElements: [],
        hoveringSchemaId: null,
        schemasList: [[]],
        pageCursor: 0,
        onEdit: vi.fn(),
      }),
    );

    const found = result.current.getElementsByIds(['a', 'b', 'missing']);
    // 'a' is selectable; 'b' falls back to getElementById.
    expect(found).toEqual([a, b]);
  });

  it('selectContextTargets returns active selection when right-clicking an active schema', () => {
    const a = makeElement('a');
    const b = makeElement('b');
    const onEdit = vi.fn();
    const { result } = renderHook(() =>
      useSelectionHelpers({
        activeElements: [a, b],
        hoveringSchemaId: null,
        schemasList: [[schema('a'), schema('b'), schema('c')]],
        pageCursor: 0,
        onEdit,
      }),
    );

    const targets = result.current.selectContextTargets(schema('a'), a);
    expect(targets.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('selectContextTargets returns just the right-clicked schema when not in active selection', () => {
    const a = makeElement('a');
    const c = makeElement('c');
    const { result } = renderHook(() =>
      useSelectionHelpers({
        activeElements: [a],
        hoveringSchemaId: null,
        schemasList: [[schema('a'), schema('c')]],
        pageCursor: 0,
        onEdit: vi.fn(),
      }),
    );

    const targets = result.current.selectContextTargets(schema('c'), c);
    expect(targets.map((t) => t.id)).toEqual(['c']);
  });

  it('toggleShiftClickSelection adds a non-selected schema to the active set', () => {
    const a = makeElement('a');
    makeElement('b');
    const onEdit = vi.fn();
    const onEditingChange = vi.fn();
    const { result } = renderHook(() =>
      useSelectionHelpers({
        activeElements: [a],
        hoveringSchemaId: null,
        schemasList: [[schema('a'), schema('b')]],
        pageCursor: 0,
        onEdit,
        onEditingChange,
      }),
    );

    const target = document.getElementById('b') as HTMLElement;
    result.current.toggleShiftClickSelection(schema('b'), target);

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect((onEdit.mock.calls[0][0] as HTMLElement[]).map((e) => e.id).sort()).toEqual(['a', 'b']);
    expect(onEditingChange).toHaveBeenCalledWith(false);
  });

  it('toggleShiftClickSelection removes an already-selected schema from the active set', () => {
    const a = makeElement('a');
    const b = makeElement('b');
    const onEdit = vi.fn();
    const { result } = renderHook(() =>
      useSelectionHelpers({
        activeElements: [a, b],
        hoveringSchemaId: null,
        schemasList: [[schema('a'), schema('b')]],
        pageCursor: 0,
        onEdit,
      }),
    );

    result.current.toggleShiftClickSelection(schema('b'), b);

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect((onEdit.mock.calls[0][0] as HTMLElement[]).map((e) => e.id)).toEqual(['a']);
  });
});
