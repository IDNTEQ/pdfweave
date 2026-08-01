import {
  Schema,
  BasePdf,
  BlankPdf,
  StationeryPdf,
  CommonOptions,
  treatsLikeBlank,
} from '@pdfweave/common';
import { createSingleTable } from './tableHelper.js';
import { getBodyWithRange, getBody } from './helper.js';
import { TableSchema } from './types.js';

const PRE_PAGINATED_HEIGHTS = Symbol.for('@pdfweave/pre-paginated-dynamic-heights');

export interface DynamicTableArgs {
  schema: Schema;
  basePdf: BasePdf;
  options: CommonOptions;
  _cache: Map<string | number, unknown>;
}

const measureTableRows = async (value: string, args: DynamicTableArgs) => {
  if (args.schema.type !== 'table') return undefined;
  const schema = args.schema as TableSchema;
  // Pass column count so a comma-flattened string (pdfme/pdfme#1299) can be
  // reshaped into rows instead of crashing JSON.parse.
  const columnCount =
    (Array.isArray(schema.headWidthPercentages) && schema.headWidthPercentages.length) ||
    (Array.isArray(schema.head) && schema.head.length) ||
    undefined;
  const body =
    schema.__bodyRange?.start === 0
      ? getBody(value, columnCount)
      : getBodyWithRange(value, schema.__bodyRange, columnCount);
  const table = await createSingleTable(body, args);

  const baseHeights = schema.showHead
    ? table.allRows().map((row) => row.height)
    : [0].concat(table.body.map((row) => row.height));

  return { baseHeights, schema, table };
};

/** Raw header/body row heights used by the shared layout engine. */
export const getTableRowHeights = async (
  value: string,
  args: DynamicTableArgs,
): Promise<number[]> => {
  const measured = await measureTableRows(value, args);
  return measured?.baseHeights ?? [args.schema.height];
};

/**
 * Backward-compatible table heights with continuation headers assigned to the
 * first body row on each generated page. New plugin layout uses
 * `getTableRowHeights` so the common paginator owns this accounting.
 */
export const getDynamicHeightsForTable = async (
  value: string,
  args: DynamicTableArgs,
): Promise<number[]> => {
  const measured = await measureTableRows(value, args);
  if (!measured) return [args.schema.height];
  const { baseHeights, schema, table } = measured;
  const headerHeight = schema.showHead ? table.getHeadHeight() : 0;
  const shouldRepeatHeader = schema.repeatHead && treatsLikeBlank(args.basePdf) && headerHeight > 0;
  if (!shouldRepeatHeader) return baseHeights;

  const basePdf = args.basePdf as BlankPdf | StationeryPdf;
  const [paddingTop, , paddingBottom] = basePdf.padding;
  const pageContentHeight = basePdf.height - paddingTop - paddingBottom;
  const getPageStartY = (pageIndex: number): number => pageIndex * pageContentHeight + paddingTop;
  const initialPageIndex = Math.max(
    0,
    Math.floor((schema.position.y - paddingTop) / pageContentHeight),
  );
  const headRowCount = schema.showHead ? table.head.length : 0;
  const safetyMargin = 0.5;
  let currentPageIndex = initialPageIndex;
  let currentPageY = schema.position.y;
  let rowsOnCurrentPage = 0;
  const result: number[] = [];

  for (let index = 0; index < baseHeights.length; index += 1) {
    const isBodyRow = index >= headRowCount;
    const rowHeight = baseHeights[index];

    while (true) {
      const currentPageStartY = getPageStartY(currentPageIndex);
      const remainingHeight = currentPageStartY + pageContentHeight - currentPageY;
      const needsHeader =
        isBodyRow && rowsOnCurrentPage === 0 && currentPageIndex > initialPageIndex;
      const totalRowHeight = rowHeight + (needsHeader ? headerHeight : 0);

      if (totalRowHeight > remainingHeight - safetyMargin) {
        if (rowsOnCurrentPage === 0 && Math.abs(currentPageY - currentPageStartY) < safetyMargin) {
          result.push(totalRowHeight);
          currentPageY += totalRowHeight;
          rowsOnCurrentPage += 1;
          break;
        }
        currentPageIndex += 1;
        currentPageY = getPageStartY(currentPageIndex);
        rowsOnCurrentPage = 0;
        continue;
      }

      result.push(totalRowHeight);
      currentPageY += totalRowHeight;
      rowsOnCurrentPage += 1;
      if (currentPageY >= currentPageStartY + pageContentHeight - safetyMargin) {
        currentPageIndex += 1;
        currentPageY = getPageStartY(currentPageIndex);
        rowsOnCurrentPage = 0;
      }
      break;
    }
  }

  Object.defineProperty(result, PRE_PAGINATED_HEIGHTS, { value: true });
  return result;
};
