import React from 'react';
import type {
  ChangeSchemaItem,
  DesignDataVariable,
  PropPanelWidgetProps,
  SchemaBinding,
  SchemaBindingColumn,
  SchemaForUI,
} from '@pdfweave/common';
import {
  formatDesignDataValue,
  getDesignDataInput,
  getDesignDataVariables,
  getTableBindingPreview,
  getValueByPath,
} from '@pdfweave/common';

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

const tagStyle: React.CSSProperties = {
  border: '1px solid #d1d5db',
  borderRadius: 999,
  padding: '2px 8px',
  color: '#4b5563',
  background: '#ffffff',
  fontSize: 11,
  lineHeight: 1.3,
};

const cardStyle: React.CSSProperties = {
  display: 'grid',
  gap: 8,
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: 10,
  background: '#fbfdff',
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
  minWidth: 0,
  color: '#6b7280',
  fontSize: 11,
  lineHeight: 1.3,
};

const clearButtonStyle: React.CSSProperties = {
  justifySelf: 'start',
  height: 28,
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: '0 10px',
  color: '#374151',
  background: '#ffffff',
  fontSize: 12,
  cursor: 'pointer',
};

const errorStyle: React.CSSProperties = {
  color: '#b91c1c',
  fontSize: 11,
  lineHeight: 1.35,
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

const columnsStyle: React.CSSProperties = {
  display: 'grid',
  gap: 8,
};

const columnRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1.2fr) minmax(58px, 0.7fr) minmax(0, 0.9fr) minmax(0, 0.9fr) auto auto',
  gap: 6,
  alignItems: 'end',
  padding: 8,
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  background: '#ffffff',
};

const miniControlStyle: React.CSSProperties = {
  ...controlStyle,
  height: 28,
  padding: '0 6px',
};

const iconButtonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  border: '1px solid #d1d5db',
  borderRadius: 6,
  background: '#ffffff',
  color: '#374151',
  cursor: 'pointer',
};

const fallbackColumns = (): SchemaBindingColumn[] => [
  { path: '', label: 'Value', widthPercentage: 100 },
];

const formatOptions = [
  { label: 'Default', value: '' },
  { label: 'Text', value: 'text' },
  { label: 'Number', value: 'number' },
  { label: 'Currency', value: 'currency' },
  { label: 'Date', value: 'date' },
  { label: 'Boolean', value: 'boolean' },
];

const alignmentOptions = [
  { label: 'Default', value: '' },
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
];

const MIN_REENABLED_COLUMN_WIDTH = 12;
const MAX_REENABLED_COLUMN_WIDTH = 45;

const titleFromPath = (path: string): string =>
  path
    .split('.')
    .pop()
    ?.replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (char) => char.toUpperCase()) || path;

const coerceWidthPercentage = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Number(Math.min(100, Math.max(1, value)).toFixed(4));
};

const widthPercentages = (columns: SchemaBindingColumn[]) => {
  if (columns.length === 0) return [100];
  const explicitWidths = columns.map((column) => coerceWidthPercentage(column.widthPercentage));
  const explicitTotal = explicitWidths.reduce<number>(
    (sum, width) => sum + (typeof width === 'number' ? width : 0),
    0,
  );
  const missingCount = explicitWidths.filter((width) => typeof width !== 'number').length;
  const fallbackWidth =
    missingCount > 0
      ? explicitTotal < 100
        ? (100 - explicitTotal) / missingCount
        : 100 / columns.length
      : 0;
  const widths = explicitWidths.map((width) =>
    typeof width === 'number' ? width : fallbackWidth,
  );
  const total = widths.reduce((sum, width) => sum + width, 0);
  const adjustedWidths =
    total > 100
      ? widths.map((width) => (width / total) * 100)
      : missingCount === 0 && total < 100
        ? widths.map((width, index) => (index === widths.length - 1 ? width + (100 - total) : width))
        : widths;
  let assigned = 0;

  return adjustedWidths.map((width, index) => {
    const isLast = index === adjustedWidths.length - 1;
    if (isLast) return Number((100 - assigned).toFixed(4));
    assigned += width;
    return Number(width.toFixed(4));
  });
};

const normalizeColumnWidths = (columns: SchemaBindingColumn[]): SchemaBindingColumn[] => {
  const widths = widthPercentages(columns);
  return columns.map((column, index) => ({
    ...column,
    widthPercentage: widths[index],
  })) as SchemaBindingColumn[];
};

