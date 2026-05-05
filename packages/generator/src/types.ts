export type EmbedPdfBox = {
  mediaBox: { x: number; y: number; width: number; height: number };
  bleedBox: { x: number; y: number; width: number; height: number };
  trimBox: { x: number; y: number; width: number; height: number };
  /**
   * The CropBox of the source page, when distinct from the MediaBox. The PDF
   * spec defines CropBox as defaulting to MediaBox, but callers commonly use
   * an explicit CropBox to mark the visible/trim region inside a larger
   * MediaBox (e.g. print-ready PDFs with bleed). When this is set, the
   * generator translates schema positions by (cropBox.x, cropBox.y) so they
   * land inside the visible region rather than at the MediaBox origin.
   * `undefined` means "no explicit CropBox; treat the MediaBox as the visible
   * area" — which preserves the historical no-op behavior.
   */
  cropBox?: { x: number; y: number; width: number; height: number };
};
