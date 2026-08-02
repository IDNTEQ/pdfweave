import React from 'react';
import { render, act, fireEvent, waitFor, screen } from '@testing-library/react';
import Designer from '../../src/components/Designer/index.js';
import { I18nContext, FontContext, OptionsContext, PluginsRegistry } from '../../src/contexts';
import { i18n } from '../../src/i18n';
import { DESIGNER_CLASSNAME, RIGHT_SIDEBAR_WIDTH, SELECTABLE_CLASSNAME } from '../../src/constants';
import { getDefaultFont, pluginRegistry } from '@pdfweave/common';
import { normalizeElementIdsForSnapshot } from '../assets/normalizeSnapshot';
import { setupUIMock, getSampleTemplate } from '../assets/helper';
import { text, image } from '@pdfweave/schemas';

const plugins = { text, image };

test('Designer snapshot', async () => {
  setupUIMock();
  let container: HTMLElement = document.createElement('a');
  act(() => {
    const { container: c } = render(
      <I18nContext.Provider value={i18n}>
        <FontContext.Provider value={getDefaultFont()}>
          <PluginsRegistry.Provider value={pluginRegistry(plugins)}>
            <Designer
              template={getSampleTemplate()}
              onSaveTemplate={console.log}
              onChangeTemplate={console.log}
              size={{ width: 1200, height: 1200 }}
              onPageCursorChange={(pageCursor, totalPages) => {
                console.log(pageCursor, totalPages);
              }}
            />
          </PluginsRegistry.Provider>
        </FontContext.Provider>
      </I18nContext.Provider>
    );
    container = c;
  });

  await waitFor(() => {
    expect(container.getElementsByClassName(SELECTABLE_CLASSNAME).length).toBeGreaterThan(0);
  });
  expect(normalizeElementIdsForSnapshot(container)).toMatchSnapshot();
});

test('Designer keeps toolbar zoom interactive when options.zoomLevel is only an initial value', async () => {
  setupUIMock();
  const { container } = render(
    <I18nContext.Provider value={i18n}>
      <FontContext.Provider value={getDefaultFont()}>
        <PluginsRegistry.Provider value={pluginRegistry(plugins)}>
          <OptionsContext.Provider value={{ zoomLevel: 1 }}>
            <Designer
              template={getSampleTemplate()}
              onSaveTemplate={console.log}
              onChangeTemplate={console.log}
              size={{ width: 1200, height: 1200 }}
              onPageCursorChange={() => undefined}
            />
          </OptionsContext.Provider>
        </PluginsRegistry.Provider>
      </FontContext.Provider>
    </I18nContext.Provider>,
  );

  await waitFor(() => {
    expect(container.getElementsByClassName(SELECTABLE_CLASSNAME).length).toBeGreaterThan(0);
  });

  expect(container).toHaveTextContent('100%');
  fireEvent.click(container.querySelector('.pdfweave-ui-zoom-in')!);

  await waitFor(() => {
    expect(container).toHaveTextContent('125%');
  });
});

test('Designer keeps sidebar toggle interactive when options.sidebarOpen is only an initial value', async () => {
  setupUIMock();
  const { container } = render(
    <I18nContext.Provider value={i18n}>
      <FontContext.Provider value={getDefaultFont()}>
        <PluginsRegistry.Provider value={pluginRegistry(plugins)}>
          <OptionsContext.Provider value={{ sidebarOpen: true }}>
            <Designer
              template={getSampleTemplate()}
              onSaveTemplate={console.log}
              onChangeTemplate={console.log}
              size={{ width: 1200, height: 1200 }}
              onPageCursorChange={() => undefined}
            />
          </OptionsContext.Provider>
        </PluginsRegistry.Provider>
      </FontContext.Provider>
    </I18nContext.Provider>,
  );

  const sidebar = container.querySelector(`.${DESIGNER_CLASSNAME}right-sidebar`) as HTMLDivElement;
  await waitFor(() => {
    expect(sidebar).toBeInTheDocument();
    expect(sidebar.style.width).toBe(`${RIGHT_SIDEBAR_WIDTH}px`);
  });

  fireEvent.click(container.querySelector(`.${DESIGNER_CLASSNAME}sidebar-toggle`)!);

  await waitFor(() => {
    expect(sidebar.style.width).toBe('0px');
  });
});

test('Designer opens a schema context menu and duplicates through the shared handler', async () => {
  setupUIMock();
  const onChangeTemplate = vi.fn();
  const { container } = render(
    <I18nContext.Provider value={i18n}>
      <FontContext.Provider value={getDefaultFont()}>
        <PluginsRegistry.Provider value={pluginRegistry(plugins)}>
          <Designer
            template={getSampleTemplate()}
            onSaveTemplate={console.log}
            onChangeTemplate={onChangeTemplate}
            size={{ width: 1200, height: 1200 }}
            onPageCursorChange={() => undefined}
          />
        </PluginsRegistry.Provider>
      </FontContext.Provider>
    </I18nContext.Provider>,
  );

  await waitFor(() => {
    expect(container.getElementsByClassName(SELECTABLE_CLASSNAME).length).toBeGreaterThan(0);
  });

  fireEvent.contextMenu(container.getElementsByClassName(SELECTABLE_CLASSNAME)[0], {
    clientX: 120,
    clientY: 140,
  });

  expect(screen.getByRole('menu', { name: 'Schema context menu' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));

  await waitFor(() => {
    expect(onChangeTemplate).toHaveBeenCalled();
  });
  const nextTemplate = onChangeTemplate.mock.calls.at(-1)?.[0];
  expect(nextTemplate.schemas[0]).toHaveLength(3);
});

test('Designer groups and ungroups selected schemas from the context menu', async () => {
  setupUIMock();
  const onChangeTemplate = vi.fn();
  const { container } = render(
    <I18nContext.Provider value={i18n}>
      <FontContext.Provider value={getDefaultFont()}>
        <PluginsRegistry.Provider value={pluginRegistry(plugins)}>
          <Designer
            template={getSampleTemplate()}
            onSaveTemplate={console.log}
            onChangeTemplate={onChangeTemplate}
            size={{ width: 1200, height: 1200 }}
            onPageCursorChange={() => undefined}
          />
        </PluginsRegistry.Provider>
      </FontContext.Provider>
    </I18nContext.Provider>,
  );

  await waitFor(() => {
    expect(container.getElementsByClassName(SELECTABLE_CLASSNAME).length).toBeGreaterThan(1);
  });

  fireEvent.keyDown(document, { key: 'a', code: 'KeyA', ctrlKey: true });
  fireEvent.contextMenu(container.getElementsByClassName(SELECTABLE_CLASSNAME)[0], {
    clientX: 120,
    clientY: 140,
  });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Group' }));

  await waitFor(() => {
    const nextTemplate = onChangeTemplate.mock.calls.at(-1)?.[0];
    expect(nextTemplate.schemas[0].every((schema: { group?: string }) => Boolean(schema.group))).toBe(true);
  });

  const groupedTemplate = onChangeTemplate.mock.calls.at(-1)?.[0];
  const groupIds = new Set(groupedTemplate.schemas[0].map((schema: { group?: string }) => schema.group));
  expect(groupIds.size).toBe(1);

  fireEvent.contextMenu(container.getElementsByClassName(SELECTABLE_CLASSNAME)[0], {
    clientX: 120,
    clientY: 140,
  });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Ungroup' }));

  await waitFor(() => {
    const nextTemplate = onChangeTemplate.mock.calls.at(-1)?.[0];
    expect(nextTemplate.schemas[0].every((schema: { group?: string }) => !schema.group)).toBe(true);
  });
});