const rebalanceEditedColumnWidth = (
  columns: SchemaBindingColumn[],
  editedIndex: number,
  requestedWidth: number | undefined,
): SchemaBindingColumn[] => {
  if (columns.length === 0) return [];
  if (columns.length === 1) return [{ ...columns[0], widthPercentage: 100 }];

  const normalizedColumns = normalizeColumnWidths(columns);
  const currentWidths = widthPercentages(normalizedColumns);
  const otherIndexes = normalizedColumns
    .map((_, index) => index)
    .filter((index) => index !== editedIndex);
  const maxEditedWidth = Math.max(1, 100 - otherIndexes.length);
  const editedWidth = Math.min(maxEditedWidth, requestedWidth ?? 100 / normalizedColumns.length);
  const remainingWidth = 100 - editedWidth;
  const otherTotal = otherIndexes.reduce((sum, index) => sum + currentWidths[index], 0) || 1;
  let assignedOtherWidth = 0;

  return normalizedColumns.map((column, index) => {
    if (index === editedIndex) return { ...column, widthPercentage: editedWidth };

    const isLastOther = index === otherIndexes[otherIndexes.length - 1];
    const width = isLastOther
      ? Number((remainingWidth - assignedOtherWidth).toFixed(4))
      : Number(((currentWidths[index] / otherTotal) * remainingWidth).toFixed(4));
    assignedOtherWidth += width;
    return { ...column, widthPercentage: width };
  });
};

const appendColumnWithBalancedWidth = (
  columns: SchemaBindingColumn[],
  columnToAdd: SchemaBindingColumn,
): SchemaBindingColumn[] => {
  if (columns.length === 0) return normalizeColumnWidths([{ ...columnToAdd }]);

  const nextColumnCount = columns.length + 1;
  const defaultWidth = Math.max(MIN_REENABLED_COLUMN_WIDTH, 100 / nextColumnCount);
  const requestedWidth = coerceWidthPercentage(columnToAdd.widthPercentage);
  const targetAddedWidth =
    typeof requestedWidth === 'number' && requestedWidth < 100
      ? Math.min(MAX_REENABLED_COLUMN_WIDTH, Math.max(MIN_REENABLED_COLUMN_WIDTH, requestedWidth))
      : defaultWidth;
  const currentWidths = widthPercentages(columns);
  const currentTotal = currentWidths.reduce((sum, width) => sum + width, 0) || 100;
  const remainingWidth = Math.max(0, 100 - targetAddedWidth);
  const nextColumns = columns.map((column, index) => ({
    ...column,
    widthPercentage: Number(((currentWidths[index] / currentTotal) * remainingWidth).toFixed(4)),
  }));

  return normalizeColumnWidths([
    ...nextColumns,
    { ...columnToAdd, widthPercentage: targetAddedWidth },
  ]);
};

const getBinding = (schema: SchemaForUI): SchemaBinding | undefined =>
  (schema as SchemaForUI & { binding?: SchemaBinding }).binding;

const formatKind = (variable?: DesignDataVariable): string | undefined =>
  typeof variable?.format === 'string' ? variable.format : variable?.format?.kind;

const formatKindFromColumn = (column?: SchemaBindingColumn): string =>
  typeof column?.format === 'string' ? column.format : column?.format?.kind || '';

const formatHintFromKind = (kind: string): SchemaBindingColumn['format'] | undefined => {
  if (!kind) return undefined;
  if (kind === 'currency') return { kind: 'currency', currency: 'USD' };
  if (kind === 'date') return { kind: 'date', dateStyle: 'medium' };
  if (kind === 'number' || kind === 'boolean' || kind === 'text') return { kind };
  return undefined;
};

const defaultAlignmentForColumn = (column: SchemaBindingColumn): string =>
  ['currency', 'number'].includes(formatKindFromColumn(column)) ? 'right' : '';

