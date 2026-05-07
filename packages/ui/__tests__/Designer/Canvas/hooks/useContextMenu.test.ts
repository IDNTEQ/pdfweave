import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ChangeSchemas, SchemaForUI, SchemaLayoutRule } from '@pdfweave/common';
import {
  findApplyAnchorSource,
  useContextMenu,
} from '../../../../src/components/Designer/Canvas/hooks/useContextMenu.js';

const anchored = (target: string): Extract<SchemaLayoutRule, { mode: 'anchored' }> => ({
  mode: 'anchored',
  x: { mode: 'afterRightEdge', ref: { schemaId: target, offsetMm: 0 } },
  y: { mode: 'pageTop' },
});

const schema = (
  id: string,
  layout?: Extract<SchemaLayoutRule, { mode: 'anchored' }>,
): SchemaForUI =>
  ({
    id,
    name: id,
    type: 'text',
    position: { x: 0, y: 0 },
    width: 50,
    height: 20,
    content: '',
    ...(layout ? { layout } : {}),
  }) as unknown as SchemaForUI;

const mkActions = () => ({
  copy: vi.fn(),
  cut: vi.fn(),
  paste: vi.fn(),
  duplicate: vi.fn(),
  group: vi.fn(),
  ungroup: vi.fn(),
  remove: vi.fn(),
  bringToFront: vi.fn(),
  sendToBack: vi.fn(),
});

describe('findApplyAnchorSource', () => {
  it('returns the last anchored schema in render order', () => {
    const a = schema('a', anchored('z'));
    const b = schema('b');
    const c = schema('c', anchored('z'));
    const result = findApplyAnchorSource([a, b, c], ['a', 'b', 'c']);
    expect(result?.schema.id).toBe('c');
  });

  it('returns null when no schema has an anchored layout', () => {
    expect(findApplyAnchorSource([schema('a'), schema('b')], ['a', 'b'])).toBeNull();
  });
});

