import hotkeysJs from 'hotkeys-js';
import { useContext } from 'react';
import {
  cloneDeep,
  ZOOM,
  getB64BasePdf,
  b64toUint8Array,
  Template,
  BasePdf,
  SchemaForUI,
  Size,
  isBlankPdf,
  PluginRegistry,
  isAnchoredLayout as commonIsAnchoredLayout,
  buildSchemaIndex,
  resolveAnchorX,
  resolveAnchorY,
  reverseAnchorOffsetX,
  reverseAnchorOffsetY,
  findAnchorReferentX,
  findAnchorReferentY,
} from '@pdfweave/common';
import type {
  AnchoredLayoutRule,
  HorizontalAnchorRule,
  SchemaLayoutRule,
  VerticalAnchorRule,
} from '@pdfweave/common';
import { pdf2size } from '@pdfweave/converter';
import { DEFAULT_MAX_ZOOM, RULER_HEIGHT } from './constants.js';
import { OptionsContext } from './contexts.js';

// Define a type for the hotkeys function with additional properties
type HotkeysFunction = {
  (keys: string, callback: (e: KeyboardEvent, handler: { shortcut: string }) => void): unknown;
  shift: boolean;
  unbind: (keys: string) => void;
};

// Create a simple mock for hotkeys to avoid TypeScript errors
const hotkeys = function (
  keys: string,
  callback: (e: KeyboardEvent, handler: { shortcut: string }) => void,
) {
  return hotkeysJs(keys, callback);
} as HotkeysFunction;

// Add properties to the hotkeys function
hotkeys.shift = false;
hotkeys.unbind = function (keys: string) {
  // Do nothing if hotkeysJs doesn't have unbind
  const hotkeysFn = hotkeysJs as unknown as { unbind?: (keys: string) => void };
  if (typeof hotkeysFn.unbind === 'function') {
    hotkeysFn.unbind(keys);
  }
};

export const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c == 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const set = <T extends object>(obj: T, path: string | string[], value: unknown) => {
  path = Array.isArray(path) ? path : path.replace(/\[/g, '.').replace(/\]/g, '').split('.');
  let src: Record<string, unknown> = obj as Record<string, unknown>;
  path.forEach((key, index, array) => {
    if (index == path.length - 1) {
      src[key] = value;
    } else {
      if (!Object.prototype.hasOwnProperty.call(src, key)) {
        const next = array[index + 1];
        src[key] = String(Number(next)) === next ? [] : {};
      }
      src = src[key] as Record<string, unknown>;
    }
  });
};

export const debounce = <T extends (...args: unknown[]) => unknown>(cb: T, wait = 20) => {
  let h: null | ReturnType<typeof setTimeout> = null;
  const callable = (...args: Parameters<T>) => {
    if (h) clearTimeout(h);
    h = setTimeout(() => cb(...args), wait);
  };
  return callable as T;
};

const shift = (number: number, precision: number, reverseShift: boolean) => {
  if (reverseShift) {
    precision = -precision;
  }
  const numArray = `${number}`.split('e');

  return Number(`${numArray[0]}e${numArray[1] ? Number(numArray[1]) + precision : precision}`);
};

export const round = (number: number, precision: number) => {
  return shift(Math.round(shift(number, precision, false)), precision, true);
};

export const flatten = <T>(arr: T[][]): T[] => ([] as T[]).concat(...arr);

const up = 'up';
const shiftUp = 'shift+up';
const down = 'down';
const shiftDown = 'shift+down';
const left = 'left';
const shiftLeft = 'shift+left';
const right = 'right';
const shiftRight = 'shift+right';

