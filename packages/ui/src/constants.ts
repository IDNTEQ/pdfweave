export const DEFAULT_LANG = 'en';

export const DESTROYED_ERR_MSG = '[@pdfweave/ui] this instance is already destroyed';

export const SELECTABLE_CLASSNAME = 'selectable';

export const RULER_HEIGHT = 30;

export const PAGE_GAP = 10;

export const LEFT_SIDEBAR_WIDTH = 45;

export const RIGHT_SIDEBAR_WIDTH = 400;

export const BACKGROUND_COLOR = 'rgb(74, 74, 74)';

export const DEFAULT_MAX_ZOOM = 2;

// Public CSS class prefixes that downstream stylesheets target to theme
// the Designer / Form / Viewer. The `pdfweave-` prefix is part of the
// stable public surface; the same prefix is used directly as a string
// literal in `Moveable.tsx` (`pdfweave-moveable`), `Selecto.tsx`
// (`pdfweave-selecto`), and `AnchorOverlay.tsx`
// (`pdfweave-designer-anchor-overlay`).
export const DESIGNER_CLASSNAME = 'pdfweave-designer-';

export const UI_CLASSNAME = 'pdfweave-ui-';