const columnKey = (column: SchemaBindingColumn): string => column.path || '__value__';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const inferColumnsFromSample = (sample: unknown): SchemaBindingColumn[] => {
  if (!Array.isArray(sample)) return [];

  const firstRecord = sample.find(isRecord);
  if (firstRecord) {
    const width = Object.keys(firstRecord).length > 0 ? 100 / Object.keys(firstRecord).length : 100;
    return Object.keys(firstRecord).map((path, index, paths) => ({
      path,
      label: titleFromPath(path),
      widthPercentage:
        index === paths.length - 1 ? Number((100 - width * (paths.length - 1)).toFixed(4)) : width,
    }));
  }

  const firstArray = sample.find(Array.isArray) as unknown[] | undefined;
  if (firstArray) {
    const width = firstArray.length > 0 ? 100 / firstArray.length : 100;
    return firstArray.map((_, index) => ({
      path: String(index),
      label: `Column ${index + 1}`,
      widthPercentage:
        index === firstArray.length - 1
          ? Number((100 - width * (firstArray.length - 1)).toFixed(4))
          : width,
    }));
  }

  return fallbackColumns();
};

const mergeAvailableColumns = (
  variable: DesignDataVariable | undefined,
  sample: unknown,
  bindingColumns: SchemaBindingColumn[] | undefined,
): SchemaBindingColumn[] => {
  const columnsByPath = new Map<string, SchemaBindingColumn>();
  const add = (columns: SchemaBindingColumn[] | undefined) => {
    columns?.forEach((column) => {
      const key = columnKey(column);
      columnsByPath.set(key, { ...columnsByPath.get(key), ...column });
    });
  };

  add(variable?.columns);
  add(inferColumnsFromSample(sample));
  add(bindingColumns);

  return Array.from(columnsByPath.values());
};

const getColumnStyles = (schema: SchemaForUI): Record<string, unknown> =>
  ((schema as SchemaForUI & { columnStyles?: Record<string, unknown> }).columnStyles ?? {}) as Record<
    string,
    unknown
  >;

const getColumnAlignments = (schema: SchemaForUI): Record<string, string> =>
  (getColumnStyles(schema).alignment ?? {}) as Record<string, string>;

const compatibleVariables = (
  variables: DesignDataVariable[],
  activeSchema: SchemaForUI,
  bindingPath?: string,
) => {
  const expectedKind = activeSchema.type === 'table' ? 'table' : 'scalar';
  const compatible = variables.filter((variable) => variable.kind === expectedKind);
  if (!bindingPath || compatible.some((variable) => variable.path === bindingPath)) return compatible;

  const currentVariable = variables.find((variable) => variable.path === bindingPath);
  return currentVariable ? [currentVariable, ...compatible] : compatible;
};