const rmWin = 'backspace';
const rmMac = 'delete';
const esc = 'esc';
const copyWin = 'ctrl+c';
const copyMac = 'command+c';
const pasteWin = 'ctrl+v';
const pasteMac = 'command+v';
// Note: undo/redo are NOT registered with hotkeys-js. They are bound below as a
// direct DOM listener so we can match on event.code (the physical key position)
// rather than event.key (the layout-dependent label). On German QWERTZ keyboards
// the Y/Z labels are swapped relative to US QWERTY, which made the previous
// `ctrl+y` (redo) / `ctrl+z` (undo) bindings effectively reversed under the
// hotkeys-js letter-matching path. See pdfme/pdfme#1465.
const saveWin = 'ctrl+s';
const saveMac = 'command+s';
const selectAllWin = 'ctrl+a';
const selectAllMac = 'command+a';

const keys = [
  up,
  shiftUp,
  down,
  shiftDown,
  left,
  shiftLeft,
  right,
  shiftRight,
  rmMac,
  rmWin,
  esc,
  copyWin,
  copyMac,
  pasteWin,
  pasteMac,
  saveWin,
  saveMac,
  selectAllWin,
  selectAllMac,
];

// Module-level holder so destroyShortCuts can detach the undo/redo listener.
let undoRedoHandler: ((event: KeyboardEvent) => void) | null = null;

export const initShortCuts = (arg: {
  move: (command: 'up' | 'down' | 'left' | 'right', isShift: boolean) => void;
  remove: () => void;
  esc: () => void;
  copy: () => void;
  paste: () => void;
  redo: () => void;
  undo: () => void;
  save: () => void;
  selectAll: () => void;
}) => {
  // Bind undo/redo by physical key code (event.code) so the binding is
  // independent of keyboard layout. event.key is layout-dependent — on a
  // German QWERTZ keyboard the Y/Z labels are swapped, which made the
  // letter-based bindings effectively reversed (pdfme/pdfme#1465).
  //
  // Cross-platform binding (matches VS Code, Figma, Google Docs):
  //   Ctrl/Cmd + Z          → undo
  //   Ctrl/Cmd + Shift + Z  → redo
  //
  // Ctrl+Y has been removed entirely: on US layouts it conventionally means
  // redo, on German layouts it conventionally means undo, and binding it to
  // either choice breaks the other audience.
  if (typeof window !== 'undefined') {
    undoRedoHandler = (event: KeyboardEvent) => {
      if (event.code !== 'KeyZ') return;
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      // Don't interfere with text-editing inputs/contenteditable.
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
      }
      event.preventDefault();
      if (event.shiftKey) {
        arg.redo();
      } else {
        arg.undo();
      }
    };
    window.addEventListener('keydown', undoRedoHandler);
  }

  hotkeys(keys.join(), (e: KeyboardEvent, handler: { shortcut: string }) => {
    switch (handler.shortcut) {
      case up:
      case shiftUp:
        e.preventDefault();
        arg.move('up', hotkeys.shift);
        break;
      case down:
      case shiftDown:
        e.preventDefault();
        arg.move('down', hotkeys.shift);
        break;
      case left:
      case shiftLeft:
        e.preventDefault();
        arg.move('left', hotkeys.shift);
        break;
      case right:
      case shiftRight:
        e.preventDefault();
        arg.move('right', hotkeys.shift);
        break;
      case rmWin:
      case rmMac:
        arg.remove();
        break;
      case esc:
        arg.esc();
        break;
      case copyWin:
      case copyMac:
        arg.copy();
        break;
      case pasteWin:
      case pasteMac:
        arg.paste();
        break;
      case saveWin:
      case saveMac:
        e.preventDefault();
        arg.save();
        break;
      case selectAllWin:
      case selectAllMac:
        e.preventDefault();
        arg.selectAll();
        break;
      default:
        break;
    }
  });
};

export const destroyShortCuts = () => {
  hotkeys.unbind(keys.join());
  if (typeof window !== 'undefined' && undoRedoHandler) {
    window.removeEventListener('keydown', undoRedoHandler);
    undoRedoHandler = null;
  }
};

