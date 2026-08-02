import React from 'react';
import { render, act, fireEvent, waitFor } from '@testing-library/react';
import Preview from '../../src/components/Preview';
import { I18nContext, FontContext, OptionsContext, PluginsRegistry } from '../../src/contexts';
import { i18n } from '../../src/i18n';
import { SELECTABLE_CLASSNAME } from '../../src/constants';
import { getDefaultFont, pluginRegistry } from '@pdfweave/common';
import { normalizeElementIdsForSnapshot } from '../assets/normalizeSnapshot';
import { setupUIMock, getSampleTemplate } from '../assets/helper';
import { text, image } from '@pdfweave/schemas';

const plugins = pluginRegistry({ text, image });

test('Preview(as Viewer) snapshot', async () => {
  setupUIMock();
  let container: HTMLElement = document.createElement('a');
  act(() => {
    const { container: c } = render(
      <I18nContext.Provider value={i18n}>
        <FontContext.Provider value={getDefaultFont()}>
          <PluginsRegistry.Provider value={plugins}>
            <Preview
              template={getSampleTemplate()}
              inputs={[{ field1: 'field1', field2: 'field2' }]}
              size={{ width: 1200, height: 1200 }}
            />
          </PluginsRegistry.Provider>
        </FontContext.Provider>
      </I18nContext.Provider>,
    );
    container = c;
  });

  await waitFor(() => {
    const selectableElements = container.getElementsByClassName(SELECTABLE_CLASSNAME);
    const renderedElements = container.querySelectorAll('[data-pdfweave-render-ready="true"]');
    expect(selectableElements.length).toBeGreaterThan(0);
    expect(renderedElements.length).toBe(selectableElements.length);
  });
  expect(normalizeElementIdsForSnapshot(container)).toMatchSnapshot();
});

test('Preview(as Form) snapshot', async () => {
  setupUIMock();
  let container: HTMLElement = document.createElement('a');
  act(() => {
    const { container: c } = render(
      <I18nContext.Provider value={i18n}>
        <FontContext.Provider value={getDefaultFont()}>
          <PluginsRegistry.Provider value={plugins}>
            <Preview
              template={getSampleTemplate()}
              inputs={[{ field1: 'field1', field2: 'field2' }]}
              size={{ width: 1200, height: 1200 }}
              onChangeInput={console.log}
            />
          </PluginsRegistry.Provider>
        </FontContext.Provider>
      </I18nContext.Provider>,
    );
    container = c;
  });

  await waitFor(() => {
    const selectableElements = container.getElementsByClassName(SELECTABLE_CLASSNAME);
    const renderedElements = container.querySelectorAll('[data-pdfweave-render-ready="true"]');
    expect(selectableElements.length).toBeGreaterThan(0);
    expect(renderedElements.length).toBe(selectableElements.length);
  });
  expect(normalizeElementIdsForSnapshot(container)).toMatchSnapshot();
});

test('Preview binds editable schema values from the current input', async () => {
  setupUIMock();
  const template = getSampleTemplate();
  template.schemas[0] = [template.schemas[0][0]];
  const { container } = render(
    <I18nContext.Provider value={i18n}>
      <FontContext.Provider value={getDefaultFont()}>
        <PluginsRegistry.Provider value={plugins}>
          <Preview
            template={template}
            inputs={[{ field1: 'Bound customer value' }]}
            size={{ width: 1200, height: 1200 }}
            onChangeInput={console.log}
          />
        </PluginsRegistry.Provider>
      </FontContext.Provider>
    </I18nContext.Provider>,
  );

  await waitFor(() => {
    const editor = container.querySelector('[title="field1"] [tabindex="100"]') as HTMLElement;
    expect(editor?.innerText).toBe('Bound customer value');
  });
});

test('Preview keeps read-only schema content constant in form mode', async () => {
  setupUIMock();
  const template = getSampleTemplate();
  const schema = template.schemas[0][0];
  schema.content = 'Constant account label';
  schema.readOnly = true;
  template.schemas[0] = [schema];

  const { container } = render(
    <I18nContext.Provider value={i18n}>
      <FontContext.Provider value={getDefaultFont()}>
        <PluginsRegistry.Provider value={plugins}>
          <Preview
            template={template}
            inputs={[{ field1: 'Attempted override' }]}
            size={{ width: 1200, height: 1200 }}
            onChangeInput={vi.fn<() => void>()}
          />
        </PluginsRegistry.Provider>
      </FontContext.Provider>
    </I18nContext.Provider>,
  );

  await waitFor(() => {
    const wrapper = container.querySelector('[title="field1"]') as HTMLElement;
    expect(wrapper).toHaveTextContent('Constant account label');
    expect(wrapper).not.toHaveTextContent('Attempted override');
    expect(wrapper.style.cursor).toBe('initial');
    expect(wrapper.querySelector('[tabindex="100"]')).toBeNull();
  });
});

test('Preview hides required-field markers in viewer mode', async () => {
  setupUIMock();
  const template = getSampleTemplate();
  const schema = template.schemas[0][0];
  schema.required = true;
  template.schemas[0] = [schema];

  const { container } = render(
    <I18nContext.Provider value={i18n}>
      <FontContext.Provider value={getDefaultFont()}>
        <PluginsRegistry.Provider value={plugins}>
          <Preview
            template={template}
            inputs={[{ field1: 'Viewer value' }]}
            size={{ width: 1200, height: 1200 }}
          />
        </PluginsRegistry.Provider>
      </FontContext.Provider>
    </I18nContext.Provider>,
  );

  await waitFor(() => {
    expect(container.querySelector('[data-pdfweave-render-ready="true"]')).not.toBeNull();
  });
  expect(container.querySelector('[data-pdfweave-required-marker="true"]')).toBeNull();
});

test('Preview keeps toolbar zoom interactive when options.zoomLevel is only an initial value', async () => {
  setupUIMock();
  const { container } = render(
    <I18nContext.Provider value={i18n}>
      <FontContext.Provider value={getDefaultFont()}>
        <PluginsRegistry.Provider value={plugins}>
          <OptionsContext.Provider value={{ zoomLevel: 1 }}>
            <Preview
              template={getSampleTemplate()}
              inputs={[{ field1: 'field1', field2: 'field2' }]}
              size={{ width: 1200, height: 1200 }}
            />
          </OptionsContext.Provider>
        </PluginsRegistry.Provider>
      </FontContext.Provider>
    </I18nContext.Provider>,
  );

  await waitFor(() => {
    expect(
      container.querySelectorAll('[data-pdfweave-render-ready="true"]').length,
    ).toBeGreaterThan(0);
  });

  expect(container).toHaveTextContent('100%');
  fireEvent.click(container.querySelector('.pdfweave-ui-zoom-in')!);

  await waitFor(() => {
    expect(container).toHaveTextContent('125%');
  });
});
