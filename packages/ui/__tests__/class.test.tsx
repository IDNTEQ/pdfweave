import React from 'react';
import { act, waitFor } from '@testing-library/react';
import { BLANK_PDF, type Template, type UIProps } from '@pdfweave/common';
import { BaseUIClass } from '../src/class';

class TestUI extends BaseUIClass {
  public show() {
    this.render();
  }

  protected render() {
    this.mount(<div data-testid="base-ui-mounted">ready</div>);
  }
}

const template: Template = {
  basePdf: BLANK_PDF,
  schemas: [[]],
};

test('BaseUIClass mount renders without forcing a synchronous flush', async () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  class ResizeObserverMock {
    constructor(_callback: ResizeObserverCallback) {}

    public observe() {}
    public unobserve() {}
    public disconnect() {}
  }

  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

  const domContainer = document.createElement('div');
  Object.defineProperty(domContainer, 'clientHeight', { configurable: true, value: 240 });
  Object.defineProperty(domContainer, 'clientWidth', { configurable: true, value: 320 });
  document.body.appendChild(domContainer);

  try {
    const ui = new TestUI({ domContainer, template } as UIProps);

    act(() => {
      ui.show();
    });

    await waitFor(() => {
      expect(domContainer.querySelector('[data-testid="base-ui-mounted"]')).toBeInTheDocument();
    });

    ui.destroy();
  } finally {
    domContainer.remove();
    globalThis.ResizeObserver = originalResizeObserver;
  }
});