/**
 * Guess the MIME type by checking the first few bytes of the ArrayBuffer.
 * Currently checks for PNG, JPEG, and GIF signatures.
 */
function detectMimeType(arrayBuffer: ArrayBuffer): string {
  const dataView = new DataView(arrayBuffer);

  // Check for PNG signature: 0x89 0x50 0x4E 0x47
  if (
    dataView.getUint8(0) === 0x89 &&
    dataView.getUint8(1) === 0x50 &&
    dataView.getUint8(2) === 0x4e &&
    dataView.getUint8(3) === 0x47
  ) {
    return 'image/png';
  }

  // Check for JPEG signature: 0xFF 0xD8 0xFF
  if (
    dataView.getUint8(0) === 0xff &&
    dataView.getUint8(1) === 0xd8 &&
    dataView.getUint8(2) === 0xff
  ) {
    return 'image/jpeg';
  }

  return ''; // Unknown type
}

export const arrayBufferToBase64 = (arrayBuffer: ArrayBuffer): string => {
  // Detect the MIME type
  const mimeType = detectMimeType(arrayBuffer);

  // Convert ArrayBuffer to raw Base64
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64String = btoa(binary);

  // Optionally prepend a data: URL if a known MIME type is found;
  // otherwise just return the raw Base64.
  if (mimeType) {
    return `data:${mimeType};base64,${base64String}`;
  } else {
    // or you can default to `application/octet-stream` if unknown
    return `data:application/octet-stream;base64,${base64String}`;
  }
};

