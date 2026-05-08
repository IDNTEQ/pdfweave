import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { BLANK_PDF, pluginRegistry, type Plugin, type Schema, type SchemaForUI } from '@pdfweave/common';
import Renderer from '../../src/components/Renderer';
import { PluginsRegistry } from '../../src/contexts';

const schema = {
  id: 'cleanup-schema',
  name: 'cleanup',
  type: 'cleanupTest',
  position: { x: 0, y: 0 },
  width: 100,
  height: 20,
} as SchemaForUI;

test('Renderer dispatches beforeRemove before rerender and unmount cleanup', async () => {
  const beforeRemove = vi.fn();
  const cleanupPlugin: Plugin<Schema> = {
    ui: ({ rootElement, value }) => {
      rootElement.textContent = value;
      rootElement.addEventListener('beforeRemove', () => beforeRemove(value), { once: true });
    },
    pdf: () => undefined,
    propPanel: {
      schema: {},
      defaultSchema: {
        name: 'cleanup',
        type: 'cleanupTest',
        position: { x: 0, y: 0 },
        width: 100,
        height: 20,
      },
    },
  };

  const { container, rerender, unmount } = render(
    <PluginsRegistry.Provider value={pluginRegistry({ cleanupTest: cleanupPlugin })}>
      <Renderer basePdf={BLANK_PDF} schema={schema} value="first" outline="" mode="viewer" scale={1} />
    </PluginsRegistry.Provider>,
  );

  await waitFor(() => {
    expect(container.querySelector('[data-pdfweave-render-ready="true"]')).toBeInTheDocument();
  });

  rerender(
    <PluginsRegistry.Provider value={pluginRegistry({ cleanupTest: cleanupPlugin })}>
      <Renderer
        basePdf={BLANK_PDF}
        schema={schema}
        value="second"
        outline=""
        mode="viewer"
        scale={1}
      />
    </PluginsRegistry.Provider>,
  );

  await waitFor(() => {
    expect(beforeRemove).toHaveBeenCalledWith('first');
  });

  unmount();

  expect(beforeRemove).toHaveBeenCalledWith('second');
});
