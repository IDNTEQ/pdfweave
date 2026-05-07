import React from 'react';
import { render, waitFor } from '@testing-library/react';
import {
  BLANK_PDF,
  pluginRegistry,
  type Plugin,
  type Schema,
  type SchemaForUI,
} from '@pdfweave/common';
import Renderer, { safeStringifyForRenderKey } from '../../src/components/Renderer';
import { PluginsRegistry } from '../../src/contexts';

describe('safeStringifyForRenderKey', () => {
  it('handles bigint values in nested objects without throwing', () => {
    const obj = { id: 1n, nested: { count: 9007199254740993n } };
    expect(() => safeStringifyForRenderKey(obj)).not.toThrow();
    const out = safeStringifyForRenderKey(obj);
    expect(out).toContain('[BigInt:1n]');
    expect(out).toContain('[BigInt:9007199254740993n]');
  });

  it('handles a top-level bigint', () => {
    expect(safeStringifyForRenderKey(42n)).toBe('"[BigInt:42n]"');
  });

  it('distinguishes an undefined property from a missing property', () => {
    const a = { foo: undefined };
    const b = {};
    const aOut = safeStringifyForRenderKey(a);
    const bOut = safeStringifyForRenderKey(b);
    expect(aOut).not.toEqual(bOut);
    expect(aOut).toContain('[undefined]');
  });

  it('preserves undefined in arrays as a stable token', () => {
    const out = safeStringifyForRenderKey([undefined, 1, undefined]);
    // Default JSON.stringify maps undefined elements to null; our replacer makes them
    // explicit so structurally distinct arrays produce distinct keys.
    expect(out).toContain('[undefined]');
  });

  it('handles symbol values with their description', () => {
    const out = safeStringifyForRenderKey({ s: Symbol('mySym') });
    expect(out).toContain('[Symbol:mySym]');
  });

  it('handles symbols with no description', () => {
    const out = safeStringifyForRenderKey({ s: Symbol() });
    expect(out).toContain('[Symbol:]');
  });

  it('handles function values', () => {
    const out = safeStringifyForRenderKey({ fn: function namedFn() {} });
    expect(out).toContain('[Function namedFn]');
  });

  it('handles Window-like objects without recursing', () => {
    // Build a window-like cycle: an object whose .window points to itself.
    const fakeWindow: { window?: unknown; foo: string } = { foo: 'bar' };
    fakeWindow.window = fakeWindow;
    const out = safeStringifyForRenderKey({ w: fakeWindow });
    expect(out).toContain('[Window]');
    expect(out).not.toContain('"foo"');
  });

  it('handles circular references without throwing', () => {
    const a: { self?: unknown; n: number } = { n: 1 };
    a.self = a;
    expect(() => safeStringifyForRenderKey(a)).not.toThrow();
    expect(safeStringifyForRenderKey(a)).toContain('[Circular]');
  });

  it('serialises Date values via the default toJSON ISO string path', () => {
    const date = new Date('2026-05-07T00:00:00.000Z');
    const out = safeStringifyForRenderKey({ at: date });
    // Date.prototype.toJSON converts to ISO string before reaching the replacer.
    expect(out).toContain('2026-05-07T00:00:00.000Z');
  });
});

describe('Renderer plugin error isolation', () => {
  const baseSchema: SchemaForUI = {
    id: 'err-schema',
    name: 'err',
    type: 'errPlugin',
    position: { x: 0, y: 0 },
    width: 100,
    height: 20,
  } as SchemaForUI;

  it('renders an error placeholder when plugin.ui() throws and logs schema id', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const throwingPlugin: Plugin<Schema> = {
      ui: () => {
        throw new Error('boom-from-ui');
      },
      pdf: () => undefined,
      propPanel: {
        schema: {},
        defaultSchema: {
          name: 'err',
          type: 'errPlugin',
          position: { x: 0, y: 0 },
          width: 100,
          height: 20,
        },
      },
    };

    const { container } = render(
      <PluginsRegistry.Provider value={pluginRegistry({ errPlugin: throwingPlugin })}>
        <Renderer
          basePdf={BLANK_PDF}
          schema={baseSchema}
          value="x"
          outline=""
          mode="viewer"
          scale={1}
        />
      </PluginsRegistry.Provider>,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-pdfme-plugin-error="true"]')).toBeInTheDocument();
    });

    expect(container.querySelector('[data-pdfme-render-ready="true"]')).toBeInTheDocument();

    const logged = consoleErr.mock.calls.flat().join(' ');
    expect(logged).toContain('err-schema');
    expect(logged).toContain('errPlugin');
  });

  it('falls back gracefully when plugin.measure() throws — ui() output kept, no unhandled rejection', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    const measureThrowPlugin: Plugin<Schema> = {
      ui: ({ rootElement, value }) => {
        rootElement.textContent = `ui-ok:${value}`;
      },
      measure: () => {
        throw new Error('boom-from-measure');
      },
      pdf: () => undefined,
      propPanel: {
        schema: {},
        defaultSchema: {
          name: 'err',
          type: 'errPlugin',
          position: { x: 0, y: 0 },
          width: 100,
          height: 20,
        },
      },
    };

    try {
      const { container } = render(
        <PluginsRegistry.Provider value={pluginRegistry({ errPlugin: measureThrowPlugin })}>
          <Renderer
            basePdf={BLANK_PDF}
            schema={baseSchema}
            value="hello"
            outline=""
            mode="viewer"
            scale={1}
          />
        </PluginsRegistry.Provider>,
      );

      await waitFor(() => {
        expect(container.querySelector('[data-pdfme-render-ready="true"]')).toBeInTheDocument();
      });

      // ui() output should still be present — measure error must NOT replace it.
      expect(container.textContent).toContain('ui-ok:hello');
      // No error placeholder for measure() failures (ui() succeeded).
      expect(container.querySelector('[data-pdfme-plugin-error="true"]')).not.toBeInTheDocument();

      const logged = consoleErr.mock.calls.flat().join(' ');
      expect(logged).toContain('measure()');
      expect(logged).toContain('err-schema');

      // Give the microtask queue a tick to surface any unhandled rejection.
      await new Promise((r) => setTimeout(r, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