const getPersistedSchemaId = (schema: SchemaForUI | Template['schemas'][number][number]): string | null => {
  const id = (schema as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 0 ? id : null;
};

const isAnchoredLayoutRule = (layout: unknown): layout is Extract<SchemaLayoutRule, { mode: 'anchored' }> =>
  typeof layout === 'object' &&
  layout !== null &&
  (layout as { mode?: unknown }).mode === 'anchored';

const normalizeAnchorRefsForUI = (page: SchemaForUI[]): void => {
  const lookup = new Map<string, SchemaForUI>();
  page.forEach((schema) => {
    [schema.name, schema.id]
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .forEach((id) => lookup.set(id, schema));
  });

  page.forEach((schema) => {
    const layout = (schema as SchemaForUI & { layout?: SchemaLayoutRule }).layout;
    if (!isAnchoredLayoutRule(layout)) return;

    if (layout.x.mode !== 'pageLeft') {
      const target = lookup.get(layout.x.ref.schemaId);
      if (target) layout.x.ref.schemaId = target.id;
    }
    if (layout.y.mode !== 'pageTop') {
      const target = lookup.get(layout.y.ref.schemaId);
      if (target) layout.y.ref.schemaId = target.id;
    }
  });
};

const convertSchemasForUI = (template: Template): SchemaForUI[][] => {
  const seenIds = new Set<string>();
  template.schemas.forEach((page) => {
    page.forEach((schema) => {
      const existingId = getPersistedSchemaId(schema);
      const id = existingId && !seenIds.has(existingId) ? existingId : uuid();
      seenIds.add(id);
      (schema as SchemaForUI).id = id;
      (schema as SchemaForUI).content = schema.content || '';
      schema.readOnly = true;
      schema.required = false;
    });
    normalizeAnchorRefsForUI(page as SchemaForUI[]);
  });

  return template.schemas as SchemaForUI[][];
};

export const template2SchemasList = async (_template: Template) => {
  const template = cloneDeep(_template);
  const { basePdf, schemas } = template;
  const schemasForUI = convertSchemasForUI(template);

  let pageSizes: Size[] = [];
  if (isBlankPdf(basePdf)) {
    pageSizes = schemas.map(() => ({
      width: basePdf.width,
      height: basePdf.height,
    }));
  } else {
    const b64BasePdf = await getB64BasePdf(basePdf);
    // pdf2size accepts both ArrayBuffer and Uint8Array
    const pdfArrayBuffer = b64toUint8Array(b64BasePdf);

    pageSizes = await pdf2size(pdfArrayBuffer);
  }

  const ssl = schemasForUI.length;
  const psl = pageSizes.length;

  return (
    ssl < psl
      ? schemasForUI.concat(Array.from({ length: psl - ssl }, () => cloneDeep([])))
      : schemasForUI.slice(0, pageSizes.length)
  ).map((schema, i) => {
    Object.values(schema).forEach((value) => {
      const { width: pageWidth, height: pageHeight } = pageSizes[i];
      // Rotation-aware overflow check. The drag path (Canvas/index.tsx) lets
      // the un-rotated top-left go negative when the rotated bounding box
      // still fits on the page (pdfme#284). Without the same awareness here,
      // persistence would snap rotated schemas back inside the un-rotated
      // bounds on the next template load — silently undoing the user's drag.
      const rotate = (value as { rotate?: number }).rotate ?? 0;
      const offsets = getRotatedBoundingBoxOffsets(value.width, value.height, rotate);
      const rotatedRight = value.position.x + offsets.maxX;
      const rotatedBottom = value.position.y + offsets.maxY;
      const rotatedLeft = value.position.x + offsets.minX;
      const rotatedTop = value.position.y + offsets.minY;
      // Snap the rotated bounding box inside [0, pageWidth] / [0, pageHeight].
      // For rotated schemas this can yield a negative un-rotated x/y, which
      // is the correct stored value (matches the drag path).
      if (rotatedRight > pageWidth) {
        value.position.x -= rotatedRight - pageWidth;
      }
      if (rotatedBottom > pageHeight) {
        value.position.y -= rotatedBottom - pageHeight;
      }
      if (rotatedLeft < 0) {
        value.position.x -= rotatedLeft;
      }
      if (rotatedTop < 0) {
        value.position.y -= rotatedTop;
      }
    });

    return schema;
  });
};

export const schemasList2template = (schemasList: SchemaForUI[][], basePdf: BasePdf): Template => ({
  schemas: cloneDeep(schemasList).map((page) =>
    page.map((schema) => {
      schema.readOnly = true;
      schema.required = false;
      return schema;
    }),
  ),
  basePdf,
});

export const getUniqueSchemaName = (arg: {
  copiedSchemaName: string;
  schema: SchemaForUI[];
  stackUniqueSchemaNames: string[];
}) => {
  const { copiedSchemaName, schema, stackUniqueSchemaNames } = arg;
  const schemaNames = schema.map((s) => s.name).concat(stackUniqueSchemaNames);
  const tmp: { [originalName: string]: number } = schemaNames.reduce(
    (acc, cur) => Object.assign(acc, { originalName: cur, copiedNum: 0 }),
    {},
  );
  const extractOriginalName = (name: string) => name.replace(/ copy$| copy [0-9]*$/, '');
  schemaNames
    .filter((name) => / copy$| copy [0-9]*$/.test(name))
    .forEach((name) => {
      const originalName = extractOriginalName(name);
      const match = name.match(/[0-9]*$/);
      const copiedNum = match && match[0] ? Number(match[0]) : 1;
      if ((tmp[originalName] ?? 0) < copiedNum) {
        tmp[originalName] = copiedNum;
      }
    });

  const originalName = extractOriginalName(copiedSchemaName);
  if (tmp[originalName]) {
    const copiedNum = tmp[originalName];
    const uniqueName = `${originalName} copy ${copiedNum + 1}`;
    stackUniqueSchemaNames.push(uniqueName);

    return uniqueName;
  }
  const uniqueName = `${copiedSchemaName} copy`;
  stackUniqueSchemaNames.push(uniqueName);

  return uniqueName;
};

export const moveCommandToChangeSchemasArg = (props: {
  command: 'up' | 'down' | 'left' | 'right';
  activeSchemas: SchemaForUI[];
  isShift: boolean;
  pageSize: Size;
}) => {
  const { command, activeSchemas, isShift, pageSize } = props;
  const key = command === 'up' || command === 'down' ? 'y' : 'x';
  const num = isShift ? 0.1 : 1;

  const getValue = (as: SchemaForUI) => {
    let value = 0;
    const { position } = as;
    switch (command) {
      case 'up':
        value = round(position.y - num, 2);
        break;
      case 'down':
        value = round(position.y + num, 2);
        break;
      case 'left':
        value = round(position.x - num, 2);
        break;
      case 'right':
        value = round(position.x + num, 2);
        break;
      default:
        break;
    }

    return value > 0 ? value : 0;
  };

  return activeSchemas.map((as) => {
    let value = getValue(as);
    const { width, height } = as;
    if (key === 'x') {
      value = value > pageSize.width - width ? round(pageSize.width - width, 2) : value;
    } else {
      value = value > pageSize.height - height ? round(pageSize.height - height, 2) : value;
    }

    return { key: `position.${key}`, value, schemaId: as.id };
  });
};

export const getPagesScrollTopByIndex = (pageSizes: Size[], index: number, scale: number) => {
  return pageSizes
    .slice(0, index)
    .reduce((acc, cur) => acc + (cur.height * ZOOM + RULER_HEIGHT * scale) * scale, 0);
};

/**
 * Computes the axis-aligned bounding box of a rectangle that has been rotated
 * about its center. The returned values are offsets from the un-rotated
 * top-left corner: e.g. `minX` is negative when the rotated box pokes past the
 * left edge of the original rectangle.
 *
 * pdfme#284: positions for rotated schemas are still stored as the un-rotated
 * top-left corner. The bounds check therefore needs to know how much extra
 * space the rotation consumes on each side so it can let the un-rotated
 * top-left go negative without dropping the visible content off-canvas.
 */
export const getRotatedBoundingBoxOffsets = (
  width: number,
  height: number,
  rotateDegrees: number,
) => {
  const rotation = ((rotateDegrees % 360) + 360) % 360;
  if (rotation === 0) {
    return { minX: 0, minY: 0, maxX: width, maxY: height };
  }
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = width / 2;
  const cy = height / 2;
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ].map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos,
    };
  });
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
};