const BindingWidget = (props: PropPanelWidgetProps) => {
  const { activeSchema, changeSchemas, options } = props;
  const binding = getBinding(activeSchema);
  const bindingPath = binding?.path ?? '';
  const [pathDraft, setPathDraft] = React.useState(bindingPath);
  const [pathError, setPathError] = React.useState('');
  const dataInput = getDesignDataInput(options.designData);
  const variables = getDesignDataVariables(options.designData);
  const variablesForField = compatibleVariables(variables, activeSchema, bindingPath);
  const selectedVariable = variables.find((variable) => variable.path === bindingPath);
  const sample =
    selectedVariable?.sample ?? (bindingPath ? getValueByPath(dataInput, bindingPath) : undefined);
  const isTable = activeSchema.type === 'table';
  const pathListId = `binding-paths-${activeSchema.id}`;
  const tableColumns: SchemaBindingColumn[] = isTable ? binding?.columns ?? [] : [];
  const dataColumns: SchemaBindingColumn[] = isTable
    ? mergeAvailableColumns(selectedVariable, sample, undefined)
    : [];
  const availableColumns: SchemaBindingColumn[] = isTable
    ? mergeAvailableColumns(selectedVariable, sample, binding?.columns)
    : [];
  const columnAlignments = getColumnAlignments(activeSchema);

  React.useEffect(() => {
    setPathDraft(bindingPath);
    setPathError('');
  }, [activeSchema.id, bindingPath]);

  const clearBinding = () => {
    setPathDraft('');
    setPathError('');
    changeSchemas([{ key: 'binding', value: undefined, schemaId: activeSchema.id }]);
  };

  const applyTableColumns = (
    nextColumnsInput: SchemaBindingColumn[],
    alignmentOverrides: Record<string, string | null> = {},
  ) => {
    if (!bindingPath) return;

    const nextColumns = normalizeColumnWidths(nextColumnsInput);
    const previousAlignmentByPath = new Map(
      tableColumns.map((column, index) => [columnKey(column), columnAlignments[index]]),
    );
    const nextAlignment = nextColumns.reduce<Record<number, string>>((acc, column, index) => {
      const key = columnKey(column);
      const hasAlignmentOverride = Object.prototype.hasOwnProperty.call(alignmentOverrides, key);
      const hasPreviousAlignment = previousAlignmentByPath.has(key);
      const alignment =
        hasAlignmentOverride
          ? (alignmentOverrides[key] ?? '')
          : hasPreviousAlignment
            ? previousAlignmentByPath.get(key)
            : defaultAlignmentForColumn(column);
      if (alignment) acc[index] = alignment;
      return acc;
    }, {});
    const currentColumnStyles = getColumnStyles(activeSchema);
    const nextColumnStyles = {
      ...currentColumnStyles,
      alignment: nextAlignment,
    };

    changeSchemas([
      {
        key: 'binding',
        value: { ...binding, path: bindingPath, columns: nextColumns },
        schemaId: activeSchema.id,
      },
      {
        key: 'content',
        value: JSON.stringify(getTableBindingPreview(sample, nextColumns)),
        schemaId: activeSchema.id,
      },
      {
        key: 'head',
        value: nextColumns.map((column) => column.label || titleFromPath(column.path)),
        schemaId: activeSchema.id,
      },
      {
        key: 'headWidthPercentages',
        value: widthPercentages(nextColumns),
        schemaId: activeSchema.id,
      },
      {
        key: 'columnStyles',
        value: nextColumnStyles,
        schemaId: activeSchema.id,
      },
    ]);
  };

  const updateColumn = (index: number, patch: Partial<SchemaBindingColumn>) => {
    applyTableColumns(
      tableColumns.map((column, columnIndex) =>
        columnIndex === index ? ({ ...column, ...patch } as SchemaBindingColumn) : column,
      ) as SchemaBindingColumn[],
    );
  };

  const updateColumnWidth = (index: number, width: number | undefined) => {
    applyTableColumns(rebalanceEditedColumnWidth(tableColumns, index, width));
  };

  const toggleColumn = (column: SchemaBindingColumn, shouldInclude: boolean) => {
    const key = columnKey(column);
    const currentIndex = tableColumns.findIndex((item) => columnKey(item) === key);
    if (shouldInclude && currentIndex === -1) {
      applyTableColumns(appendColumnWithBalancedWidth(tableColumns, column));
      return;
    }

    if (!shouldInclude && currentIndex !== -1 && tableColumns.length > 1) {
      applyTableColumns(tableColumns.filter((item) => columnKey(item) !== key) as SchemaBindingColumn[]);
    }
  };

  const moveColumn = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= tableColumns.length) return;

    const nextColumns = [...tableColumns];
    const [column] = nextColumns.splice(index, 1);
    nextColumns.splice(nextIndex, 0, column);
    applyTableColumns(nextColumns);
  };

  const updateColumnAlignment = (column: SchemaBindingColumn, alignment: string) => {
    applyTableColumns(tableColumns, { [columnKey(column)]: alignment || null });
  };

  const commitPath = (pathValue: string) => {
    const nextPath = pathValue.trim();
    if (!nextPath) {
      clearBinding();
      return;
    }

    if (nextPath === bindingPath) {
      setPathDraft(bindingPath);
      setPathError('');
      return;
    }

    const variable = variables.find((item) => item.path === nextPath);
    const nextSample = variable?.sample ?? getValueByPath(dataInput, nextPath);
    const expectedKind = isTable ? 'table' : 'scalar';
    const inferredKind = variable?.kind ?? (Array.isArray(nextSample) ? 'table' : 'scalar');
    if (inferredKind !== expectedKind) {
      setPathDraft(bindingPath);
      setPathError(
        isTable
          ? 'Choose an array/table data path for a table field.'
          : 'Choose a scalar data path for this field.',
      );
      return;
    }

    setPathError('');
    const changes: ChangeSchemaItem[] = [];

    if (isTable) {
      const columns = (
        variable?.columns?.length ? variable.columns : (binding?.columns ?? fallbackColumns())
      ).map((column) => ({ ...column }));
      changes.push(
        {
          key: 'binding',
          value: { path: nextPath, columns },
          schemaId: activeSchema.id,
        },
        {
          key: 'content',
          value: JSON.stringify(getTableBindingPreview(nextSample, columns)),
          schemaId: activeSchema.id,
        },
        {
          key: 'head',
          value: columns.map((column) => column.label || titleFromPath(column.path)),
          schemaId: activeSchema.id,
        },
        {
          key: 'headWidthPercentages',
          value: widthPercentages(columns),
          schemaId: activeSchema.id,
        },
        { key: 'showHead', value: true, schemaId: activeSchema.id },
        { key: 'readOnly', value: true, schemaId: activeSchema.id },
        { key: 'required', value: false, schemaId: activeSchema.id },
      );
    } else {
      const format = variable?.format;
      changes.push(
        {
          key: 'binding',
          value: { path: nextPath, format },
          schemaId: activeSchema.id,
        },
        { key: 'readOnly', value: true, schemaId: activeSchema.id },
        { key: 'required', value: false, schemaId: activeSchema.id },
      );

      if (typeof nextSample !== 'undefined') {
        changes.push({
          key: 'content',
          value: formatDesignDataValue(nextSample, format),
          schemaId: activeSchema.id,
        });
      }

      if (activeSchema.type === 'text' && ['currency', 'number'].includes(formatKind(variable) ?? '')) {
        changes.push({ key: 'alignment', value: 'right', schemaId: activeSchema.id });
      }
    }

    changeSchemas(changes);
  };

  const bindingWarning = (() => {
    if (!bindingPath) return '';
    if (!selectedVariable && typeof sample === 'undefined') {
      return `Binding path "${bindingPath}" was not found in the current data sample.`;
    }
    if (isTable && !Array.isArray(sample)) {
      return `Binding path "${bindingPath}" is not an array in the current data sample.`;
    }
    if (!isTable && Array.isArray(sample)) {
      return `Binding path "${bindingPath}" is an array; use a table field for this data.`;
    }
    if (isTable && tableColumns.length > 0 && !(Array.isArray(sample) && sample.length === 0)) {
      const dataKeys = new Set(dataColumns.map(columnKey));
      const missingColumns = tableColumns.filter((column) => !dataKeys.has(columnKey(column)));
      if (missingColumns.length > 0) {
        return `Missing table column data: ${missingColumns
          .map((column) => column.label || column.path || 'Value')
          .join(', ')}.`;
      }
    }
    return '';
  })();

  const sampleText = isTable
    ? selectedVariable?.formattedSample ??
      (Array.isArray(sample) ? `${sample.length} rows` : bindingPath ? 'No sample' : '')
    : bindingPath
      ? formatDesignDataValue(sample, binding?.format)
      : '';
  const columnText =
    isTable && binding?.columns?.length
      ? binding.columns.map((column) => column.label || titleFromPath(column.path)).join(', ')
      : '';

  return (
    <section style={containerStyle} role="region" aria-label="Data Binding">
      <div style={headerStyle}>
        <span style={titleStyle}>Data Binding</span>
        <span style={tagStyle}>{bindingPath ? 'Bound' : 'Unbound'}</span>
      </div>
      <div style={cardStyle}>
        <label style={labelStyle}>
          Path
          <input
            style={controlStyle}
            list={pathListId}
            value={pathDraft}
            aria-label={`${activeSchema.name} binding path`}
            placeholder="customer.name"
            onBlur={() => {
              const nextPath = pathDraft.trim();
              if (nextPath !== bindingPath) {
                commitPath(nextPath);
              } else {
                setPathDraft(bindingPath);
              }
            }}
            onChange={(event) => {
              const nextPath = event.currentTarget.value;
              setPathDraft(nextPath);
              if (variables.some((variable) => variable.path === nextPath)) {
                commitPath(nextPath);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitPath(pathDraft);
              }
            }}
          />
        </label>
        {pathError ? (
          <div style={errorStyle} role="alert">
            {pathError}
          </div>
        ) : null}
        {bindingWarning ? (
          <div style={warningStyle} role="alert">
            {bindingWarning}
          </div>
        ) : null}
        <datalist id={pathListId}>
          {variablesForField.map((variable) => (
            <option key={variable.path} value={variable.path} label={variable.label} />
          ))}
        </datalist>

        {bindingPath ? (
          <>
            <div style={summaryStyle}>
              {selectedVariable ? <span>{selectedVariable.label}</span> : null}
              <span>{isTable ? 'table' : selectedVariable?.type || 'custom path'}</span>
              {sampleText ? <span>{sampleText}</span> : null}
              {columnText ? <span>{columnText}</span> : null}
            </div>
            {isTable && binding?.columns?.length ? (
              <div style={columnsStyle} role="group" aria-label={`${activeSchema.name} binding columns`}>
                <span style={titleStyle}>Columns</span>
                {availableColumns.map((availableColumn) => {
                  const key = columnKey(availableColumn);
                  const selectedIndex = tableColumns.findIndex((column) => columnKey(column) === key);
                  const selectedColumn =
                    selectedIndex >= 0 ? tableColumns[selectedIndex] : availableColumn;
                  const isSelected = selectedIndex >= 0;
                  const alignment = isSelected ? columnAlignments[selectedIndex] ?? '' : '';

                  return (
                    <div style={columnRowStyle} key={key}>
                      <label style={{ ...labelStyle, alignItems: 'center' }}>
                        <span>Use</span>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isSelected && tableColumns.length === 1}
                          aria-label={`${activeSchema.name} include ${
                            availableColumn.label || titleFromPath(availableColumn.path)
                          } column`}
                          onChange={(event) => toggleColumn(availableColumn, event.currentTarget.checked)}
                        />
                      </label>
                      <label style={labelStyle}>
                        Label
                        <input
                          style={miniControlStyle}
                          value={selectedColumn.label || titleFromPath(selectedColumn.path)}
                          disabled={!isSelected}
                          aria-label={`${activeSchema.name} ${
                            availableColumn.label || titleFromPath(availableColumn.path)
                          } column label`}
                          onChange={(event) =>
                            selectedIndex >= 0
                              ? updateColumn(selectedIndex, { label: event.currentTarget.value })
                              : undefined
                          }
                        />
                      </label>
                      <label style={labelStyle}>
                        Width
                        <input
                          style={miniControlStyle}
                          type="number"
                          min="1"
                          max="100"
                          step="1"
                          value={selectedColumn.widthPercentage ?? ''}
                          disabled={!isSelected}
                          aria-label={`${activeSchema.name} ${
                            availableColumn.label || titleFromPath(availableColumn.path)
                          } column width`}
                          onChange={(event) => {
                            if (selectedIndex < 0) return;
                            const rawValue = event.currentTarget.value;
                            updateColumnWidth(
                              selectedIndex,
                              rawValue === '' ? undefined : coerceWidthPercentage(Number(rawValue)),
                            );
                          }}
                        />
                      </label>
                      <label style={labelStyle}>
                        Format
                        <select
                          style={miniControlStyle}
                          value={formatKindFromColumn(selectedColumn)}
                          disabled={!isSelected}
                          aria-label={`${activeSchema.name} ${
                            availableColumn.label || titleFromPath(availableColumn.path)
                          } column format`}
                          onChange={(event) =>
                            selectedIndex >= 0
                              ? updateColumn(selectedIndex, {
                                  format: formatHintFromKind(event.currentTarget.value),
                                })
                              : undefined
                          }
                        >
                          {formatOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={labelStyle}>
                        Align
                        <select
                          style={miniControlStyle}
                          value={alignment}
                          disabled={!isSelected}
                          aria-label={`${activeSchema.name} ${
                            availableColumn.label || titleFromPath(availableColumn.path)
                          } column alignment`}
                          onChange={(event) => updateColumnAlignment(selectedColumn, event.currentTarget.value)}
                        >
                          {alignmentOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        style={iconButtonStyle}
                        disabled={!isSelected || selectedIndex <= 0}
                        aria-label={`${activeSchema.name} move ${
                          availableColumn.label || titleFromPath(availableColumn.path)
                        } column up`}
                        onClick={() => moveColumn(selectedIndex, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        style={iconButtonStyle}
                        disabled={!isSelected || selectedIndex === tableColumns.length - 1}
                        aria-label={`${activeSchema.name} move ${
                          availableColumn.label || titleFromPath(availableColumn.path)
                        } column down`}
                        onClick={() => moveColumn(selectedIndex, 1)}
                      >
                        ↓
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <button
              type="button"
              style={clearButtonStyle}
              aria-label={`${activeSchema.name} clear binding`}
              onClick={clearBinding}
            >
              Clear binding
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
};

export default BindingWidget;
