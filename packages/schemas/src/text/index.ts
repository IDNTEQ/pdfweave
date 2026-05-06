import type { Plugin } from '@pdfweave/common';
import { pdfRender } from './pdfRender.js';
import { propPanel } from './propPanel.js';
import { uiRender } from './uiRender.js';
import { measure } from './measure.js';
import type { TextSchema } from './types.js';
import { TextCursorInput } from 'lucide';
import { createSvgStr } from '../utils.js';

const textSchema: Plugin<TextSchema> = {
  pdf: pdfRender,
  ui: uiRender,
  propPanel,
  measure,
  icon: createSvgStr(TextCursorInput),
};

export default textSchema;