const handlePositionSizeChange = (
  schema: SchemaForUI,
  key: string,
  value: unknown,
  basePdf: BasePdf,
  pageSize: Size,
) => {
  const padding = isBlankPdf(basePdf) ? basePdf.padding : [0, 0, 0, 0];
  const [pt, pr, pb, pl] = padding;
  const { width: pw, height: ph } = pageSize;
  const calcBounds = (v: unknown, min: number, max: number) =>
    Math.min(Math.max(Number(v), min), max);
  // Mirror the rotation-aware drag/persistence path (pdfme#284): clamp the
  // rotated bounding box, not the un-rotated top-left, so prop-panel edits
  // don't snap rotated schemas back inside the un-rotated bounds.
  const rotate = (schema as { rotate?: number }).rotate ?? 0;
  const offsets = getRotatedBoundingBoxOffsets(schema.width, schema.height, rotate);
  if (key === 'position.x') {
    schema.position.x = calcBounds(value, pl - offsets.minX, pw - pr - offsets.maxX);
  } else if (key === 'position.y') {
    schema.position.y = calcBounds(value, pt - offsets.minY, ph - pb - offsets.maxY);
  } else if (key === 'width') {
    schema.width = calcBounds(value, 0, pw - schema.position.x - pr);
  } else if (key === 'height') {
    schema.height = calcBounds(value, 0, ph - schema.position.y - pb);
  }
};

/**
 * Re-export the shared anchor-layout type-guard from `@pdfweave/common` so
 * existing UI consumers that import `isAnchoredLayout` from this module
 * keep working. The logic itself lives in `anchorGeometry`.
 */
