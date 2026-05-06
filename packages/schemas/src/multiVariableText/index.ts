import type { Plugin } from '@pdfweave/common';
import { pdfRender } from './pdfRender.js';
import { propPanel } from './propPanel.js';
import { uiRender } from './uiRender.js';
import type { MultiVariableTextSchema } from './types.js';
import { measure as measureText } from '../text/measure.js';
import {
  substituteVariables,
  substituteVariablesAsInlineMarkdownLiterals,
} from './helper.js';
import { isInlineMarkdownTextSchema } from '../text/richText.js';
import { Type } from 'lucide';
import { createSvgStr } from '../utils.js';

const schema: Plugin<MultiVariableTextSchema> = {
  pdf: pdfRender,
  ui: uiRender,
  propPanel,
  measure: (arg) => {
    const value = isInlineMarkdownTextSchema(arg.schema)
      ? substituteVariablesAsInlineMarkdownLiterals(arg.schema.text || '', arg.value)
      : substituteVariables(arg.schema.text || '', arg.value);
    return measureText({ ...arg, value });
  },
  icon: createSvgStr(Type),
  uninterruptedEditMode: true,
};
export default schema;
