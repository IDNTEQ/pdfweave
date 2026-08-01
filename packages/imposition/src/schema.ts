import { z } from 'zod';
import type { ImposeProps, PdfInput } from './types.js';
import { invalidOption } from './errors.js';

export const HARD_MAX_PLACEMENTS = 100_000;
export const HARD_MAX_SHEETS = 10_000;
const HARD_MAX_GRID_AXIS = 1000;
const HARD_MAX_COPIES = 10_000;

const finitePositive = z.number().positive();
const finiteNonNegative = z.number().nonnegative();
const insetsSchema = z
  .object({
    top: finiteNonNegative,
    right: finiteNonNegative,
    bottom: finiteNonNegative,
    left: finiteNonNegative,
  })
  .strict();
const guttersSchema = z
  .object({
    horizontal: finiteNonNegative,
    vertical: finiteNonNegative,
  })
  .strict();
const paperSizeSchema = z.enum(['A2', 'A3', 'A4', 'A5', 'A6', 'Letter', 'Legal']);
const customSizeSchema = z.object({ width: finitePositive, height: finitePositive }).strict();

const sourceSchema = z.custom<PdfInput>(
  (value) =>
    Object.prototype.toString.call(value) === '[object ArrayBuffer]' ||
    (ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint8Array]'),
  'expected an ArrayBuffer or Uint8Array',
);

const imposePropsSchema = z
  .object({
    source: sourceSchema,
    unit: z.enum(['mm', 'pt']).optional(),
    sheet: z
      .object({
        size: z.union([paperSizeSchema, customSizeSchema]),
        orientation: z.enum(['portrait', 'landscape']).optional(),
        margins: z.union([finiteNonNegative, insetsSchema]).optional(),
        gutter: z.union([finiteNonNegative, guttersSchema]).optional(),
      })
      .strict(),
    layout: z
      .object({
        type: z.literal('n-up'),
        rows: z.number().int().min(1).max(HARD_MAX_GRID_AXIS),
        columns: z.number().int().min(1).max(HARD_MAX_GRID_AXIS),
        fill: z.enum(['row-major', 'column-major']).optional(),
        scale: z.enum(['contain', 'cover', 'none']).optional(),
        allowUpscale: z.boolean().optional(),
        autoRotate: z.boolean().optional(),
        align: z
          .object({
            horizontal: z.enum(['left', 'center', 'right']).optional(),
            vertical: z.enum(['bottom', 'middle', 'top']).optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    sourceBox: z.enum(['media', 'crop', 'trim', 'bleed', 'art']).optional(),
    pages: z.array(z.number().int().nonnegative()).min(1).max(HARD_MAX_PLACEMENTS).optional(),
    sequence: z
      .object({
        copies: z.number().int().min(1).max(HARD_MAX_COPIES).optional(),
        collation: z.enum(['collated', 'uncollated']).optional(),
      })
      .strict()
      .optional(),
    limits: z
      .object({
        maxPlacements: z.number().int().min(1).max(HARD_MAX_PLACEMENTS).optional(),
        maxSheets: z.number().int().min(1).max(HARD_MAX_SHEETS).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

interface ValidationErrorTree {
  errors: string[];
  properties?: Record<string, ValidationErrorTree | undefined>;
  items?: (ValidationErrorTree | undefined)[];
}

interface ValidationIssue {
  path: (string | number)[];
  message: string;
}

const flattenErrorTree = (
  tree: ValidationErrorTree,
  path: (string | number)[] = [],
): ValidationIssue[] => [
  ...tree.errors.map((message) => ({ path, message })),
  ...Object.entries(tree.properties ?? {}).flatMap(([key, child]) =>
    child ? flattenErrorTree(child, [...path, key]) : [],
  ),
  ...(tree.items ?? []).flatMap((child, index) =>
    child ? flattenErrorTree(child, [...path, index]) : [],
  ),
];

const getMostSpecificIssue = (error: z.ZodError): ValidationIssue => {
  const rootIssue = error.issues[0];
  if (!rootIssue) return { path: [], message: 'Invalid input' };
  if (rootIssue.code !== 'invalid_union') {
    return { path: rootIssue.path as (string | number)[], message: rootIssue.message };
  }

  const issues = flattenErrorTree(z.treeifyError(new z.ZodError([rootIssue])));
  let selected = issues.at(0) ?? {
    path: rootIssue.path as (string | number)[],
    message: rootIssue.message,
  };
  for (const candidate of issues.slice(1)) {
    if (candidate.path.length > selected.path.length) selected = candidate;
  }
  return selected;
};

export const parseImposeProps = (props: ImposeProps): ImposeProps => {
  const result = imposePropsSchema.safeParse(props);
  if (result.success) return result.data;

  const issue = getMostSpecificIssue(result.error);
  const path = issue.path.length > 0 ? issue.path.map(String).join('.') : 'options';
  throw invalidOption(path, issue.message);
};
