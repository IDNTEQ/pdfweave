import {
  getDesignDataVariables,
  getTableBindingPreview,
  getValueByPath,
  resolveSchemaValue,
  Schema,
} from '../src/index.js';

describe('data binding helpers', () => {
  test('resolves literal dotted keys before nested paths', () => {
    const data = {
      'customer.name': 'Literal Name',
      customer: { name: 'Nested Name' },
    };

    expect(getValueByPath(data, 'customer.name')).toBe('Literal Name');
    expect(getValueByPath({ customer: { name: 'Nested Name' } }, 'customer.name')).toBe(
      'Nested Name',
    );
  });

  test('formats table binding previews from object rows, array rows, and JSON strings', () => {
    const columns = [
      { path: 'sku', label: 'SKU' },
      { path: 'price', label: 'Price', format: { kind: 'currency', currency: 'USD' } },
    ];

    expect(getTableBindingPreview([{ sku: 'ENV-10', price: 0.82 }], columns)).toEqual([
      ['ENV-10', '$0.82'],
    ]);
    expect(getTableBindingPreview([['ENV-10', 0.82]], columns)).toEqual([['ENV-10', '$0.82']]);
    expect(getTableBindingPreview(JSON.stringify([{ sku: 'ENV-10', price: 0.82 }]), columns)).toEqual([
      ['ENV-10', '$0.82'],
    ]);
  });

  test('resolves bound table values from JSON string inputs', () => {
    const schema: Schema = {
      name: 'items',
      type: 'table',
      content: '[]',
      position: { x: 0, y: 0 },
      width: 100,
      height: 20,
      binding: {
        path: 'items',
        columns: [
          { path: 'sku', label: 'SKU' },
          { path: 'price', label: 'Price', format: { kind: 'currency', currency: 'USD' } },
        ],
      },
    };

    expect(
      resolveSchemaValue({
        schema,
        input: { items: JSON.stringify([{ sku: 'ENV-10', price: 0.82 }]) },
      }),
    ).toBe(JSON.stringify([['ENV-10', '$0.82']]));
  });

  test('keeps placeholder substitution available for read-only bound fields', () => {
    const schema: Schema = {
      name: 'pageLabel',
      type: 'text',
      content: 'Page {currentPage} of {totalPages}: {value}',
      position: { x: 0, y: 0 },
      width: 50,
      height: 10,
      readOnly: true,
      binding: { path: 'title' },
    };

    expect(
      resolveSchemaValue({
        schema,
        input: { title: 'Invoice' },
        currentPage: 2,
        totalPages: 3,
      }),
    ).toBe('Page 2 of 3: Invoice');
  });

  test('extracts variables from design data metadata and inferred arrays', () => {
    const variables = getDesignDataVariables({
      data: {
        total: 1240.5,
        items: [{ sku: 'ENV-10', price: 0.82 }],
      },
      schema: {
        version: 1,
        fields: {
          total: {
            type: 'number',
            label: 'Total',
            format: { kind: 'currency', currency: 'USD' },
          },
          items: {
            type: 'array',
            label: 'Items',
            itemFields: {
              sku: { type: 'string', label: 'SKU' },
              price: {
                type: 'number',
                label: 'Price',
                format: { kind: 'currency', currency: 'USD' },
              },
            },
          },
        },
      },
    });

    expect(variables.find((variable) => variable.path === 'total')?.formattedSample).toBe(
      '$1,240.50',
    );
    expect(variables.find((variable) => variable.path === 'items')?.columns).toEqual([
      { path: 'sku', label: 'SKU', format: undefined, widthPercentage: 50 },
      {
        path: 'price',
        label: 'Price',
        format: { kind: 'currency', currency: 'USD' },
        widthPercentage: 50,
      },
    ]);
  });
});