export const isAnchoredLayout = commonIsAnchoredLayout;

const getSchemaLayout = (schema: SchemaForUI): SchemaLayoutRule | undefined =>
  (schema as SchemaForUI & { layout?: SchemaLayoutRule }).layout;

const setSchemaLayout = (schema: SchemaForUI, layout: SchemaLayoutRule) => {
  (schema as SchemaForUI & { layout?: SchemaLayoutRule }).layout = layout;
};

const roundOffset = (value: number): number => round(value, 2);

/**
 * Forward-resolve anchored schemas after a sibling's position/size change.
 * Anchor geometry is delegated to `@pdfweave/common` (anchorGeometry); the
 * UI-specific concerns kept here are:
 *   - clamping resolved positions through `handlePositionSizeChange` so an
 *     anchored child can't be pushed outside the printable area, and
 *   - mm-rounding to 2dp so the prop-panel display doesn't oscillate.
 */
const resolveAnchoredSchemas = (
  schemas: SchemaForUI[],
  basePdf: BasePdf,
  pageSize: Size,
): void => {
  const lookup = buildSchemaIndex(schemas);

  for (let pass = 0; pass < schemas.length; pass += 1) {
    let changed = false;

    for (const schema of schemas) {
      const layout = getSchemaLayout(schema);
      if (!isAnchoredLayout(layout)) continue;

      const nextX = resolveAnchorX(schema, lookup);
      const nextY = resolveAnchorY(schema, lookup);
      const previousX = schema.position.x;
      const previousY = schema.position.y;

      if (nextX !== null) {
        handlePositionSizeChange(schema, 'position.x', round(nextX, 2), basePdf, pageSize);
      }
      if (nextY !== null) {
        handlePositionSizeChange(schema, 'position.y', round(nextY, 2), basePdf, pageSize);
      }

      if (
        Math.abs(previousX - schema.position.x) > 0.01 ||
        Math.abs(previousY - schema.position.y) > 0.01
      ) {
        changed = true;
      }
    }

    if (!changed) return;
  }
};

/**
 * Reverse-resolve anchor offsets after the user drags an anchored schema
 * by hand. For each axis listed in `axesBySchemaId`, recompute `offsetMm`
 * so that a subsequent forward resolve produces the schema's current
 * absolute position. Anchor geometry is delegated to `@pdfweave/common`
 * (anchorGeometry); the UI-specific concern kept here is mm-rounding the
 * resulting offset to 2dp so prop-panel display doesn't oscillate.
 */
const reverseAnchoredOffsets = (
  schemas: SchemaForUI[],
  axesBySchemaId: Map<string, Set<'x' | 'y'>>,
): void => {
  if (axesBySchemaId.size === 0) return;

  const lookup = buildSchemaIndex(schemas);
  axesBySchemaId.forEach((axes, schemaId) => {
    const schema = schemas.find((s) => s.id === schemaId);
    if (!schema) return;

    const layout = getSchemaLayout(schema);
    if (!isAnchoredLayout(layout)) return;

    let nextLayout: AnchoredLayoutRule = layout;
    if (axes.has('x')) {
      const referent = findAnchorReferentX(schema, lookup);
      const nextOffset = roundOffset(
        reverseAnchorOffsetX(schema.position.x, nextLayout.x, schema.width, referent),
      );
      const nextX: HorizontalAnchorRule = { ...nextLayout.x, offsetMm: nextOffset };
      nextLayout = { ...nextLayout, x: nextX };
    }
    if (axes.has('y')) {
      const referent = findAnchorReferentY(schema, lookup);
      const nextOffset = roundOffset(
        reverseAnchorOffsetY(schema.position.y, nextLayout.y, referent),
      );
      const nextY: VerticalAnchorRule = { ...nextLayout.y, offsetMm: nextOffset };
      nextLayout = { ...nextLayout, y: nextY };
    }

    setSchemaLayout(schema, nextLayout);
  });
};

