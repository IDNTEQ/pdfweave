import type { Plugin } from '@pdfweave/common';
import type { TableSchema } from './types.js';
import { pdfRender } from './pdfRender.js';
import { uiRender } from './uiRender.js';
import { propPanel } from './propPanel.js';
import { getDynamicHeightsForTable } from './dynamicTemplate.js';
import { Table } from 'lucide';
import { createSvgStr } from '../utils.js';

const tableSchema: Plugin<TableSchema> = {
  pdf: pdfRender,
  ui: uiRender,
  measure: async ({ value, schema, basePdf, options, _cache, effectiveContentBounds }) => {
    const dynamicHeights = await getDynamicHeightsForTable(value, {
      schema,
      basePdf,
      options,
      _cache,
      effectiveContentBounds,
    });
    const height = dynamicHeights.reduce((sum, rowHeight) => sum + rowHeight, 0);

    return {
      width: schema.width,
      height,
      dynamicHeights,
      anchors: {
        top: { x: schema.position.x, y: schema.position.y },
        bottom: { x: schema.position.x, y: schema.position.y + height },
        left: { x: schema.position.x, y: schema.position.y },
        right: { x: schema.position.x + schema.width, y: schema.position.y },
      },
    };
  },
  propPanel,
  icon: createSvgStr(Table),
};
export default tableSchema;
