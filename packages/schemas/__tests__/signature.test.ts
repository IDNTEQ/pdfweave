// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BLANK_PDF, Schema } from '@pdfweave/common';
import { image, signature } from '../src/index.js';

const { SignaturePadMock } = vi.hoisted(() => {
  class SignaturePadMock {
    static shouldThrowOnLoad = false;

    static lastInstance: SignaturePadMock | null = null;

    private listeners = new Map<string, Set<() => void>>();

    constructor(_canvas: HTMLCanvasElement) {
      SignaturePadMock.lastInstance = this;
    }

    public clear = vi.fn();
    public on = vi.fn();
    public off = vi.fn();
    public toDataURL = vi.fn(() => 'data:image/png;base64,next-signature');

    public fromDataURL = vi.fn(() => {
      if (SignaturePadMock.shouldThrowOnLoad) {
        throw new Error('corrupted signature data');
      }
    });

    public addEventListener(event: string, listener: () => void) {
      const listeners = this.listeners.get(event) ?? new Set();
      listeners.add(listener);
      this.listeners.set(event, listeners);
    }

    public removeEventListener(event: string, listener: () => void) {
      this.listeners.get(event)?.delete(listener);
    }
  }

  return { SignaturePadMock };
});

vi.mock('signature_pad', () => ({
  default: SignaturePadMock,
}));

const schema: Schema = {
  name: 'signature',
  type: 'signature',
  content: '',
  position: { x: 0, y: 0 },
  width: 62.5,
  height: 37.5,
};

describe('signature plugin', () => {
  beforeEach(() => {
    SignaturePadMock.shouldThrowOnLoad = false;
    SignaturePadMock.lastInstance = null;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      scale: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
  });

  it('exports the official signature plugin', () => {
    expect(signature.pdf).toBe(image.pdf);
    expect(signature.propPanel.defaultSchema.type).toBe('signature');
    expect(signature.propPanel.defaultSchema.width).toBe(62.5);
    expect(signature.propPanel.defaultSchema.height).toBe(37.5);
  });

  it('shows a visible warning when saved signature data cannot be restored', async () => {
    SignaturePadMock.shouldThrowOnLoad = true;
    const rootElement = document.createElement('div');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await signature.ui({
      schema,
      basePdf: BLANK_PDF,
      value: 'data:image/png;base64,corrupted',
      rootElement,
      mode: 'viewer',
      options: {},
      theme: {} as never,
      i18n: () => '',
      scale: 1,
      _cache: new Map(),
    });

    expect(rootElement.textContent).toContain('Saved signature could not be loaded.');
    expect(consoleError).toHaveBeenCalled();
  });

  it('clears the warning once the user resets an invalid saved signature', async () => {
    SignaturePadMock.shouldThrowOnLoad = true;
    const rootElement = document.createElement('div');
    const onChange = vi.fn();

    await signature.ui({
      schema,
      basePdf: BLANK_PDF,
      value: 'data:image/png;base64,corrupted',
      rootElement,
      mode: 'form',
      onChange,
      options: {},
      theme: {} as never,
      i18n: (key) =>
        key === 'signature.invalidData'
          ? 'Invalid saved signature data. Clear and sign again.'
          : key === 'signature.clear'
            ? 'Clear'
            : '',
      scale: 1,
      _cache: new Map(),
    });

    expect(rootElement.textContent).toContain('Invalid saved signature data. Clear and sign again.');

    rootElement.querySelector('button')?.click();

    expect(onChange).toHaveBeenCalledWith({ key: 'content', value: '' });
    expect(rootElement.textContent).not.toContain('Invalid saved signature data. Clear and sign again.');
  });
});
