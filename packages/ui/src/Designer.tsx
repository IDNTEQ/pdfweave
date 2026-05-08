import React from 'react';
import {
  cloneDeep,
  Template,
  DesignerProps,
  checkDesignerProps,
  checkTemplate,
  PDFME_VERSION,
} from '@pdfweave/common';
import { BaseUIClass } from './class.js';
import { DESTROYED_ERR_MSG } from './constants.js';
import DesignerComponent, { type PageOverflowInfo } from './components/Designer/index.js';
import AppContextProvider from './components/AppContextProvider.js';

export type { PageOverflowInfo };
export type DesignerConstructorProps = DesignerProps & {
  onPageOverflowChange?: (info: PageOverflowInfo) => void;
};

/**
 * Optional behaviour switches for {@link Designer.updateTemplate}.
 *
 * pdfme#1235: previously calling `updateTemplate()` always reset the page
 * cursor back to 0. Callers can now opt into a specific page or rely on the
 * default behaviour, which preserves the current page (clamped to the new
 * template's last valid page index).
 */
export type UpdateTemplateOptions = {
  /**
   * Target page index to focus after the update. When omitted the current
   * page index is retained, clamped to the final page of the new template.
   */
  page?: number;
};

class Designer extends BaseUIClass {
  private onSaveTemplateCallback?: (template: Template) => void;
  private onChangeTemplateCallback?: (template: Template) => void;
  private onPageChangeCallback?: (pageInfo: { currentPage: number; totalPages: number }) => void;
  private onPageOverflowChangeCallback?: (info: PageOverflowInfo) => void;
  private pageCursor: number = 0;
  private pendingPageCursor: number | null = null;

  constructor(props: DesignerConstructorProps) {
    const { onPageOverflowChange, ...designerProps } = props;
    super(designerProps);
    checkDesignerProps(designerProps);
    this.onPageOverflowChangeCallback = onPageOverflowChange;
  }

  public saveTemplate() {
    if (!this.domContainer) throw Error(DESTROYED_ERR_MSG);
    if (this.onSaveTemplateCallback) {
      this.onSaveTemplateCallback(this.template);
    }
  }

  public updateTemplate(template: Template, opts?: UpdateTemplateOptions) {
    checkTemplate(template);
    if (!this.domContainer) throw Error(DESTROYED_ERR_MSG);
    this.template = cloneDeep(template);
    const totalPages = this.template.schemas.length;
    const lastValidPage = Math.max(0, totalPages - 1);
    if (opts && typeof opts.page === 'number') {
      // Honour the explicit page request, but keep it in range.
      this.pendingPageCursor = Math.min(Math.max(0, opts.page), lastValidPage);
    } else {
      // Preserve the user's current page across template updates (pdfme#1235).
      // If the new template has fewer pages, clamp to the highest valid page.
      this.pendingPageCursor = Math.min(this.pageCursor, lastValidPage);
    }
    this.pageCursor = this.pendingPageCursor;
    if (this.onChangeTemplateCallback) {
      this.onChangeTemplateCallback(template);
    }
    this.render();
  }

  public onSaveTemplate(cb: (template: Template) => void) {
    this.onSaveTemplateCallback = cb;
  }

  public onChangeTemplate(cb: (template: Template) => void) {
    this.onChangeTemplateCallback = cb;
  }

  public onPageChange(cb: (pageInfo: { currentPage: number; totalPages: number }) => void) {
    this.onPageChangeCallback = cb;
  }

  public onPageOverflowChange(cb: (info: PageOverflowInfo) => void) {
    this.onPageOverflowChangeCallback = cb;
  }

  public getPageCursor() {
    return this.pageCursor;
  }

  public getTotalPages() {
    if (!this.domContainer) throw Error(DESTROYED_ERR_MSG);
    return this.template.schemas.length;
  }

  protected render() {
    if (!this.domContainer) throw Error(DESTROYED_ERR_MSG);
    this.mount(
      <AppContextProvider
        lang={this.getLang()}
        font={this.getFont()}
        plugins={this.getPluginsRegistry()}
        options={this.getOptions()}
      >
        <DesignerComponent
          template={this.template}
          onSaveTemplate={(template) => {
            this.template = template;
            this.template.pdfweaveVersion = PDFME_VERSION;
            if (this.onSaveTemplateCallback) {
              this.onSaveTemplateCallback(template);
            }
          }}
          onChangeTemplate={(template) => {
            this.template = template;
            this.template.pdfweaveVersion = PDFME_VERSION;
            if (this.onChangeTemplateCallback) {
              this.onChangeTemplateCallback(template);
            }
          }}
          onPageCursorChange={(newPageCursor: number, totalPages: number) => {
            this.pageCursor = newPageCursor;
            // Once the inner editor has acknowledged the cursor, drop any
            // pending explicit request so subsequent re-renders don't fight
            // the user's manual navigation.
            this.pendingPageCursor = null;
            if (this.onPageChangeCallback) {
              this.onPageChangeCallback({
                currentPage: newPageCursor,
                totalPages: totalPages,
              });
            }
          }}
          onPageOverflowChange={(info) => {
            if (this.onPageOverflowChangeCallback) {
              this.onPageOverflowChangeCallback(info);
            }
          }}
          requestedPageCursor={this.pendingPageCursor}
          size={this.size}
        />
      </AppContextProvider>,
    );
  }
}

export default Designer;
