import React, { useEffect, useContext, ReactNode, useRef, useMemo } from 'react';
import {
  Mode,
  ZOOM,
  UIRenderProps,
  SchemaForUI,
  BasePdf,
  Schema,
  Plugin,
  UIOptions,
  LayoutMeasureResult,
} from '@pdfweave/common';
import { theme as antdTheme } from 'antd';
import { SELECTABLE_CLASSNAME } from '../constants.js';
import { PluginsRegistry, OptionsContext, I18nContext, CacheContext } from '../contexts.js';

type RendererProps = Omit<
  UIRenderProps<Schema>,
  'schema' | 'rootElement' | 'options' | 'theme' | 'i18n' | '_cache'
> & {
  basePdf: BasePdf;
  schema: SchemaForUI;
  value: string;
  outline: string;
  onChangeHoveringSchemaId?: (id: string | null) => void;
  scale: number;
  selectable?: boolean;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMouseDownCapture?: (event: React.MouseEvent<HTMLDivElement>) => void;
  pageBoundsForClip?: { contentBottomY: number };
  renderedHeight?: number;
  onRenderedHeightChange?: (schemaId: string, height: number) => void;
};

type ReRenderCheckProps = {
  plugin?: Plugin<Schema>;
  value: string;
  mode: Mode;
  scale: number;
  schema: SchemaForUI;
  options: UIOptions;
};

const getMeasuredHeight = (schema: SchemaForUI, result: LayoutMeasureResult): number => {
  if (Array.isArray(result.dynamicHeights) && result.dynamicHeights.length > 0) {
    return result.dynamicHeights.reduce((sum, height) => sum + height, 0);
  }
  if (Array.isArray(result.fragments) && result.fragments.length > 0) {
    return result.fragments.reduce((sum, fragment) => sum + fragment.height, 0);
  }
  return typeof result.height === 'number' ? result.height : schema.height;
};

const isWindowLike = (value: object): boolean =>
  'window' in value && (value as { window?: unknown }).window === value;

const isDomNode = (value: object): boolean => typeof Node !== 'undefined' && value instanceof Node;

export const safeStringifyForRenderKey = (value: unknown): string => {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, current) => {
      // bigint: JSON.stringify throws on bigint by default; produce a stable string.
      if (typeof current === 'bigint') {
        return `[BigInt:${current.toString()}n]`;
      }
      // undefined: silently dropped by JSON.stringify, which can collapse two structurally
      // distinct objects to the same render key. Emit a stable placeholder instead.
      if (typeof current === 'undefined') {
        return '[undefined]';
      }
      // symbol: also dropped/coerced; emit a stable placeholder.
      if (typeof current === 'symbol') {
        return `[Symbol:${current.description ?? ''}]`;
      }
      if (typeof current === 'function') {
        return `[Function ${current.name || 'anonymous'}]`;
      }
      if (typeof current !== 'object' || current === null) {
        // Date is an object; it is converted to an ISO string by Date.prototype.toJSON
        // before reaching the replacer, so it arrives here as a string and is intentionally
        // left as-is (stable, structurally informative, no special branch needed).
        return current;
      }
      if (isWindowLike(current)) {
        return '[Window]';
      }
      if (isDomNode(current)) {
        return `[${current.nodeName}]`;
      }
      if (ArrayBuffer.isView(current)) {
        return `[${current.constructor.name}:${current.byteLength}]`;
      }
      if (current instanceof ArrayBuffer) {
        return `[ArrayBuffer:${current.byteLength}]`;
      }
      if (seen.has(current)) {
        return '[Circular]';
      }
      seen.add(current);
      return current;
    });
  } catch {
    return '[Unserializable]';
  }
};

const renderKeyOptions = (options: UIOptions): UIOptions => {
  const { sampleDataPanel: _sampleDataPanel, ...optionsForKey } = options;
  if (!optionsForKey.font) {
    return optionsForKey;
  }

  return {
    ...optionsForKey,
    font: Object.fromEntries(
      Object.entries(optionsForKey.font).map(([fontName, fontObj]) => [
        fontName,
        { ...fontObj, data: '...' },
      ]),
    ) as UIOptions['font'],
  };
};