const markAnchoredPositionChange = (
  axesBySchemaId: Map<string, Set<'x' | 'y'>>,
  schema: SchemaForUI,
  key: string,
) => {
  const layout = getSchemaLayout(schema);
  if (!isAnchoredLayout(layout)) return;

  const axis = key === 'position.x' ? 'x' : key === 'position.y' ? 'y' : null;
  if (!axis) return;

  const axes = axesBySchemaId.get(schema.id) ?? new Set<'x' | 'y'>();
  axes.add(axis);
  axesBySchemaId.set(schema.id, axes);
};

const handleTypeChange = (
  schema: SchemaForUI,
  key: string,
  value: unknown,
  pluginsRegistry: PluginRegistry,
) => {
  if (key !== 'type') return;
  const keysToKeep = ['id', 'name', 'type', 'position'];
  Object.keys(schema).forEach((key) => {
    if (!keysToKeep.includes(key)) {
      delete schema[key as keyof typeof schema];
    }
  });

  const plugin = pluginsRegistry.findByType(value as string);

  // Apply default schema properties if available
  if (plugin?.propPanel.defaultSchema) {
    const defaultSchema = plugin.propPanel.defaultSchema;
    const schemaRecord = schema as Record<string, unknown>;

    // Use a type-safe approach to copy properties
    for (const key of Object.keys(defaultSchema)) {
      // Only add properties that don't already exist in the schema
      if (!Object.prototype.hasOwnProperty.call(schema, key)) {
        const propertyValue = defaultSchema[key];
        if (propertyValue !== undefined) {
          schemaRecord[key] = propertyValue;
        }
      }
    }
  }
  schema.readOnly = true;
  schema.required = false;
};

export const changeSchemas = (args: {
  objs: { key: string; value: unknown; schemaId: string }[];
  schemas: SchemaForUI[];
  basePdf: BasePdf;
  pluginsRegistry: PluginRegistry;
  pageSize: { width: number; height: number };
  commitSchemas: (newSchemas: SchemaForUI[]) => void;
}) => {
  const { objs, schemas, basePdf, pluginsRegistry, pageSize, commitSchemas } = args;
  const anchoredPositionChanges = new Map<string, Set<'x' | 'y'>>();
  const newSchemas = objs.reduce((acc, { key, value, schemaId }) => {
    const tgt = acc.find((s) => s.id === schemaId);
    if (!tgt) return acc;
    // Assign to reference
    set(tgt, key, value);

    if (key === 'type') {
      handleTypeChange(tgt, key, value, pluginsRegistry);
    } else if (['position.x', 'position.y', 'width', 'height'].includes(key)) {
      handlePositionSizeChange(tgt, key, value, basePdf, pageSize);
      markAnchoredPositionChange(anchoredPositionChanges, tgt, key);
    }

    return acc;
  }, cloneDeep(schemas));
  reverseAnchoredOffsets(newSchemas, anchoredPositionChanges);
  resolveAnchoredSchemas(newSchemas, basePdf, pageSize);
  commitSchemas(newSchemas);
};

export const useMaxZoom = () => {
  const options = useContext(OptionsContext);

  return options.maxZoom ? options.maxZoom / 100 : DEFAULT_MAX_ZOOM;
};

export const setFontNameRecursively = (
  obj: Record<string, unknown>,
  fontName: string,
  seen = new WeakSet(),
): void => {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return;
  seen.add(obj);

  for (const key in obj) {
    if (
      key === 'fontName' &&
      Object.prototype.hasOwnProperty.call(obj, key) &&
      obj[key] === undefined
    ) {
      obj[key] = fontName;
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      setFontNameRecursively(obj[key] as Record<string, unknown>, fontName, seen);
    }
  }
};
