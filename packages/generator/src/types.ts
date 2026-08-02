export type EmbedPdfBox = {
  mediaBox: { x: number; y: number; width: number; height: number };
  bleedBox: { x: number; y: number; width: number; height: number };
  trimBox: { x: number; y: number; width: number; height: number };
  /**
   * The CropBox of the source page, when distinct from the MediaBox. The PDF
   * spec defines CropBox as defaulting to MediaBox, but callers commonly use
   * an explicit CropBox to mark the visible/trim region inside a larger
   * MediaBox (e.g. print-ready PDFs with bleed). When this is set, the
   * generator translates top-left schema coordinates into the CropBox. The
   * horizontal offset is its absolute PDF x coordinate; the vertical offset
   * is derived from its top edge because schema y coordinates increase
   * downward while PDF y coordinates increase upward.
   * `undefined` means "no explicit CropBox; treat the MediaBox as the visible
   * area".
   */
  cropBox?: { x: number; y: number; width: number; height: number };
};