describe('useContextMenu', () => {
  it('starts closed', () => {
    const { result } = renderHook(() =>
      useContextMenu({
        pageCursor: 0,
        schemasList: [[schema('a')]],
        changeSchemas: vi.fn() as unknown as ChangeSchemas,
        designerActions: mkActions(),
      }),
    );

    expect(result.current.contextMenu).toBeNull();
    expect(result.current.contextSchemas).toEqual([]);
    expect(result.current.applyAnchorSource).toBeNull();
  });

  it('contextSchemas filters the page schemas to the menu selection', () => {
    const a = schema('a');
    const b = schema('b');
    const { result } = renderHook(() =>
      useContextMenu({
        pageCursor: 0,
        schemasList: [[a, b]],
        changeSchemas: vi.fn() as unknown as ChangeSchemas,
        designerActions: mkActions(),
      }),
    );

    act(() => {
      result.current.setContextMenu({ x: 10, y: 20, schemaIds: ['b'] });
    });

    expect(result.current.contextSchemas).toEqual([b]);
  });

  it('applyAnchorSource is null when fewer than 2 schemas are selected', () => {
    const a = schema('a', anchored('z'));
    const { result } = renderHook(() =>
      useContextMenu({
        pageCursor: 0,
        schemasList: [[a]],
        changeSchemas: vi.fn() as unknown as ChangeSchemas,
        designerActions: mkActions(),
      }),
    );

    act(() => {
      result.current.setContextMenu({ x: 0, y: 0, schemaIds: ['a'] });
    });

    expect(result.current.applyAnchorSource).toBeNull();
  });

  it('applyAnchorSource is the anchored schema when selection has 2+ and one is anchored', () => {
    const a = schema('a');
    const b = schema('b', anchored('z'));
    const { result } = renderHook(() =>
      useContextMenu({
        pageCursor: 0,
        schemasList: [[a, b]],
        changeSchemas: vi.fn() as unknown as ChangeSchemas,
        designerActions: mkActions(),
      }),
    );

    act(() => {
      result.current.setContextMenu({ x: 0, y: 0, schemaIds: ['a', 'b'] });
    });

    expect(result.current.applyAnchorSource?.schema.id).toBe('b');
  });

  it('dispatches each menu action to the corresponding designerActions method and closes', () => {
    const actions = mkActions();
    const { result } = renderHook(() =>
      useContextMenu({
        pageCursor: 0,
        schemasList: [[schema('a'), schema('b')]],
        changeSchemas: vi.fn() as unknown as ChangeSchemas,
        designerActions: actions,
      }),
    );

    // Each set + dispatch must be in separate act() blocks because
    // onContextMenuAction is memoized against the rendered value of contextMenu.
    act(() => {
      result.current.setContextMenu({ x: 0, y: 0, schemaIds: ['a', 'b'] });
    });
    act(() => {
      result.current.onContextMenuAction('copy');
    });
    expect(actions.copy).toHaveBeenCalledWith(['a', 'b']);
    expect(result.current.contextMenu).toBeNull();

    act(() => {
      result.current.setContextMenu({ x: 0, y: 0, schemaIds: ['a'] });
    });
    act(() => {
      result.current.onContextMenuAction('paste');
    });
    expect(actions.paste).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.setContextMenu({ x: 0, y: 0, schemaIds: ['a'] });
    });
    act(() => {
      result.current.onContextMenuAction('delete');
    });
    expect(actions.remove).toHaveBeenCalledWith(['a']);

    act(() => {
      result.current.setContextMenu({ x: 0, y: 0, schemaIds: ['a'] });
    });
    act(() => {
      result.current.onContextMenuAction('bringToFront');
    });
    expect(actions.bringToFront).toHaveBeenCalledWith(['a']);
  });

  it('applyAnchorToSelection writes layout to every other schema (skipping the source)', () => {
    const changeSchemas = vi.fn();
    const a = schema('a');
    // Anchor source 'b' targets a schema OUTSIDE the selection so neither 'a'
    // nor 'c' is filtered out by layoutTargetsSchema.
    const b = schema('b', anchored('outside'));
    const c = schema('c');
    const { result } = renderHook(() =>
      useContextMenu({
        pageCursor: 0,
        schemasList: [[a, b, c]],
        changeSchemas: changeSchemas as unknown as ChangeSchemas,
        designerActions: mkActions(),
      }),
    );

    act(() => {
      result.current.setContextMenu({ x: 0, y: 0, schemaIds: ['a', 'b', 'c'] });
    });
    act(() => {
      result.current.onContextMenuAction('applyAnchorToSelection');
    });

    expect(changeSchemas).toHaveBeenCalledTimes(1);
    const [changes] = changeSchemas.mock.calls[0] as [Array<{ schemaId: string }>];
    const ids = changes.map((c) => c.schemaId);
    // 'b' is the source -> skipped. 'a' and 'c' get the anchor.
    expect(ids.sort()).toEqual(['a', 'c']);
  });

  it('applyAnchorToSelection skips schemas that the source layout already targets', () => {
    const changeSchemas = vi.fn();
    const a = schema('a');
    // Layout that targets 'a' specifically.
    const b = schema('b', anchored('a'));
    const { result } = renderHook(() =>
      useContextMenu({
        pageCursor: 0,
        schemasList: [[a, b]],
        changeSchemas: changeSchemas as unknown as ChangeSchemas,
        designerActions: mkActions(),
      }),
    );

    act(() => {
      result.current.setContextMenu({ x: 0, y: 0, schemaIds: ['a', 'b'] });
      result.current.onContextMenuAction('applyAnchorToSelection');
    });

    // 'b' is the source (skipped), and 'a' is the layout target (skipped).
    // Result: no changes -> changeSchemas not called.
    expect(changeSchemas).not.toHaveBeenCalled();
  });

  it('closeContextMenu clears the menu', () => {
    const { result } = renderHook(() =>
      useContextMenu({
        pageCursor: 0,
        schemasList: [[schema('a')]],
        changeSchemas: vi.fn() as unknown as ChangeSchemas,
        designerActions: mkActions(),
      }),
    );

    act(() => {
      result.current.setContextMenu({ x: 1, y: 2, schemaIds: ['a'] });
    });
    expect(result.current.contextMenu).not.toBeNull();
    act(() => {
      result.current.closeContextMenu();
    });
    expect(result.current.contextMenu).toBeNull();
  });
});
