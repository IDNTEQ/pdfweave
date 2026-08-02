export const BOLETO_INSTITUTION_CODE_GLYPH_HEIGHT_MM = 5;
export const BOLETO_INSTITUTION_CODE_STROKE_MM = 1.2;
export const BOLETO_DIGITABLE_LINE_GLYPH_HEIGHT_MM = 4;
export const BOLETO_DIGITABLE_LINE_STROKE_MM = 0.3;
export const BOLETO_MECHANICAL_AUTHENTICATION_LABEL =
  'Autenticação Mecânica - Ficha de Compensação' as const;
export const BOLETO_MECHANICAL_AUTHENTICATION_GLYPH_HEIGHT_MM = 2;
export const BOLETO_MECHANICAL_AUTHENTICATION_STROKE_MM = 0.3;

export interface BoletoVectorSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface BoletoVectorDisplayPrimitive {
  id: string;
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
  glyphHeight: number;
  strokeWidth: number;
  lineCap: 'round';
  segments: BoletoVectorSegment[];
}

interface CreateVectorDisplayOptions {
  id: string;
  value: string;
  x: number;
  y: number;
  glyphHeight: number;
  glyphWidth: number;
  strokeWidth: number;
  characterGap: number;
}

type NormalizedPoint = readonly [x: number, y: number];
type NormalizedPath = readonly NormalizedPoint[];

