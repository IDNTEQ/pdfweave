import React, { useContext } from 'react';
import {
  cloneDeep,
  formatDesignDataValue,
  getDesignDataVariables,
  getTableBindingPreview,
  Schema,
  SchemaBindingColumn,
} from '@pdfme/common';
import type { DesignDataVariable } from '@pdfme/common';
import { Button, Empty, Tag, Typography } from 'antd';
import { Database, Plus } from 'lucide-react';
import type { SidebarProps } from '../../../types.js';
import { OptionsContext, PluginsRegistry } from '../../../contexts.js';
import { DESIGNER_CLASSNAME } from '../../../constants.js';
import { SidebarBody, SidebarFrame, SidebarHeader } from './layout.js';

const { Text } = Typography;

const titleFromPath = (path: string): string =>
  path
    .split('.')
    .pop()
    ?.replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (char) => char.toUpperCase()) || path;

const nextPosition = (schemas: SidebarProps['schemas'], pageSize: SidebarProps['pageSize']) => {
  const y = 18 + schemas.length * 12;
  return {
    x: 20,
    y: Math.min(Math.max(20, y), Math.max(20, pageSize.height - 30)),
  };
};

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

const withPosition = (schema: Schema, props: Pick<SidebarProps, 'schemas' | 'pageSize'>): Schema => ({
  ...schema,
  position: nextPosition(props.schemas, props.pageSize),
});

const scalarSchemaFromVariable = (defaultSchema: Schema, variable: DesignDataVariable): Schema => {
  const formatKind = typeof variable.format === 'string' ? variable.format : variable.format?.kind;
  return {
    ...defaultSchema,
    name: variable.label,
    content: variable.formattedSample,
    width: defaultSchema.width || 70,
    height: defaultSchema.height || 9,
    readOnly: true,
    required: false,
    alignment:
      formatKind === 'currency' || formatKind === 'number'
        ? 'right'
        : (defaultSchema as Record<string, unknown>).alignment,
    binding: {
      path: variable.path,
      format: variable.format,
    },
  };
};

const tableSchemaFromVariable = (defaultSchema: Schema, variable: DesignDataVariable): Schema => {
  const columns = variable.columns?.length
    ? variable.columns
    : [{ path: '', label: 'Value', widthPercentage: 100 }];
  return {
    ...defaultSchema,
    name: variable.label,
    content: JSON.stringify(getTableBindingPreview(variable.sample, columns)),
    width: defaultSchema.width || 150,
    height: defaultSchema.height || 20,
    readOnly: true,
    required: false,
    showHead: true,
    head: columns.map((column) => column.label || titleFromPath(column.path)),
    headWidthPercentages: widthPercentages(columns),
    binding: {
      path: variable.path,
      columns,
    },
  };
};

const TemplateDataPanel = (
  props: Pick<SidebarProps, 'schemas' | 'pageSize' | 'addSchema'> & {
    headerContent?: React.ReactNode;
  },
) => {
  const options = useContext(OptionsContext);
  const pluginsRegistry = useContext(PluginsRegistry);
  const variables = getDesignDataVariables(options.designData);
  const textDefault = pluginsRegistry.findByType('text')?.propPanel.defaultSchema;
  const tableDefault = pluginsRegistry.findByType('table')?.propPanel.defaultSchema;

  const addVariable = (variable: DesignDataVariable) => {
    const defaultSchema = cloneDeep(
      variable.kind === 'table' && tableDefault ? tableDefault : textDefault,
    );
    if (!defaultSchema) return;

    const schema =
      variable.kind === 'table'
        ? tableSchemaFromVariable(defaultSchema, variable)
        : scalarSchemaFromVariable(defaultSchema, variable);
    props.addSchema(withPosition(schema, props));
  };

  return (
    <SidebarFrame className={DESIGNER_CLASSNAME + 'template-data-view'}>
      <SidebarHeader>
        {props.headerContent ?? (
          <Text strong style={{ textAlign: 'center', width: '100%' }}>
            Template Data
          </Text>
        )}
      </SidebarHeader>
      <SidebarBody>
        {variables.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No data variables" />
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {variables.map((variable) => (
              <div
                key={variable.path}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 8,
                  alignItems: 'center',
                  padding: 10,
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  background: '#ffffff',
                }}
              >
                <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <Database size={14} aria-hidden="true" />
                    <Text strong ellipsis style={{ minWidth: 0 }}>
                      {variable.label}
                    </Text>
                  </div>
                  <Text type="secondary" ellipsis style={{ fontSize: 11 }}>
                    {variable.path}
                  </Text>
                  <Text ellipsis style={{ fontSize: 12 }}>
                    {variable.kind === 'table'
                      ? variable.formattedSample
                      : formatDesignDataValue(variable.sample, variable.format)}
                  </Text>
                  <Tag style={{ width: 'fit-content', marginInlineEnd: 0 }}>
                    {variable.kind === 'table' ? 'table' : variable.type}
                  </Tag>
                </div>
                <Button
                  aria-label={`Add ${variable.label}`}
                  icon={<Plus size={14} aria-hidden="true" />}
                  onClick={() => addVariable(variable)}
                />
              </div>
            ))}
          </div>
        )}
      </SidebarBody>
    </SidebarFrame>
  );
};

export default TemplateDataPanel;
