import { useCallback, type MutableRefObject } from 'react';
import type MoveableComponent from 'react-moveable';

interface SelectoDragStartEvent {
  inputEvent: Event;
  isTrusted: boolean;
  stop: () => void;
}

interface SelectoSelectEvent {
  inputEvent: Event;
  added: (HTMLElement | SVGElement)[];
  selected: (HTMLElement | SVGElement)[];
  isDragStartEnd: boolean;
}

interface UseMarqueeSelectionParams {
  paperRefs: MutableRefObject<HTMLDivElement[]>;
  pageCursor: number;
  moveable: MutableRefObject<MoveableComponent | null>;
  activeElements: HTMLElement[];
  deleteButtonId: string;
  onEdit: (targets: HTMLElement[]) => void;
  removeSchemas: (ids: string[]) => void;
  setEditing: (editing: boolean) => void;
  setIsPressShiftKey: (pressed: boolean) => void;
}

/**
 * Wires the react-selecto marquee onDragStart + onSelect handlers Canvas
 * forwards to the Selecto component.
 *
 * onDragStart suppresses marquee on the active Moveable element, clears the
 * active selection when starting from the paper background, and routes the
 * delete-button click to removeSchemas.
 *
 * onSelect implements shift-additive marquee selection and recovers shift
 * state on macOS where keydown is swallowed by global Cmd+Shift+3/4 capture.
 */
export const useMarqueeSelection = ({
  paperRefs,
  pageCursor,
  moveable,
  activeElements,
  deleteButtonId,
  onEdit,
  removeSchemas,
  setEditing,
  setIsPressShiftKey,
}: UseMarqueeSelectionParams) => {
  const onSelectoDragStart = useCallback(
    (e: SelectoDragStartEvent) => {
      const inputEvent = e.inputEvent as MouseEvent | TouchEvent;
      const target = inputEvent.target as Element | null;
      const isMoveableElement = moveable.current?.isMoveableElement(target as Element);

      if ((inputEvent.type === 'touchstart' && e.isTrusted) || isMoveableElement) {
        e.stop();
      }

      if (paperRefs.current[pageCursor] === target) {
        onEdit([]);
      }

      const targetElement = target as HTMLElement | null;
      if (targetElement && targetElement.id === deleteButtonId) {
        removeSchemas(activeElements.map((ae) => ae.id));
      }
    },
    [activeElements, deleteButtonId, moveable, onEdit, pageCursor, paperRefs, removeSchemas],
  );

  const onSelectoSelect = useCallback(
    (e: SelectoSelectEvent) => {
      const inputEvent = e.inputEvent as MouseEvent | TouchEvent;
      const added = e.added as HTMLElement[];
      const selected = e.selected as HTMLElement[];

      const isDragStartInput =
        inputEvent.type === 'mousedown' || inputEvent.type === 'touchstart';
      const isClick = isDragStartInput && e.isDragStartEnd;
      const mouseEvent = inputEvent as MouseEvent;
      const isShiftClick =
        isClick && mouseEvent && typeof mouseEvent.shiftKey === 'boolean' && mouseEvent.shiftKey;
      let newActiveElements: HTMLElement[] = [];

      if (isShiftClick) {
        const nextElements = activeElements.concat(selected.length > 0 ? selected : added);
        newActiveElements = nextElements.filter(
          (element, index, elements) =>
            elements.findIndex((item) => item.id === element.id) === index,
        );
      } else {
        newActiveElements = selected;
      }
      onEdit(newActiveElements);

      if (newActiveElements != activeElements) {
        setEditing(false);
      }

      // For MacOS CMD+SHIFT+3/4 screenshots where the keydown event is never
      // received, also reconcile from mouse state.
      if (mouseEvent && typeof mouseEvent.shiftKey === 'boolean' && !mouseEvent.shiftKey) {
        setIsPressShiftKey(false);
      }
    },
    [activeElements, onEdit, setEditing, setIsPressShiftKey],
  );

  return { onSelectoDragStart, onSelectoSelect };
};