// A compact technical single-line face. Curved digits use short polylines so PDF and UI
// consume exactly the same geometry without depending on font metrics or font availability.
const GLYPH_PATHS: Partial<Record<string, readonly NormalizedPath[]>> = {
  '0': [
    [
      [0.5, 0],
      [0.22, 0.03],
      [0.05, 0.18],
      [0, 0.5],
      [0.05, 0.82],
      [0.22, 0.97],
      [0.5, 1],
      [0.78, 0.97],
      [0.95, 0.82],
      [1, 0.5],
      [0.95, 0.18],
      [0.78, 0.03],
      [0.5, 0],
    ],
  ],
  '1': [
    [
      [0, 0.2],
      [0.46, 0],
      [0.46, 1],
    ],
    [
      [0, 1],
      [1, 1],
    ],
  ],
  '2': [
    [
      [0, 0.18],
      [0.12, 0.06],
      [0.32, 0],
      [0.72, 0],
      [0.91, 0.1],
      [1, 0.26],
      [0.94, 0.4],
      [0.76, 0.56],
      [0, 1],
      [1, 1],
    ],
  ],
  '3': [
    [
      [0, 0.1],
      [0.2, 0],
      [0.7, 0],
      [0.91, 0.09],
      [1, 0.24],
      [0.94, 0.39],
      [0.72, 0.5],
      [0.94, 0.6],
      [1, 0.76],
      [0.91, 0.91],
      [0.7, 1],
      [0.2, 1],
      [0, 0.9],
    ],
  ],
  '4': [
    [
      [0.76, 1],
      [0.76, 0],
    ],
    [
      [0.76, 0],
      [0, 0.68],
      [1, 0.68],
    ],
  ],
  '5': [
    [
      [1, 0],
      [0.08, 0],
      [0, 0.48],
      [0.64, 0.48],
      [0.87, 0.56],
      [1, 0.72],
      [0.95, 0.89],
      [0.75, 1],
      [0.24, 1],
      [0, 0.88],
    ],
  ],
  '6': [
    [
      [1, 0.1],
      [0.78, 0],
      [0.4, 0],
      [0.16, 0.16],
      [0.03, 0.4],
      [0, 0.67],
      [0.08, 0.87],
      [0.28, 1],
      [0.7, 1],
      [0.92, 0.87],
      [1, 0.68],
      [0.94, 0.53],
      [0.73, 0.43],
      [0.13, 0.43],
    ],
  ],
  '7': [
    [
      [0, 0],
      [1, 0],
      [0.58, 1],
    ],
  ],
  '8': [
    [
      [0.5, 0.5],
      [0.2, 0.44],
      [0, 0.29],
      [0.05, 0.12],
      [0.25, 0.02],
      [0.5, 0],
      [0.75, 0.02],
      [0.95, 0.12],
      [1, 0.29],
      [0.8, 0.44],
      [0.5, 0.5],
      [0.2, 0.56],
      [0, 0.71],
      [0.05, 0.88],
      [0.25, 0.98],
      [0.5, 1],
      [0.75, 0.98],
      [0.95, 0.88],
      [1, 0.71],
      [0.8, 0.56],
      [0.5, 0.5],
    ],
  ],
  '9': [
    [
      [0.5, 0],
      [0.22, 0.03],
      [0.05, 0.18],
      [0, 0.38],
      [0.08, 0.55],
      [0.28, 0.64],
      [0.6, 0.64],
      [0.85, 0.5],
      [1, 0.3],
      [0.94, 0.13],
      [0.72, 0.03],
      [0.5, 0],
    ],
    [
      [1, 0.3],
      [0.98, 0.62],
      [0.88, 0.82],
      [0.7, 0.96],
      [0.35, 1],
    ],
  ],
  A: [
    [
      [0, 1],
      [0.5, 0],
      [1, 1],
    ],
    [
      [0.2, 0.62],
      [0.8, 0.62],
    ],
  ],
  C: [
    [
      [1, 0.1],
      [0.8, 0],
      [0.2, 0],
      [0, 0.2],
      [0, 0.8],
      [0.2, 1],
      [0.8, 1],
      [1, 0.9],
    ],
  ],
  D: [
    [
      [0, 0],
      [0, 1],
      [0.62, 1],
      [1, 0.75],
      [1, 0.25],
      [0.62, 0],
      [0, 0],
    ],
  ],
  E: [
    [
      [1, 0],
      [0, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [0, 0.5],
      [0.8, 0.5],
    ],
  ],
  F: [
    [
      [1, 0],
      [0, 0],
      [0, 1],
    ],
    [
      [0, 0.5],
      [0.8, 0.5],
    ],
  ],
  H: [
    [
      [0, 0],
      [0, 1],
    ],
    [
      [1, 0],
      [1, 1],
    ],
    [
      [0, 0.5],
      [1, 0.5],
    ],
  ],
  I: [
    [
      [0, 0],
      [1, 0],
    ],
    [
      [0.5, 0],
      [0.5, 1],
    ],
    [
      [0, 1],
      [1, 1],
    ],
  ],
  M: [
    [
      [0, 1],
      [0, 0],
      [0.5, 0.55],
      [1, 0],
      [1, 1],
    ],
  ],
  N: [
    [
      [0, 1],
      [0, 0],
      [1, 1],
      [1, 0],
    ],
  ],
  O: [
    [
      [0.5, 0],
      [0.2, 0],
      [0, 0.2],
      [0, 0.8],
      [0.2, 1],
      [0.8, 1],
      [1, 0.8],
      [1, 0.2],
      [0.8, 0],
      [0.5, 0],
    ],
  ],
  P: [
    [
      [0, 1],
      [0, 0],
      [0.68, 0],
      [1, 0.18],
      [1, 0.4],
      [0.68, 0.55],
      [0, 0.55],
    ],
  ],
  S: [
    [
      [1, 0.1],
      [0.8, 0],
      [0.2, 0],
      [0, 0.2],
      [0.2, 0.48],
      [0.8, 0.52],
      [1, 0.8],
      [0.8, 1],
      [0.2, 1],
      [0, 0.9],
    ],
  ],
  T: [
    [
      [0, 0],
      [1, 0],
    ],
    [
      [0.5, 0],
      [0.5, 1],
    ],
  ],
  U: [
    [
      [0, 0],
      [0, 0.78],
      [0.2, 1],
      [0.8, 1],
      [1, 0.78],
      [1, 0],
    ],
  ],
  Â: [
    [
      [0, 1],
      [0.5, 0.2],
      [1, 1],
    ],
    [
      [0.2, 0.68],
      [0.8, 0.68],
    ],
    [
      [0.24, 0.12],
      [0.5, 0],
      [0.76, 0.12],
    ],
  ],
  Ã: [
    [
      [0, 1],
      [0.5, 0.22],
      [1, 1],
    ],
    [
      [0.2, 0.68],
      [0.8, 0.68],
    ],
    [
      [0.12, 0.1],
      [0.3, 0.02],
      [0.5, 0.1],
      [0.7, 0.18],
      [0.88, 0.1],
    ],
  ],
  Ç: [
    [
      [1, 0.08],
      [0.8, 0],
      [0.2, 0],
      [0, 0.16],
      [0, 0.62],
      [0.2, 0.78],
      [0.8, 0.78],
      [1, 0.7],
    ],
    [
      [0.48, 0.78],
      [0.66, 0.87],
      [0.58, 1],
      [0.4, 1],
    ],
  ],
  '-': [
    [
      [0, 0.5],
      [1, 0.5],
    ],
  ],
  '.': [
    [
      [0.5, 0.93],
      [0.5, 1],
    ],
  ],
  X: [
    [
      [0, 0],
      [1, 1],
    ],
    [
      [1, 0],
      [0, 1],
    ],
  ],
  ' ': [],
};

const getCharacterWidth = (character: string, glyphWidth: number): number => {
  if (character === '.') return glyphWidth * 0.2;
  if (character === '-') return glyphWidth * 0.65;
  return glyphWidth;
};

const getGlyphPaths = (character: string): readonly NormalizedPath[] => {
  // The mechanical-authentication caption uses this technical face as small caps. Preserve
  // the original value for accessibility and evidence while sharing one PDF/UI geometry.
  const lookupCharacter = character.toUpperCase();
  // eslint-disable-next-line security/detect-object-injection -- validated against the fixed internal glyph catalog
  const paths = GLYPH_PATHS[lookupCharacter];
  if (paths) return paths;
  throw new Error(`[@pdfweave/schemas/boleto] Unsupported vector display character: ${character}`);
};

export const createBoletoVectorDisplay = ({
  id,
  value,
  x,
  y,
  glyphHeight,
  glyphWidth,
  strokeWidth,
  characterGap,
}: CreateVectorDisplayOptions): BoletoVectorDisplayPrimitive => {
  const segments: BoletoVectorSegment[] = [];
  const characters = Array.from(value);
  const halfStroke = strokeWidth / 2;
  const centerlineHeight = glyphHeight - strokeWidth;
  let cursor = 0;

  for (const [index, character] of characters.entries()) {
    const characterWidth = getCharacterWidth(character, glyphWidth);
    const centerlineWidth = characterWidth - strokeWidth;
    if (centerlineWidth < 0 || centerlineHeight <= 0) {
      throw new Error('[@pdfweave/schemas/boleto] Vector glyph box must exceed its stroke width');
    }
    for (const path of getGlyphPaths(character)) {
      for (let pointIndex = 1; pointIndex < path.length; pointIndex += 1) {
        const start = path.at(pointIndex - 1);
        const end = path.at(pointIndex);
        if (!start || !end) continue;
        segments.push({
          x1: cursor + halfStroke + start[0] * centerlineWidth,
          y1: halfStroke + start[1] * centerlineHeight,
          x2: cursor + halfStroke + end[0] * centerlineWidth,
          y2: halfStroke + end[1] * centerlineHeight,
        });
      }
    }
    cursor += characterWidth;
    if (index < characters.length - 1) cursor += characterGap;
  }

  return {
    id,
    value,
    x,
    y,
    width: cursor,
    height: glyphHeight,
    glyphHeight,
    strokeWidth,
    lineCap: 'round',
    segments,
  };
};
