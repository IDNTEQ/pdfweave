import React from 'react';
import type {
  HorizontalAnchorRule,
  PropPanelWidgetProps,
  SchemaForUI,
  SchemaLayoutRule,
  VerticalAnchorRule,
} from '@pdfweave/common';

type AnchoredLayoutRule = Extract<SchemaLayoutRule, { mode: 'anchored' }>;
type HorizontalMode = HorizontalAnchorRule['mode'];
type VerticalMode = VerticalAnchorRule['mode'];
export type AnchorLayoutField =
  | 'horizontalRule'
  | 'horizontalTarget'
  | 'verticalRule'
  | 'verticalTarget';

type AnchorLayoutWidgetProps = Partial<PropPanelWidgetProps> &
  Pick<PropPanelWidgetProps, 'activeSchema' | 'changeSchemas' | 'schemas'> & {
    activeSchemas?: SchemaForUI[];
    mixedFields?: Set<AnchorLayoutField>;
    placeholderFields?: Set<AnchorLayoutField>;
  };

const PLACEHOLDER_VALUE = '__pdfweave_anchor_mixed__';
const PLACEHOLDER_LABEL = '—';

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

const labelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 6,
};

const mixedHintStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: 10,
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

const warningStyle: React.CSSProperties = {
  color: '#92400e',
  background: '#fffbeb',
  border: '1px solid #fcd34d',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 11,
  lineHeight: 1.35,
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
  return targetOptions[0]?.value ?? null;
};

const buildTargetOptions = (
  activeSchemas: SchemaForUI[],
  schemas: SchemaForUI[],
  currentTarget: string | null,
): Array<{ value: string; label: string }> => {
  const activeSchemaIds = new Set(activeSchemas.map((schema) => schema.id));
  const activeAnchorIds = new Set(activeSchemas.flatMap(getAnchorIds));
  const options = schemas
    .filter((schema) => !activeSchemaIds.has(schema.id))
    .map((schema) => ({ value: schema.id, label: getAnchorLabel(schema) }))
    .filter((option) => option.value && !activeAnchorIds.has(option.value));

  const currentTargetResolved = currentTarget
    ? schemas.some((schema) => getAnchorIds(schema).includes(currentTarget))
    : false;
  const currentTargetIsSelected = currentTarget
    ? activeSchemas.some((schema) => getAnchorIds(schema).includes(currentTarget))
    : false;
  if (
    currentTarget &&
    !currentTargetResolved &&
    !currentTargetIsSelected &&
    !options.some((option) => option.value === currentTarget)
  ) {
    return [{ value: currentTarget, label: currentTarget }, ...options];
  }

  return options;
};

const createFallbackLayout = (activeSchema: SchemaForUI): AnchoredLayoutRule => ({
  mode: 'anchored',
  x: { mode: 'pageLeft', offsetMm: roundMm(activeSchema.position.x) },
  y: { mode: 'pageTop', offsetMm: roundMm(activeSchema.position.y) },
});

const getAnchoredOrFallbackLayout = (schema: SchemaForUI): AnchoredLayoutRule => {
  const layout = getLayout(schema);
  return isAnchoredLayout(layout) ? layout : createFallbackLayout(schema);
};

const renderLabelText = (
  label: string,
  field: AnchorLayoutField,
  mixedFields?: Set<AnchorLayoutField>,
) => (
  <span style={labelHeaderStyle}>
    <span>{label}</span>
    {mixedFields?.has(field) ? <span style={mixedHintStyle}>(Mixed)</span> : null}
  </span>
);

const hasPlaceholderValue = (
  field: AnchorLayoutField,
  mixedFields?: Set<AnchorLayoutField>,
  placeholderFields?: Set<AnchorLayoutField>,
): boolean => Boolean(mixedFields?.has(field) || placeholderFields?.has(field));