const useRenderKey = (arg: ReRenderCheckProps) => {
  const { plugin, value, mode, scale, schema, options } = arg;
  const optionStr = safeStringifyForRenderKey(renderKeyOptions(options));

  return useMemo(() => {
    if (plugin?.uninterruptedEditMode && mode === 'designer') {
      return mode;
    } else {
      return safeStringifyForRenderKey([value, mode, scale, schema, optionStr]);
    }
  }, [value, mode, scale, schema, optionStr, plugin]);
};

const Wrapper = ({
  children,
  mode,
  outline,
  onChangeHoveringSchemaId,
  schema,
  selectable = true,
  onContextMenu,
  onMouseDownCapture,
  pageBoundsForClip,
  renderedHeight,
}: RendererProps & { children: ReactNode }) => {
  const visualHeight = Math.max(schema.height, renderedHeight ?? schema.height);
  const overflowsPageBounds = pageBoundsForClip
    ? schema.position.y + visualHeight > pageBoundsForClip.contentBottomY
    : false;
  const clippedHeight = pageBoundsForClip
    ? Math.max(0, pageBoundsForClip.contentBottomY - schema.position.y)
    : schema.height;
  const clipStyle =
    pageBoundsForClip && overflowsPageBounds
      ? {
          height: Math.min(visualHeight, clippedHeight) * ZOOM,
          overflow: 'hidden',
          maxHeight: clippedHeight * ZOOM,
        }
      : {};

  return (
    <div
      title={schema.name}
      onMouseEnter={() => onChangeHoveringSchemaId && onChangeHoveringSchemaId(schema.id)}
      onMouseLeave={() => onChangeHoveringSchemaId && onChangeHoveringSchemaId(null)}
      onContextMenu={onContextMenu}
      onMouseDownCapture={onMouseDownCapture}
      className={selectable ? SELECTABLE_CLASSNAME : ''}
      id={schema.id}
      style={{
        position: 'absolute',
        cursor: mode === 'form' && !schema.readOnly ? 'pointer' : 'initial',
        height: schema.height * ZOOM,
        width: schema.width * ZOOM,
        top: schema.position.y * ZOOM,
        left: schema.position.x * ZOOM,
        transform: `rotate(${schema.rotate ?? 0}deg)`,
        opacity: schema.opacity ?? 1,
        outline,
        ...clipStyle,
      }}
    >
      {mode === 'form' && schema.required && (
        <span
          data-pdfweave-required-marker="true"
          style={{
            color: 'red',
            position: 'absolute',
            top: -12,
            left: -12,
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          *
        </span>
      )}
      {children}
    </div>
  );
};

const Renderer = (props: RendererProps) => {
  const {
    schema,
    basePdf,
    value,
    mode,
    onChange,
    stopEditing,
    tabIndex,
    placeholder,
    scale,
    onRenderedHeightChange,
  } = props;

  const pluginsRegistry = useContext(PluginsRegistry);
  const options = useContext(OptionsContext);
  const i18n = useContext(I18nContext) as (key: string) => string;
  const { token: theme } = antdTheme.useToken();

  const ref = useRef<HTMLDivElement>(null);
  const _cache = useContext(CacheContext);
  const plugin = pluginsRegistry.findByType(schema.type);
  const renderArgsRef = useRef({
    plugin,
    value,
    schema,
    basePdf,
    mode,
    onChange,
    stopEditing,
    tabIndex,
    placeholder,
    options,
    theme,
    i18n,
    scale,
    _cache,
    onRenderedHeightChange,
  });

  renderArgsRef.current = {
    plugin,
    value,
    schema,
    basePdf,
    mode,
    onChange,
    stopEditing,
    tabIndex,
    placeholder,
    options,
    theme,
    i18n,
    scale,
    _cache,
    onRenderedHeightChange,
  };

  const renderKey = useRenderKey({
    plugin,
    value,
    mode,
    scale,
    schema,
    options,
  });

  useEffect(() => {
    const element = ref.current;
    const renderArgs = renderArgsRef.current;
    if (!renderArgs.plugin?.ui || !element || !schema.type) return;

    let cancelled = false;
    element.innerHTML = '';
    element.dataset.pdfweaveRenderReady = 'false';
    const render = renderArgs.plugin.ui;

    const renderErrorPlaceholder = (host: HTMLElement, pluginName: string, err: unknown) => {
      // Recognisable, self-contained placeholder. Kept inline (no new component file) per
      // the hardening scope: blanking the field is worse than showing an explicit error.
      host.innerHTML = '';
      const placeholder = document.createElement('div');
      placeholder.dataset.pdfweavePluginError = 'true';
      placeholder.style.cssText =
        'box-sizing:border-box;width:100%;height:100%;border:1px dashed red;color:red;font-size:11px;padding:4px;overflow:hidden;background:rgba(255,0,0,0.04);';
      placeholder.textContent = `Plugin error: ${pluginName}`;
      placeholder.title = err instanceof Error ? err.message : String(err);
      host.appendChild(placeholder);
    };

    const renderSchema = async () => {
      const pluginName = renderArgs.schema.type;
      try {
        await Promise.resolve(
          render({
            value: renderArgs.value,
            schema: renderArgs.schema,
            basePdf: renderArgs.basePdf,
            rootElement: element,
            mode: renderArgs.mode,
            onChange: renderArgs.onChange,
            stopEditing: renderArgs.stopEditing,
            tabIndex: renderArgs.tabIndex,
            placeholder: renderArgs.placeholder,
            options: renderArgs.options,
            theme: renderArgs.theme,
            i18n: renderArgs.i18n,
            scale: renderArgs.scale,
            _cache: renderArgs._cache,
          }),
        );
      } catch (err) {
        if (cancelled) return;
        console.error(
          `[@pdfweave/ui] Plugin ui() threw for schema id="${renderArgs.schema.id}" type="${pluginName}":`,
          err,
        );
        renderErrorPlaceholder(element, pluginName, err);
        renderArgs.onRenderedHeightChange?.(renderArgs.schema.id, renderArgs.schema.height);
        return;
      }

      if (cancelled) {
        return;
      }

      if (!renderArgs.plugin?.measure) {
        renderArgs.onRenderedHeightChange?.(renderArgs.schema.id, renderArgs.schema.height);
        return;
      }

      let result: LayoutMeasureResult;
      try {
        result = await Promise.resolve(
          renderArgs.plugin.measure({
            value: renderArgs.value,
            schema: renderArgs.schema,
            basePdf: renderArgs.basePdf,
            options: renderArgs.options,
            _cache: renderArgs._cache,
          }),
        );
      } catch (err) {
        if (cancelled) return;
        console.error(
          `[@pdfweave/ui] Plugin measure() threw for schema id="${renderArgs.schema.id}" type="${pluginName}":`,
          err,
        );
        // Fall back to the schema's declared height; ui() already rendered successfully so
        // we don't replace the rendered output with the error placeholder here.
        renderArgs.onRenderedHeightChange?.(renderArgs.schema.id, renderArgs.schema.height);
        return;
      }
      if (cancelled) {
        return;
      }
      renderArgs.onRenderedHeightChange?.(
        renderArgs.schema.id,
        getMeasuredHeight(renderArgs.schema, result),
      );
    };

    void renderSchema().finally(() => {
      if (!cancelled) {
        element.dataset.pdfweaveRenderReady = 'true';
      }
    });

    return () => {
      cancelled = true;
      if (element) {
        element.dispatchEvent(new Event('beforeRemove'));
        element.innerHTML = '';
        delete element.dataset.pdfweaveRenderReady;
      }
    };
  }, [renderKey, schema.type]);

  if (!plugin) {
    console.error(`[@pdfweave/ui] Renderer for type ${schema.type} not found. 
Check this document: https://pdfme.com/docs/custom-schemas`);
    return <></>;
  }

  return (
    <Wrapper {...props}>
      <div style={{ height: '100%', width: '100%' }} ref={ref} />
    </Wrapper>
  );
};
export default Renderer;
