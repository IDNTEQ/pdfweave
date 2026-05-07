export const DEFAULT_LANG = 'en';

export const DESTROYED_ERR_MSG = '[@pdfweave/ui] this instance is already destroyed';

export const SELECTABLE_CLASSNAME = 'selectable';

export const RULER_HEIGHT = 30;

export const PAGE_GAP = 10;

export const LEFT_SIDEBAR_WIDTH = 45;

export const RIGHT_SIDEBAR_WIDTH = 400;

export const BACKGROUND_COLOR = 'rgb(74, 74, 74)';

export const DEFAULT_MAX_ZOOM = 2;

// Compat (kept as `pdfme-`): public CSS class prefixes that downstream
// stylesheets target to theme the Designer / Form / Viewer. Renaming
// would silently break user CSS; the prefix is treated as part of the
// stable surface area. See docs/branding-audit-2026-05-07.md.
// The same prefix is used directly as a string literal in
// `Moveable.tsx` (`pdfme-moveable`), `Selecto.tsx` (`pdfme-selecto`),
// and `AnchorOverlay.tsx` (`pdfme-designer-anchor-overlay`).
export const DESIGNER_CLASSNAME = 'pdfme-designer-';

export const UI_CLASSNAME = 'pdfme-ui-';
