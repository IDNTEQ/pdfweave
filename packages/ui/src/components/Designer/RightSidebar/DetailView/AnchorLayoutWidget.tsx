import React from 'react';
import type {
  HorizontalAnchorRule,
  PropPanelWidgetProps,
  SchemaForUI,
  SchemaLayoutRule,
  VerticalAnchorRule,
} from '@pdfme/common';

type AnchoredLayoutRule = Extract<SchemaLayoutRule, { mode: 'anchored' }>;
type HorizontalMode = HorizontalAnchorRule['mode'];
type VerticalMode = VerticalAnchorRule['mode'];

const containerStyle: React.CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: '8px 0 2px',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};

const titleStyle: React.CSSProperties = {
  color: '#1f2937',
  fontSize: 13,
  fontWeight: 600,
};

const switchLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  color: '#4b5563',
  fontSize: 12,
};

const fieldGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 4,
  minWidth: 0,
  color: '#4b5563',
  fontSize: 11,
  fontWeight: 500,
};

const controlStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  height: 32,
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: '0 8px',
  color: '#111827',
  background: '#ffffff',
  fontSize: 12,
};

const summaryStyle: React.CSSProperties = {
  display: 'grid',
  gap: 3,
  color: '#6b7280',
  fontSize: 11,
  lineHeight: 1.3,
};

const cardStyle: React.CSSProperties = {
  display: 'grid',
  gap: 10,
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: 10,
  background: '#fbfdff',
};

const getAnchorLabel = (schema: SchemaForUI): string => schema.name || schema.id;

const getAnchorIds = (schema: SchemaForUI): string[] =>
  Array.from(new Set([schema.name, schema.id].filter((id): id is string => Boolean(id))));

const isAnchoredLayout = (layout: unknown): layout is AnchoredLayoutRule =>
  typeof layout === 'object' && layout !== null && (layout as { mode?: unknown }).mode === 'anchored';

const getLayout = (schema: SchemaForUI): SchemaLayoutRule =>
  ((schema as SchemaForUI & { layout?: SchemaLayoutRule }).layout ?? { mode: 'absolute' }) as SchemaLayoutRule;

const getHorizontalTarget = (rule: HorizontalAnchorRule): string | null =>
  rule.mode === 'pageLeft' ? null : rule.ref.schemaId;

const getVerticalTarget = (rule: VerticalAnchorRule): string | null =>
  rule.mode === 'pageTop' ? null : rule.ref.schemaId;

const getHorizontalOffset = (rule: HorizontalAnchorRule): number =>
  typeof rule.offsetMm === 'number' && Number.isFinite(rule.offsetMm) ? rule.offsetMm : 0;

const getVerticalOffset = (rule: VerticalAnchorRule): number =>
  typeof rule.offsetMm === 'number' && Number.isFinite(rule.offsetMm) ? rule.offsetMm : 0;

const formatMm = (value: number): string => `${Number(value.toFixed(2))}mm`;

const roundMm = (value: number): number => Number(value.toFixed(2));

const formatHorizontalRule = (
  rule: HorizontalAnchorRule,
  getTargetLabel: (targetId: string) => string,
): string => {
  if (rule.mode === 'pageLeft') return `X: page left + ${formatMm(rule.offsetMm)}`;
  if (rule.mode === 'afterRightEdge') {
    return `X: after ${getTargetLabel(rule.ref.schemaId)} right edge + ${formatMm(rule.offsetMm)}`;
  }
  return `X: align right to ${getTargetLabel(rule.ref.schemaId)} + ${formatMm(rule.offsetMm ?? 0)}`;
};

const formatVerticalRule = (
  rule: VerticalAnchorRule,
  getTargetLabel: (targetId: string) => string,
): string => {
  if (rule.mode === 'pageTop') return `Y: page top + ${formatMm(rule.offsetMm)}`;
  return `Y: below ${getTargetLabel(rule.ref.schemaId)} + ${formatMm(rule.offsetMm)}`;
};

const firstTargetId = (
  targetOptions: Array<{ value: string; label: string }>,
  preferredTarget: string | null,
): string | null => {
  if (preferredTarget && targetOptions.some((option) => option.value === preferredTarget)) {
    return preferredTarget;
  }
  return targetOptions[0]?.value ?? preferredTarget;
};