const selectValue = (
  field: AnchorLayoutField,
  value: string | null,
  mixedFields?: Set<AnchorLayoutField>,
  placeholderFields?: Set<AnchorLayoutField>,
): string => (hasPlaceholderValue(field, mixedFields, placeholderFields) ? PLACEHOLDER_VALUE : value ?? '');

const AnchorLayoutWidget = (props: AnchorLayoutWidgetProps) => {
  const { activeSchema, changeSchemas, schemas, mixedFields, placeholderFields } = props;
  const activeSchemas = props.activeSchemas?.length ? props.activeSchemas : [activeSchema];
  const isSharedMode = activeSchemas.length > 1;
  const ariaSubject = isSharedMode ? 'selection' : activeSchema.name;
  const layout = getLayout(activeSchema);
  const anchoredLayout = getAnchoredOrFallbackLayout(activeSchema);
  const targetLookup = new Map<string, SchemaForUI>();
  schemas.forEach((schema) => {
    getAnchorIds(schema).forEach((id) => targetLookup.set(id, schema));
  });
  const resolveTargetId = (targetId: string | null): string | null =>
    targetId ? targetLookup.get(targetId)?.id ?? targetId : null;
  const targetMatchesSchema = (schema: SchemaForUI, targetId: string | null): boolean =>
    Boolean(targetId && (resolveTargetId(targetId) === schema.id || getAnchorIds(schema).includes(targetId)));
  const getTargetLabel = (targetId: string): string =>
    targetLookup.get(targetId)?.name || targetLookup.get(targetId)?.id || targetId;
  const rawXTarget = getHorizontalTarget(anchoredLayout.x);
  const rawYTarget = getVerticalTarget(anchoredLayout.y);
  const xTarget = resolveTargetId(rawXTarget);
  const yTarget = resolveTargetId(rawYTarget);
  const missingXTarget = Boolean(rawXTarget && !targetLookup.has(rawXTarget));
  const missingYTarget = Boolean(rawYTarget && !targetLookup.has(rawYTarget));
  const xTargetOptions = buildTargetOptions(
    activeSchemas,
    schemas,
    getHorizontalTarget(anchoredLayout.x),
  );
  const yTargetOptions = buildTargetOptions(activeSchemas, schemas, getVerticalTarget(anchoredLayout.y));
  const isAnchored = isSharedMode
    ? activeSchemas.every((schema) => getLayout(schema).mode === 'anchored')
    : layout.mode === 'anchored';
  const showAnchorControls = isSharedMode || isAnchored;
  const horizontalModeValue = selectValue(
    'horizontalRule',
    anchoredLayout.x.mode,
    mixedFields,
    placeholderFields,
  );
  const verticalModeValue = selectValue(
    'verticalRule',
    anchoredLayout.y.mode,
    mixedFields,
    placeholderFields,
  );
  const horizontalTargetValue = selectValue('horizontalTarget', xTarget, mixedFields, placeholderFields);
  const verticalTargetValue = selectValue('verticalTarget', yTarget, mixedFields, placeholderFields);
  const showHorizontalTarget =
    anchoredLayout.x.mode !== 'pageLeft' || horizontalModeValue === PLACEHOLDER_VALUE;
  const showVerticalTarget =
    anchoredLayout.y.mode !== 'pageTop' || verticalModeValue === PLACEHOLDER_VALUE;

  const commitLayouts = (
    getNextLayout: (schema: SchemaForUI, current: AnchoredLayoutRule) => SchemaLayoutRule | null,
  ) => {
    const changes = activeSchemas.flatMap((schema) => {
      const value = getNextLayout(schema, getAnchoredOrFallbackLayout(schema));
      return value
        ? [
            {
              key: 'layout',
              value,
              schemaId: schema.id,
            },
          ]
        : [];
    });
    if (changes.length > 0) {
      changeSchemas(changes);
    }
  };

  const commitLayout = (nextLayout: SchemaLayoutRule) => {
    commitLayouts(() => nextLayout);
  };

  const updateAnchoredLayout = (
    updater: (schema: SchemaForUI, current: AnchoredLayoutRule) => AnchoredLayoutRule | null,
  ) => {
    commitLayouts((schema, current) => updater(schema, current));
  };

  const calculateHorizontalOffset = (
    schema: SchemaForUI,
    mode: HorizontalMode,
    targetId: string | null,
    fallbackOffset: number,
  ): number => {
    if (mode === 'pageLeft' || !targetId) return roundMm(schema.position.x);

    const target = targetLookup.get(targetId);
    if (!target) return fallbackOffset;

    const targetRight = target.position.x + target.width;
    if (mode === 'afterRightEdge') {
      return roundMm(schema.position.x - targetRight);
    }

    return roundMm(schema.position.x + schema.width - targetRight);
  };

  const calculateVerticalOffset = (
    schema: SchemaForUI,
    mode: VerticalMode,
    targetId: string | null,
    fallbackOffset: number,
  ): number => {
    if (mode === 'pageTop' || !targetId) return roundMm(schema.position.y);

    const target = targetLookup.get(targetId);
    if (!target) return fallbackOffset;

    return roundMm(schema.position.y - (target.position.y + target.height));
  };

  const createHorizontalRule = (
    schema: SchemaForUI,
    mode: HorizontalMode,
    previousRule: HorizontalAnchorRule,
    targetId: string | null,
  ): HorizontalAnchorRule => {
    if (targetMatchesSchema(schema, targetId)) return previousRule;
    const offsetMm = calculateHorizontalOffset(
      schema,
      mode,
      targetId,
      getHorizontalOffset(previousRule),
    );
    if (mode === 'pageLeft' || !targetId) return { mode: 'pageLeft', offsetMm };
    return { mode, ref: { schemaId: targetId }, offsetMm };
  };

  const createVerticalRule = (
    schema: SchemaForUI,
    mode: VerticalMode,
    previousRule: VerticalAnchorRule,
    targetId: string | null,
  ): VerticalAnchorRule => {
    if (targetMatchesSchema(schema, targetId)) return previousRule;
    const offsetMm = calculateVerticalOffset(
      schema,
      mode,
      targetId,
      getVerticalOffset(previousRule),
    );
    if (mode === 'pageTop' || !targetId) return { mode: 'pageTop', offsetMm };
    return { mode, ref: { schemaId: targetId }, offsetMm };
  };

  const setHorizontalMode = (mode: HorizontalMode) => {
    updateAnchoredLayout((schema, current) => ({
      ...current,
      x: createHorizontalRule(
        schema,
        mode,
        current.x,
        firstTargetId(xTargetOptions, resolveTargetId(getHorizontalTarget(current.x))),
      ),
    }));
  };

  const setVerticalMode = (mode: VerticalMode) => {
    updateAnchoredLayout((schema, current) => ({
      ...current,
      y: createVerticalRule(
        schema,
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
            aria-label={`${ariaSubject} anchored positioning`}
            onChange={(event) =>
              event.currentTarget.checked
                ? commitLayouts((_, current) => current)
                : commitLayout({ mode: 'absolute' })
            }
          />
          Anchored
        </label>
      </div>

      {showAnchorControls ? (
        <div style={cardStyle}>
          <div style={summaryStyle}>
            <span>
              {hasPlaceholderValue('horizontalRule', mixedFields, placeholderFields)
                ? `X: ${PLACEHOLDER_LABEL}`
                : formatHorizontalRule(anchoredLayout.x, getTargetLabel)}
            </span>
            <span>
              {hasPlaceholderValue('verticalRule', mixedFields, placeholderFields)
                ? `Y: ${PLACEHOLDER_LABEL}`
                : formatVerticalRule(anchoredLayout.y, getTargetLabel)}
            </span>
          </div>
          {missingXTarget || missingYTarget ? (
            <div style={warningStyle} role="alert">
              Missing anchor target
              {missingXTarget ? ` for X: ${rawXTarget}` : ''}
              {missingXTarget && missingYTarget ? ';' : ''}
              {missingYTarget ? ` for Y: ${rawYTarget}` : ''}. Choose a new target or switch the axis
              to the page origin.
            </div>
          ) : null}

          <div style={fieldGridStyle}>
            <label style={labelStyle}>
              {renderLabelText('X mode', 'horizontalRule', mixedFields)}
              <select
                style={controlStyle}
                value={horizontalModeValue}
                aria-label={`${ariaSubject} horizontal anchor mode`}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (value !== PLACEHOLDER_VALUE) setHorizontalMode(value as HorizontalMode);
                }}
              >
                {horizontalModeValue === PLACEHOLDER_VALUE ? (
                  <option value={PLACEHOLDER_VALUE} disabled>
                    {PLACEHOLDER_LABEL}
                  </option>
                ) : null}
                <option value="pageLeft">Page left</option>
                <option value="afterRightEdge" disabled={xTargetOptions.length === 0}>
                  After target right
                </option>
                <option value="alignRightEdge" disabled={xTargetOptions.length === 0}>
                  Align right
                </option>
              </select>
            </label>

            {showHorizontalTarget ? (
              <label style={labelStyle}>
                {renderLabelText('X target', 'horizontalTarget', mixedFields)}
                <select
                  style={controlStyle}
                  value={horizontalTargetValue}
                  aria-label={`${ariaSubject} horizontal anchor target`}
                  disabled={xTargetOptions.length === 0}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (value === PLACEHOLDER_VALUE) return;
                    updateAnchoredLayout((schema, current) =>
                      targetMatchesSchema(schema, value)
                        ? null
                        : {
                            ...current,
                            x:
                              current.x.mode === 'pageLeft'
                                ? current.x
                                : createHorizontalRule(schema, current.x.mode, current.x, value),
                          },
                    );
                  }}
                >
                  {horizontalTargetValue === PLACEHOLDER_VALUE ? (
                    <option value={PLACEHOLDER_VALUE} disabled>
                      {PLACEHOLDER_LABEL}
                    </option>
                  ) : null}
                  {xTargetOptions.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label style={labelStyle}>
              {renderLabelText('Y mode', 'verticalRule', mixedFields)}
              <select
                style={controlStyle}
                value={verticalModeValue}
                aria-label={`${ariaSubject} vertical anchor mode`}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (value !== PLACEHOLDER_VALUE) setVerticalMode(value as VerticalMode);
                }}
              >
                {verticalModeValue === PLACEHOLDER_VALUE ? (
                  <option value={PLACEHOLDER_VALUE} disabled>
                    {PLACEHOLDER_LABEL}
                  </option>
                ) : null}
                <option value="pageTop">Page top</option>
                <option value="belowBottomEdge" disabled={yTargetOptions.length === 0}>
                  Below target
                </option>
              </select>
            </label>

            {showVerticalTarget ? (
              <label style={labelStyle}>
                {renderLabelText('Y target', 'verticalTarget', mixedFields)}
                <select
                  style={controlStyle}
                  value={verticalTargetValue}
                  aria-label={`${ariaSubject} vertical anchor target`}
                  disabled={yTargetOptions.length === 0}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (value === PLACEHOLDER_VALUE) return;
                    updateAnchoredLayout((schema, current) =>
                      targetMatchesSchema(schema, value)
                        ? null
                        : {
                            ...current,
                            y:
                              current.y.mode === 'pageTop'
                                ? current.y
                                : createVerticalRule(schema, current.y.mode, current.y, value),
                          },
                    );
                  }}
                >
                  {verticalTargetValue === PLACEHOLDER_VALUE ? (
                    <option value={PLACEHOLDER_VALUE} disabled>
                      {PLACEHOLDER_LABEL}
                    </option>
                  ) : null}
                  {yTargetOptions.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AnchorLayoutWidget;
