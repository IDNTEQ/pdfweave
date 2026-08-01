import type {
  DataFormatHint,
  DesignDataField,
  DesignDataPackage,
  DesignDataVariable,
  Schema,
  SchemaBinding,
  SchemaBindingColumn,
  SchemaPageArray,
} from './types.js';
import { replacePlaceholders } from './expression.js';
import {
  buildPreviewRows,
  getTableColumns as resolveTableColumns,
  inferColumns as inferTableColumns,
} from './tableBinding.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const titleFromPath = (path: string): string => {
  const last = path.split('.').pop() || path;
  return last
    .replace(/\[(\d+)\]/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
};

const getFormatKind = (format?: DataFormatHint): string | undefined =>
  typeof format === 'string' ? format : format?.kind;

const getFormatOption = <T>(format: DataFormatHint | undefined, key: string): T | undefined =>
  typeof format === 'object' && format !== null ? (format[key] as T | undefined) : undefined;

const parseDateValue = (value: unknown): Date => {
  if (value instanceof Date) return value;

  const raw = String(value);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!dateOnly) return new Date(raw);

  const year = Number(dateOnly[1]);
  const month = Number(dateOnly[2]) - 1;
  const day = Number(dateOnly[3]);
  const date = new Date(year, month, day);
  if (year < 100) date.setFullYear(year);

  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? date
    : new Date(Number.NaN);
};

const tokenizePath = (path: string): Array<string | number> => {
  const tokens: Array<string | number> = [];
  const re = /([^[.\]]+)|\[(\d+|(["'])(.*?)\3)\]/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(path))) {
    if (match[1]) {
      tokens.push(match[1]);
    } else if (match[2]) {
      const raw = match[2];
      tokens.push(/^\d+$/.test(raw) ? Number(raw) : (match[4] ?? raw));
    }
  }

  return tokens;
};

export const getValueByPath = (data: unknown, path: string): unknown => {
  if (!path) return data;
  if (isRecord(data) && Object.prototype.hasOwnProperty.call(data, path)) {
    return data[path];
  }

  return tokenizePath(path).reduce<unknown>((current, token) => {
    if (current == null) return undefined;
    if (typeof token === 'number') {
      return Array.isArray(current) ? current[token] : undefined;
    }
    return isRecord(current) ? current[token] : undefined;
  }, data);
};

const inferType = (value: unknown): string => {
  if (Array.isArray(value)) return 'array';
  if (value === null || typeof value === 'undefined') return 'unknown';
  if (value instanceof Date) return 'date';
  return typeof value === 'object' ? 'object' : typeof value;
};

export const formatDesignDataValue = (value: unknown, format?: DataFormatHint): string => {
  if (value == null) return '';

  const kind = getFormatKind(format);
  const locale = getFormatOption<string>(format, 'locale');

  if (kind === 'currency') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: getFormatOption<string>(format, 'currency') || 'USD',
        minimumFractionDigits: getFormatOption<number>(format, 'minimumFractionDigits'),
        maximumFractionDigits: getFormatOption<number>(format, 'maximumFractionDigits'),
      }).format(numeric);
    }
  }

  if (kind === 'number') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: getFormatOption<number>(format, 'minimumFractionDigits'),
        maximumFractionDigits: getFormatOption<number>(format, 'maximumFractionDigits'),
      }).format(numeric);
    }
  }

  if (kind === 'date') {
    const date = parseDateValue(value);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: getFormatOption<Intl.DateTimeFormatOptions['dateStyle']>(format, 'dateStyle'),
        timeStyle: getFormatOption<Intl.DateTimeFormatOptions['timeStyle']>(format, 'timeStyle'),
      }).format(date);
    }
  }

  if (kind === 'boolean' || typeof value === 'boolean') {
    return value
      ? getFormatOption<string>(format, 'trueLabel') || 'Yes'
      : getFormatOption<string>(format, 'falseLabel') || 'No';
  }

  if (Array.isArray(value) || isRecord(value)) {
    return JSON.stringify(value);
  }

  return String(value);
};

const normalizeSchemaFields = (
  schema: DesignDataPackage['schema'],
): Record<string, DesignDataField> | undefined => {
  if (!isRecord(schema)) return undefined;
  const fields = schema.fields;
  if (isRecord(fields)) return fields as Record<string, DesignDataField>;
  return schema as Record<string, DesignDataField>;
};

const inferItemFields = (items: unknown[]): Record<string, DesignDataField> | undefined => {
  const firstRecord = items.find(isRecord);
  if (!firstRecord) return undefined;

  return Object.fromEntries(
    Object.entries(firstRecord).map(([key, value]) => [
      key,
      { type: inferType(value), sample: value },
    ]),
  );
};