const buildTargetOptions = (
  activeSchema: SchemaForUI,
  schemas: SchemaForUI[],
  currentTarget: string | null,
): Array<{ value: string; label: string }> => {
  const activeIds = new Set(getAnchorIds(activeSchema));
  const options = schemas
    .filter((schema) => schema.id !== activeSchema.id)
    .map((schema) => ({ value: schema.id, label: getAnchorLabel(schema) }))
    .filter((option) => option.value && !activeIds.has(option.value));

  const currentTargetResolved = currentTarget
    ? schemas.some((schema) => getAnchorIds(schema).includes(currentTarget))
    : false;
  if (currentTarget && !currentTargetResolved && !options.some((option) => option.value === currentTarget)) {
    return [{ value: currentTarget, label: currentTarget }, ...options];
  }

  return options;
};

const createFallbackLayout = (activeSchema: SchemaForUI): AnchoredLayoutRule => ({
  mode: 'anchored',
  x: { mode: 'pageLeft', offsetMm: roundMm(activeSchema.position.x) },
  y: { mode: 'pageTop', offsetMm: roundMm(activeSchema.position.y) },
});

const AnchorLayoutWidget = (props: PropPanelWidgetProps) => {
  const { activeSchema, changeSchemas, schemas } = props;
  const layout = getLayout(activeSchema);
  const anchoredLayout = isAnchoredLayout(layout) ? layout : createFallbackLayout(activeSchema);
  const targetLookup = new Map<string, SchemaForUI>();
  schemas.forEach((schema) => {
    getAnchorIds(schema).forEach((id) => targetLookup.set(id, schema));
  });
  const resolveTargetId = (targetId: string | null): string | null =>
    targetId ? targetLookup.get(targetId)?.id ?? targetId : null;
  const getTargetLabel = (targetId: string): string =>
    targetLookup.get(targetId)?.name || targetLookup.get(targetId)?.id || targetId;
  const xTarget = resolveTargetId(getHorizontalTarget(anchoredLayout.x));
  const yTarget = resolveTargetId(getVerticalTarget(anchoredLayout.y));
  const xTargetOptions = buildTargetOptions(
    activeSchema,
    schemas,
    getHorizontalTarget(anchoredLayout.x),
  );
  const yTargetOptions = buildTargetOptions(activeSchema, schemas, getVerticalTarget(anchoredLayout.y));
  const isAnchored = layout.mode === 'anchored';

  const commitLayout = (nextLayout: SchemaLayoutRule) => {
    changeSchemas([{ key: 'layout', value: nextLayout, schemaId: activeSchema.id }]);
  };

  const updateAnchoredLayout = (updater: (current: AnchoredLayoutRule) => AnchoredLayoutRule) => {
    commitLayout(updater(anchoredLayout));
  };

  const calculateHorizontalOffset = (
    mode: HorizontalMode,
    targetId: string | null,
    fallbackOffset: number,
  ): number => {
    if (mode === 'pageLeft' || !targetId) return roundMm(activeSchema.position.x);

    const target = targetLookup.get(targetId);
    if (!target) return fallbackOffset;

    const targetRight = target.position.x + target.width;
    if (mode === 'afterRightEdge') {
      return roundMm(activeSchema.position.x - targetRight);
    }

    return roundMm(activeSchema.position.x + activeSchema.width - targetRight);
  };

  const calculateVerticalOffset = (
    mode: VerticalMode,
    targetId: string | null,
    fallbackOffset: number,
  ): number => {
    if (mode === 'pageTop' || !targetId) return roundMm(activeSchema.position.y);

    const target = targetLookup.get(targetId);
    if (!target) return fallbackOffset;

    return roundMm(activeSchema.position.y - (target.position.y + target.height));
  };

  const createHorizontalRule = (
    mode: HorizontalMode,
    previousRule: HorizontalAnchorRule,
    targetId: string | null,
  ): HorizontalAnchorRule => {
    const offsetMm = calculateHorizontalOffset(mode, targetId, getHorizontalOffset(previousRule));
    if (mode === 'pageLeft' || !targetId) return { mode: 'pageLeft', offsetMm };
    return { mode, ref: { schemaId: targetId }, offsetMm };
  };

  const createVerticalRule = (
    mode: VerticalMode,
    previousRule: VerticalAnchorRule,
    targetId: string | null,
  ): VerticalAnchorRule => {
    const offsetMm = calculateVerticalOffset(mode, targetId, getVerticalOffset(previousRule));
    if (mode === 'pageTop' || !targetId) return { mode: 'pageTop', offsetMm };
    return { mode, ref: { schemaId: targetId }, offsetMm };
  };

  const setHorizontalMode = (mode: HorizontalMode) => {
    updateAnchoredLayout((current) => ({
      ...current,
      x: createHorizontalRule(
        mode,
        current.x,
        firstTargetId(xTargetOptions, resolveTargetId(getHorizontalTarget(current.x))),
      ),
    }));
  };

  const setVerticalMode = (mode: VerticalMode) => {
    updateAnchoredLayout((current) => ({
      ...current,
      y: createVerticalRule(
        mode,
        current.y,
        firstTargetId(yTargetOptions, resolveTargetId(getVerticalTarget(current.y))),
      ),
    }));
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>Anchor Layout</span>
        <label style={switchLabelStyle}>
          <input
            type="checkbox"
            checked={isAnchored}
            aria-label={`${activeSchema.name} anchored positioning`}
            onChange={(event) =>
              commitLayout(event.currentTarget.checked ? anchoredLayout : { mode: 'absolute' })
            }
          />
          Anchored
        </label>
      </div>

      {isAnchored ? (
        <div style={cardStyle}>
          <div style={summaryStyle}>
            <span>{formatHorizontalRule(anchoredLayout.x, getTargetLabel)}</span>
            <span>{formatVerticalRule(anchoredLayout.y, getTargetLabel)}</span>
          </div>

          <div style={fieldGridStyle}>
            <label style={labelStyle}>
              X mode
              <select
                style={controlStyle}
                value={anchoredLayout.x.mode}
                aria-label={`${activeSchema.name} horizontal anchor mode`}
                onChange={(event) => setHorizontalMode(event.currentTarget.value as HorizontalMode)}
              >
                <option value="pageLeft">Page left</option>
                <option value="afterRightEdge" disabled={xTargetOptions.length === 0}>
                  After target right
                </option>
                <option value="alignRightEdge" disabled={xTargetOptions.length === 0}>
                  Align right
                </option>
              </select>
            </label>

            {anchoredLayout.x.mode === 'pageLeft' ? null : (
              <label style={labelStyle}>
                X target
                <select
                  style={controlStyle}
                  value={xTarget ?? anchoredLayout.x.ref.schemaId}
                  aria-label={`${activeSchema.name} horizontal anchor target`}
                  onChange={(event) =>
                    updateAnchoredLayout((current) => ({
                      ...current,
                      x:
                        current.x.mode === 'pageLeft'
                          ? current.x
                          : createHorizontalRule(
                              current.x.mode,
                              current.x,
                              event.currentTarget.value,
                            ),
                    }))
                  }
                >
                  {xTargetOptions.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label style={labelStyle}>
              Y mode
              <select
                style={controlStyle}
                value={anchoredLayout.y.mode}
                aria-label={`${activeSchema.name} vertical anchor mode`}
                onChange={(event) => setVerticalMode(event.currentTarget.value as VerticalMode)}
              >
                <option value="pageTop">Page top</option>
                <option value="belowBottomEdge" disabled={yTargetOptions.length === 0}>
                  Below target
                </option>
              </select>
            </label>

            {anchoredLayout.y.mode === 'pageTop' ? null : (
              <label style={labelStyle}>
                Y target
                <select
                  style={controlStyle}
                  value={yTarget ?? anchoredLayout.y.ref.schemaId}
                  aria-label={`${activeSchema.name} vertical anchor target`}
                  onChange={(event) =>
                    updateAnchoredLayout((current) => ({
                      ...current,
                      y:
                        current.y.mode === 'pageTop'
                          ? current.y
                          : createVerticalRule(current.y.mode, current.y, event.currentTarget.value),
                    }))
                  }
                >
                  {yTargetOptions.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AnchorLayoutWidget;
