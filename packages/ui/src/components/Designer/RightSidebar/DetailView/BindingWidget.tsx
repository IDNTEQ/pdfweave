import React from 'react';
import type {
  ChangeSchemaItem,
  DesignDataVariable,
  PropPanelWidgetProps,
  SchemaBinding,
  SchemaBindingColumn,
  SchemaForUI,
} from '@pdfme/common';
import {
  formatDesignDataValue,
  getDesignDataInput,
  getDesignDataVariables,
  getTableBindingPreview,
  getValueByPath,
} from '@pdfme/common';

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

const fallbackColumns = (): SchemaBindingColumn[] => [
  { path: '', label: 'Value', widthPercentage: 100 },
];

const titleFromPath = (path: string): string =>
  path
    .split('.')
    .pop()
    ?.replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (char) => char.toUpperCase()) || path;

const widthPercentages = (columns: SchemaBindingColumn[]) => {
  if (columns.length === 0) return [100];
  const explicitTotal = columns.reduce(
    (sum, column) =>
      typeof column.widthPercentage === 'number' ? sum + column.widthPercentage : sum,
    0,
  );
  const missingCount = columns.filter((column) => typeof column.widthPercentage !== 'number').length;
  const fallbackWidth =
    missingCount > 0 ? Number(Math.max(0, (100 - explicitTotal) / missingCount).toFixed(4)) : 0;
  let assigned = 0;

  return columns.map((column, index) => {
    const isLast = index === columns.length - 1;
    const width =
      typeof column.widthPercentage === 'number' ? column.widthPercentage : fallbackWidth;
    if (isLast) return Number((100 - assigned).toFixed(4));
    assigned += width;
    return width;
  });
};

const getBinding = (schema: SchemaForUI): SchemaBinding | undefined =>
  (schema as SchemaForUI & { binding?: SchemaBinding }).binding;

const formatKind = (variable?: DesignDataVariable): string | undefined =>
  typeof variable?.format === 'string' ? variable.format : variable?.format?.kind;

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

  React.useEffect(() => {
    setPathDraft(bindingPath);
    setPathError('');
  }, [activeSchema.id, bindingPath]);

  const clearBinding = () => {
    setPathDraft('');
    setPathError('');
    changeSchemas([{ key: 'binding', value: undefined, schemaId: activeSchema.id }]);
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
