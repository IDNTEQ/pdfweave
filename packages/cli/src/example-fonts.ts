import type { Font } from '@pdfweave/common';

export const OFFICIAL_EXAMPLE_FONT_URLS = {
  NotoSansJP:
    'https://fonts.gstatic.com/s/notosansjp/v53/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75vY0rw-oME.ttf',
  NotoSerifJP:
    'https://fonts.gstatic.com/s/notoserifjp/v30/xn71YHs72GKoTvER4Gn3b5eMRtWGkp6o7MjQ2bwxOubAILO5wBCU.ttf',
  'PinyonScript-Regular':
    'https://fonts.gstatic.com/s/pinyonscript/v22/6xKpdSJbL9-e9LuoeQiDRQR8aOLQO4bhiDY.ttf',
} as const;

export function collectTemplateFontNames(template: Record<string, unknown>): string[] {
  const schemas = template.schemas;
  if (!Array.isArray(schemas)) {
    return [];
  }

  const fontNames = new Set<string>();
  for (const page of schemas) {
    const pageSchemas = Array.isArray(page)
      ? page
      : typeof page === 'object' && page !== null
        ? Object.values(page)
        : [];

    for (const schema of pageSchemas) {
      if (typeof schema !== 'object' || schema === null) continue;

      const fontName = (schema as Record<string, unknown>).fontName;
      if (typeof fontName === 'string' && fontName.length > 0) {
        fontNames.add(fontName);
      }
    }
  }

  return [...fontNames].sort();
}

export function getOfficialExampleFonts(template: Record<string, unknown>): Font | undefined {
  const entries = collectTemplateFontNames(template).flatMap((fontName) => {
    const url = OFFICIAL_EXAMPLE_FONT_URLS[fontName as keyof typeof OFFICIAL_EXAMPLE_FONT_URLS];
    return url ? [[fontName, { data: url, fallback: false, subset: true }] as const] : [];
  });

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries) as Font;
}
