import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Tag, theme, Typography } from 'antd';
import { I18nContext } from '../../../contexts.js';
import { SidebarBody, SidebarFrame, SIDEBAR_H_PADDING_PX, SIDEBAR_V_PADDING_PX } from './layout.js';

type JsonParseError = {
  line: number;
  message: string;
};

type SampleDataEditorProps = {
  sampleData: unknown;
  readOnly?: boolean;
  debounceMs?: number;
  onChange?: (parsed: unknown) => void;
};

const { Text } = Typography;

const monospaceFont =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

const formatSampleData = (sampleData: unknown): string => JSON.stringify(sampleData, null, 2) ?? '';

const lineForPosition = (text: string, position: number): number =>
  text.slice(0, Math.max(0, position)).split(/\r\n|\r|\n/).length;

const parseJsonError = (error: unknown, text: string): JsonParseError => {
  const message = error instanceof Error ? error.message : String(error);
  const lineMatch = message.match(/line\s+(\d+)/i);
  if (lineMatch?.[1]) {
    return { line: Number(lineMatch[1]), message };
  }

  const positionMatch = message.match(/position\s+(\d+)/i);
  if (positionMatch?.[1]) {
    return { line: lineForPosition(text, Number(positionMatch[1])), message };
  }

  return { line: 1, message };
};

const formatLineError = (template: string, error: JsonParseError): string =>
  template.replace('{n}', String(error.line)).replace('{message}', error.message);

const SampleDataEditor = ({
  sampleData,
  readOnly = false,
  debounceMs = 300,
  onChange,
}: SampleDataEditorProps) => {
  const { token } = theme.useToken();
  const i18n = useContext(I18nContext);
  const externalText = useMemo(() => formatSampleData(sampleData), [sampleData]);
  const [text, setText] = useState(externalText);
  const [error, setError] = useState<JsonParseError | null>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const didMountRef = useRef(false);
  const lastExternalTextRef = useRef(externalText);
  const onChangeRef = useRef(onChange);
  const suppressNextValidationRef = useRef(false);

  onChangeRef.current = onChange;

  useEffect(() => {
    if (externalText === lastExternalTextRef.current) {
      return;
    }

    if (text === lastExternalTextRef.current) {
      suppressNextValidationRef.current = true;
      setText(externalText);
      setError(null);
    }
    lastExternalTextRef.current = externalText;
  }, [externalText, text]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (suppressNextValidationRef.current) {
      suppressNextValidationRef.current = false;
      return;
    }
    if (readOnly) {
      return;
    }

    const timer = window.setTimeout(() => {
      try {
        const parsed = JSON.parse(text);
        setError(null);
        onChangeRef.current?.(parsed);
      } catch (parseError) {
        setError(parseJsonError(parseError, text));
      }
    }, Math.max(0, debounceMs));

    return () => window.clearTimeout(timer);
  }, [debounceMs, readOnly, text]);

  const lineNumbers = useMemo(
    () =>
      Array.from({ length: Math.max(1, text.split(/\r\n|\r|\n/).length) }, (_, index) =>
        String(index + 1),
      ).join('\n'),
    [text],
  );
  const statusText = error ? i18n('designer.sampleData.invalid') : i18n('designer.sampleData.valid');
  const statusColor = error ? 'error' : 'success';

  return (
    <SidebarFrame>
      <div
        style={{
          minHeight: 48,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: `${SIDEBAR_V_PADDING_PX}px ${SIDEBAR_H_PADDING_PX}px`,
          borderBottom: `1px solid ${token.colorSplit}`,
        }}
      >
        <Text strong>{i18n('designer.sampleData')}</Text>
        <Tag color={readOnly ? 'default' : statusColor} style={{ marginInlineEnd: 0 }}>
          {readOnly ? i18n('designer.sampleData.readOnly') : statusText}
        </Tag>
      </div>
      <SidebarBody>
        <div
          data-testid="sample-data-editor"
          style={{
            height: '100%',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: '44px minmax(0, 1fr)',
              overflow: 'hidden',
              border: `1px solid ${error ? token.colorErrorBorder : token.colorBorder}`,
              borderRadius: 6,
              background: token.colorBgContainer,
            }}
          >
            <div
              ref={gutterRef}
              aria-hidden="true"
              style={{
                overflow: 'hidden',
                padding: '10px 8px',
                color: token.colorTextTertiary,
                background: token.colorFillQuaternary,
                borderRight: `1px solid ${token.colorSplit}`,
                fontFamily: monospaceFont,
                fontSize: 12,
                lineHeight: '18px',
                textAlign: 'right',
                whiteSpace: 'pre',
                userSelect: 'none',
              }}
            >
              {lineNumbers}
            </div>
            <textarea
              aria-label={i18n('designer.sampleData')}
              readOnly={readOnly}
              value={text}
              spellCheck={false}
              onChange={(event) => setText(event.currentTarget.value)}
              onScroll={(event) => {
                if (gutterRef.current) {
                  gutterRef.current.scrollTop = event.currentTarget.scrollTop;
                }
              }}
              style={{
                width: '100%',
                height: '100%',
                minHeight: 0,
                resize: 'none',
                border: 0,
                outline: 'none',
                padding: 10,
                color: token.colorText,
                background: readOnly ? token.colorFillAlter : token.colorBgContainer,
                fontFamily: monospaceFont,
                fontSize: 12,
                lineHeight: '18px',
                whiteSpace: 'pre',
                overflow: 'auto',
              }}
            />
          </div>
          {error ? (
            <div
              role="status"
              style={{
                width: 'fit-content',
                maxWidth: '100%',
                padding: '4px 8px',
                borderRadius: 999,
                color: token.colorErrorText,
                background: token.colorErrorBg,
                border: `1px solid ${token.colorErrorBorder}`,
                fontSize: 12,
                lineHeight: '16px',
              }}
            >
              {formatLineError(i18n('designer.sampleData.errorLine'), error)}
            </div>
          ) : null}
        </div>
      </SidebarBody>
    </SidebarFrame>
  );
};

export default SampleDataEditor;
