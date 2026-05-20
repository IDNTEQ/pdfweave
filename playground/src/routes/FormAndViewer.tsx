import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Template, checkTemplate, getInputFromTemplate, Lang } from '@pdfweave/common';
import { Form, Viewer } from '@pdfweave/ui';
import {
  getFontsData,
  getTemplateById,
  getInputsById,
  getBlankTemplate,
  handleLoadTemplate,
  generatePDF,
  isJsonString,
  readFile,
  translations,
  DEFAULT_TEMPLATE_ID,
} from '../helper';
import { getPlugins } from '../plugins';
import { NavItem, NavBar } from '../components/NavBar';
import ExternalButton from '../components/ExternalButton';

type Mode = 'form' | 'viewer';

function FormAndViewerApp() {
  const [searchParams, setSearchParams] = useSearchParams();
  const uiRef = useRef<HTMLDivElement | null>(null);
  const ui = useRef<Form | Viewer | null>(null);

  const [mode, setMode] = useState<Mode>((localStorage.getItem('mode') as Mode) ?? 'form');

  const buildUi = useCallback(
    async (mode: Mode) => {
      if (!uiRef.current) return;
      try {
        let template: Template = getBlankTemplate();
        // Tracks which template id (if any) the current `template` came from
        // — used to look up the optional `inputs.json` companion.
        let templateIdInUse: string | null = null;
        const templateIdFromQuery = searchParams.get('template');
        searchParams.delete('template');
        setSearchParams(searchParams, { replace: true });
        const templateFromLocal = localStorage.getItem('template');

        if (templateIdFromQuery) {
          const templateJson = await getTemplateById(templateIdFromQuery);
          checkTemplate(templateJson);
          template = templateJson;
          templateIdInUse = templateIdFromQuery;

          if (!templateFromLocal) {
            localStorage.setItem('template', JSON.stringify(templateJson));
          }
        } else if (templateFromLocal) {
          const templateJson = JSON.parse(templateFromLocal) as Template;
          checkTemplate(templateJson);
          template = templateJson;
        } else {
          // First-visit fallback: same populated invoice that the Designer loads,
          // so the Form/Viewer page isn't a blank canvas on first arrival.
          try {
            const templateJson = await getTemplateById(DEFAULT_TEMPLATE_ID);
            checkTemplate(templateJson);
            template = templateJson;
            templateIdInUse = DEFAULT_TEMPLATE_ID;
            localStorage.setItem('template', JSON.stringify(templateJson));
          } catch (_) {
            // keep blank template fallback
          }
        }

        // Resolution order for inputs:
        //   1. user's saved inputs in localStorage (highest precedence)
        //   2. the template's companion inputs.json, if any
        //   3. getInputFromTemplate(template) — derived from schema.content
        let inputs = getInputFromTemplate(template);
        if (templateIdInUse) {
          const sampleInputs = await getInputsById(templateIdInUse);
          if (sampleInputs) inputs = sampleInputs;
        }
        const inputsString = localStorage.getItem('inputs');
        if (inputsString) {
          const inputsJson = JSON.parse(inputsString);
          inputs = inputsJson;
        }

        ui.current = new (mode === 'form' ? Form : Viewer)({
          domContainer: uiRef.current,
          template,
          inputs,
          options: {
            font: getFontsData(),
            lang: 'en',
            labels: { 'signature.clear': 'Clear' },
            theme: {
              token: {
                colorPrimary: '#25c2a0',
              },
            },
          },
          plugins: getPlugins(),
        });
      } catch {
        localStorage.removeItem('inputs');
        localStorage.removeItem('template');
      }
    },
    [searchParams, setSearchParams],
  );

  const onChangeMode = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value as Mode;
    setMode(value);
    localStorage.setItem('mode', value);
    void buildUi(value);
  };

  const onGetInputs = () => {
    if (ui.current) {
      const inputs = ui.current.getInputs();
      toast.info('Dumped as console.log');
      console.log(inputs);
    }
  };

  const onSetInputs = () => {
    if (ui.current) {
      const prompt = window.prompt('Enter Inputs JSON string') || '';
      try {
        const json = isJsonString(prompt) ? JSON.parse(prompt) : [{}];
        ui.current.setInputs(json);
      } catch (e) {
        alert(e);
      }
    }
  };

  const onLoadInputsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ui.current) return;
    void readFile(file, 'text').then((jsonStr) => {
      try {
        const parsed = JSON.parse(jsonStr as string);
        const inputs = Array.isArray(parsed) ? parsed : [parsed];
        ui.current?.setInputs(inputs);
        toast.success(`Loaded inputs from ${file.name}`);
      } catch (err) {
        toast.error(`Invalid JSON in ${file.name}`);
        console.error(err);
      }
      // Clear the input so the same file can be re-uploaded later
      e.target.value = '';
    });
  };

  const onSaveInputs = () => {
    if (ui.current) {
      const inputs = ui.current.getInputs();
      localStorage.setItem('inputs', JSON.stringify(inputs));
      toast.success('Saved on local storage');
    }
  };

  const onResetInputs = () => {
    localStorage.removeItem('inputs');
    if (ui.current) {
      const template = ui.current.getTemplate();
      ui.current.setInputs(getInputFromTemplate(template));
    }
  };

  useEffect(() => {
    void buildUi(mode);
    return () => {
      if (ui.current) {
        ui.current.destroy();
      }
    };
  }, [mode, uiRef, buildUi]);

  const navItems: NavItem[] = [
    {
      label: 'Lang',
      content: (
        <select
          className="w-full border rounded px-2 py-1 border-gray-300"
          onChange={(e) => {
            ui.current?.updateOptions({ lang: e.target.value as Lang });
          }}
        >
          {translations.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      ),
    },
    {
      label: 'Mode',
      content: (
        <div className="mt-2">
          <input
            type="radio"
            id="form"
            value="form"
            checked={mode === 'form'}
            onChange={onChangeMode}
          />
          <label htmlFor="form" className="mr-2">
            {' '}
            Form{' '}
          </label>
          <input
            type="radio"
            id="viewer"
            value="viewer"
            checked={mode === 'viewer'}
            onChange={onChangeMode}
          />
          <label htmlFor="viewer"> Viewer </label>
        </div>
      ),
    },
    {
      label: 'Load Template',
      content: (
        <input
          type="file"
          accept="application/json"
          onChange={(e) => handleLoadTemplate(e, ui.current)}
          className="w-full text-sm border rounded border-gray-300"
        />
      ),
    },
    {
      label: 'Load Inputs',
      content: (
        <input
          type="file"
          accept="application/json"
          onChange={onLoadInputsFile}
          className="w-full text-sm border rounded border-gray-300"
        />
      ),
    },
    {
      label: '',
      content: (
        <div className="flex gap-2">
          <button
            className="px-2 py-1 border rounded hover:bg-gray-100 border-gray-300"
            onClick={onGetInputs}
          >
            Get Inputs
          </button>
          <button
            className="px-2 py-1 border rounded hover:bg-gray-100 border-gray-300"
            onClick={onSetInputs}
            title="Paste JSON string"
          >
            Paste Inputs
          </button>
        </div>
      ),
    },
    {
      label: '',
      content: (
        <div className="flex gap-2">
          <button
            className="px-2 py-1 border rounded hover:bg-gray-100 border-gray-300"
            onClick={onSaveInputs}
          >
            Save Inputs
          </button>
          <button
            className="px-2 py-1 border rounded hover:bg-gray-100 border-gray-300"
            onClick={onResetInputs}
          >
            Reset Inputs
          </button>
        </div>
      ),
    },
    {
      label: '',
      content: (
        <button
          id="generate-pdf"
          className="px-2 py-1 border rounded hover:bg-gray-100 border-gray-300"
          onClick={(e) => {
            const output = e.altKey ? 'form' : 'pdf';
            const startTimer = performance.now();
            void generatePDF(ui.current, output).then(() => {
              const endTimer = performance.now();
              toast.info(
                `Generated ${output === 'form' ? 'Form' : 'PDF'} in ${Math.round(
                  endTimer - startTimer,
                )}ms ⚡️`,
              );
            });
          }}
        >
          Generate PDF
        </button>
      ),
    },
    {
      label: '',
      content: React.createElement(ExternalButton, {
        href: 'https://github.com/IDNTEQ/pdfweave/issues/new?template=template_feedback.yml&title=TEMPLATE_NAME',
        title: 'Feedback this template',
      }),
    },
  ];

  return (
    <>
      <NavBar items={navItems} />
      <div ref={uiRef} className="flex-1 w-full" />
    </>
  );
}

export default FormAndViewerApp;