const createColumns = (
  itemFields: Record<string, DesignDataField> | undefined,
  sample: unknown,
): SchemaBindingColumn[] =>
  inferTableColumns(
    sample,
    itemFields ?? (Array.isArray(sample) ? inferItemFields(sample) : undefined),
  );

const visitFields = (
  fields: Record<string, DesignDataField>,
  data: unknown,
  prefix: string,
  variables: DesignDataVariable[],
) => {
  Object.entries(fields).forEach(([key, field]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const sample = Object.prototype.hasOwnProperty.call(field, 'sample')
      ? field.sample
      : getValueByPath(data, path);
    const type = field.type || inferType(sample);

    if (type === 'array' || Array.isArray(sample)) {
      const columns = createColumns(field.itemFields, sample);
      variables.push({
        path,
        label: field.label || titleFromPath(path),
        type: 'array',
        kind: 'table',
        sample,
        formattedSample: `${Array.isArray(sample) ? sample.length : 0} rows`,
        format: field.format,
        description: field.description,
        itemFields: field.itemFields,
        columns,
      });
      return;
    }

    if ((type === 'object' || isRecord(sample)) && field.fields) {
      visitFields(field.fields, data, path, variables);
      return;
    }

    if (isRecord(sample) && !field.format) {
      return;
    }

    variables.push({
      path,
      label: field.label || titleFromPath(path),
      type,
      kind: 'scalar',
      sample,
      formattedSample: formatDesignDataValue(sample, field.format),
      format: field.format,
      description: field.description,
    });
  });
};

const inferVariablesFromData = (data: unknown, prefix = ''): DesignDataVariable[] => {
  if (!isRecord(data)) return [];

  return Object.entries(data).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) {
      const columns = createColumns(undefined, value);
      return [
        {
          path,
          label: titleFromPath(path),
          type: 'array',
          kind: 'table' as const,
          sample: value,
          formattedSample: `${value.length} rows`,
          columns,
        },
      ];
    }
    if (isRecord(value)) {
      return inferVariablesFromData(value, path);
    }
    return [
      {
        path,
        label: titleFromPath(path),
        type: inferType(value),
        kind: 'scalar' as const,
        sample: value,
        formattedSample: formatDesignDataValue(value),
      },
    ];
  });
};

export const getDesignDataInput = (designData?: DesignDataPackage): unknown => {
  if (!designData) return {};
  return Object.prototype.hasOwnProperty.call(designData, 'data') ? designData.data : designData;
};

export const getDesignDataVariables = (designData?: DesignDataPackage): DesignDataVariable[] => {
  if (!designData) return [];

  const data = getDesignDataInput(designData);
  const fields = normalizeSchemaFields(designData.schema);
  if (!fields) return inferVariablesFromData(data);

  const variables: DesignDataVariable[] = [];
  visitFields(fields, data, '', variables);
  return variables;
};

const getInputRecord = (input?: unknown): Record<string, unknown> => (isRecord(input) ? input : {});

export const resolveSchemaValue = (arg: {
  schema: Schema;
  input?: unknown;
  schemas?: SchemaPageArray;
  totalPages?: number;
  currentPage?: number;
}): string => {
  const { schema, input, schemas = [], totalPages, currentPage } = arg;
  const inputRecord = getInputRecord(input);
  const binding = schema.binding as SchemaBinding | undefined;

  if (binding?.path) {
    const value = getValueByPath(inputRecord, binding.path);
    const resolvedValue =
      schema.type === 'table'
        ? JSON.stringify(
            buildPreviewRows({ columns: resolveTableColumns(schema, value), sample: value }),
          )
        : formatDesignDataValue(value, binding.format);

    if (schema.readOnly && schema.content && /\{[^}]+\}/.test(schema.content)) {
      return replacePlaceholders({
        content: schema.content,
        variables: {
          ...inputRecord,
          [schema.name]: resolvedValue,
          [binding.path]: resolvedValue,
          value: resolvedValue,
          totalPages,
          currentPage,
        },
        schemas,
      });
    }

    return resolvedValue;
  }

  if (schema.readOnly) {
    return replacePlaceholders({
      content: schema.content || '',
      variables: { ...inputRecord, totalPages, currentPage },
      schemas,
    });
  }

  const value = getValueByPath(inputRecord, schema.name);
  if (schema.type === 'table' && Array.isArray(value)) {
    return JSON.stringify(
      buildPreviewRows({ columns: resolveTableColumns(schema, value), sample: value }),
    );
  }

  return typeof value === 'undefined' ? schema.content || '' : formatDesignDataValue(value);
};
