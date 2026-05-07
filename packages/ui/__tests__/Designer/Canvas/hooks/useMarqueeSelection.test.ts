import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import type MoveableComponent from 'react-moveable';
import { useMarqueeSelection } from '../../../../src/components/Designer/Canvas/hooks/useMarqueeSelection.js';

const makeMoveableRef = (
  isMoveableElement: (element: Element | null) => boolean = () => false,
): React.MutableRefObject<MoveableComponent | null> => ({
  current: { isMoveableElement } as unknown as MoveableComponent,
});

const makeEl = (id: string): HTMLElement => {
  const el = document.createElement('div');
  el.id = id;
  document.body.appendChild(el);
  return el;
};

describe('useMarqueeSelection', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('onDragStart stops the marquee on a Moveable element', () => {
    const stop = vi.fn();
    const onEdit = vi.fn();
    const removeSchemas = vi.fn();
    const moveableElement = makeEl('me');
    const moveable = makeMoveableRef((el) => el === moveableElement);

    const paperRefs: React.MutableRefObject<HTMLDivElement[]> = {
      current: [document.createElement('div')],
    };

    const { result } = renderHook(() =>
      useMarqueeSelection({
        paperRefs,
        pageCursor: 0,
        moveable,
        activeElements: [],
        deleteButtonId: 'delete-btn',
        onEdit,
        removeSchemas,
        setEditing: vi.fn(),
        setIsPressShiftKey: vi.fn(),
      }),
    );

    const inputEvent = new MouseEvent('mousedown');
    Object.defineProperty(inputEvent, 'target', { value: moveableElement });
    result.current.onSelectoDragStart({ inputEvent, isTrusted: true, stop });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
    expect(removeSchemas).not.toHaveBeenCalled();
  });

  it('onDragStart clears the active selection when the user grabs the paper background', () => {
    const onEdit = vi.fn();
    const paperEl = document.createElement('div');
    document.body.appendChild(paperEl);
    const paperRefs: React.MutableRefObject<HTMLDivElement[]> = { current: [paperEl] };

    const { result } = renderHook(() =>
      useMarqueeSelection({
        paperRefs,
        pageCursor: 0,
        moveable: makeMoveableRef(),
        activeElements: [makeEl('a')],
        deleteButtonId: 'delete-btn',
        onEdit,
        removeSchemas: vi.fn(),
        setEditing: vi.fn(),
        setIsPressShiftKey: vi.fn(),
      }),
    );

    const inputEvent = new MouseEvent('mousedown');
    Object.defineProperty(inputEvent, 'target', { value: paperEl });
    result.current.onSelectoDragStart({ inputEvent, isTrusted: true, stop: vi.fn() });

    expect(onEdit).toHaveBeenCalledWith([]);
  });

  it('onDragStart calls removeSchemas on the active selection when the delete button is clicked', () => {
    const onEdit = vi.fn();
    const removeSchemas = vi.fn();
    const a = makeEl('a');
    const b = makeEl('b');
    const deleteBtn = makeEl('delete-btn-id');

    const { result } = renderHook(() =>
      useMarqueeSelection({
        paperRefs: { current: [] },
        pageCursor: 0,
        moveable: makeMoveableRef(),
        activeElements: [a, b],
        deleteButtonId: 'delete-btn-id',
        onEdit,
        removeSchemas,
        setEditing: vi.fn(),
        setIsPressShiftKey: vi.fn(),
      }),
    );

    const inputEvent = new MouseEvent('mousedown');
    Object.defineProperty(inputEvent, 'target', { value: deleteBtn });
    result.current.onSelectoDragStart({ inputEvent, isTrusted: true, stop: vi.fn() });

    expect(removeSchemas).toHaveBeenCalledWith(['a', 'b']);
  });

  it('onSelect with a non-shift mousedown click replaces the selection', () => {
    const onEdit = vi.fn();
    const setEditing = vi.fn();
    const a = makeEl('a');
    const c = makeEl('c');

    const { result } = renderHook(() =>
      useMarqueeSelection({
        paperRefs: { current: [] },
        pageCursor: 0,
        moveable: makeMoveableRef(),
        activeElements: [a],
        deleteButtonId: 'd',
        onEdit,
        removeSchemas: vi.fn(),
        setEditing,
        setIsPressShiftKey: vi.fn(),
      }),
    );

    const inputEvent = new MouseEvent('mousedown', { shiftKey: false });
    result.current.onSelectoSelect({
      inputEvent,
      added: [c],
      selected: [c],
      isDragStartEnd: true,
    });

    const [arg] = onEdit.mock.calls[0] as [HTMLElement[]];
    expect(arg.map((e) => e.id)).toEqual(['c']);
    // newActiveElements !== activeElements -> setEditing(false)
    expect(setEditing).toHaveBeenCalledWith(false);
  });

  it('onSelect with a shift click adds to the existing selection without duplicates', () => {
    const onEdit = vi.fn();
    const a = makeEl('a');
    const b = makeEl('b');

    const { result } = renderHook(() =>
      useMarqueeSelection({
        paperRefs: { current: [] },
        pageCursor: 0,
        moveable: makeMoveableRef(),
        activeElements: [a],
        deleteButtonId: 'd',
        onEdit,
        removeSchemas: vi.fn(),
        setEditing: vi.fn(),
        setIsPressShiftKey: vi.fn(),
      }),
    );

    const inputEvent = new MouseEvent('mousedown', { shiftKey: true });
    result.current.onSelectoSelect({
      inputEvent,
      added: [b],
      selected: [b],
      isDragStartEnd: true,
    });

    const [arg] = onEdit.mock.calls[0] as [HTMLElement[]];
    expect(arg.map((e) => e.id).sort()).toEqual(['a', 'b']);
  });

  it('onSelect clears shift state when the underlying mouse event has shiftKey false', () => {
    const setIsPressShiftKey = vi.fn();

    const { result } = renderHook(() =>
      useMarqueeSelection({
        paperRefs: { current: [] },
        pageCursor: 0,
        moveable: makeMoveableRef(),
        activeElements: [],
        deleteButtonId: 'd',
        onEdit: vi.fn(),
        removeSchemas: vi.fn(),
        setEditing: vi.fn(),
        setIsPressShiftKey,
      }),
    );

    const inputEvent = new MouseEvent('mousedown', { shiftKey: false });
    result.current.onSelectoSelect({
      inputEvent,
      added: [],
      selected: [],
      isDragStartEnd: true,
    });

    expect(setIsPressShiftKey).toHaveBeenCalledWith(false);
  });
});
