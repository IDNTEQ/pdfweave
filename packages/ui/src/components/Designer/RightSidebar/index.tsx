import React, { useContext, useEffect, useRef, useState } from 'react';
import { theme, Button } from 'antd';
import type { SidebarProps } from '../../../types.js';
import { RIGHT_SIDEBAR_WIDTH, DESIGNER_CLASSNAME } from '../../../constants.js';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { I18nContext, OptionsContext } from '../../../contexts.js';
import NoSelectionSidebar from './NoSelectionSidebar.js';
import DetailView from './DetailView/index.js';
import SampleDataEditor from './SampleDataEditor.js';

type SidebarTab = 'properties' | 'sample-data';

const getInitialTab = (hasSelection: boolean, defaultOpen?: boolean): SidebarTab => {
  if (typeof defaultOpen === 'boolean') {
    return defaultOpen ? 'sample-data' : 'properties';
  }
  return hasSelection ? 'properties' : 'sample-data';
};

const Sidebar = (props: SidebarProps) => {
  const { sidebarOpen, setSidebarOpen, activeElements, schemas } = props;

  const { token } = theme.useToken();
  const options = useContext(OptionsContext);
  const i18n = useContext(I18nContext);
  const sampleDataPanel = options.sampleDataPanel;
  const sampleDataPanelEnabled = sampleDataPanel?.enabled === true;
  const getActiveSchemas = () => {
    const activeIds = new Set(activeElements.map((ae) => ae.id));
    const selectedSchemas = schemas.filter((schema) => activeIds.has(schema.id));
    const activeGroups = new Set(
      selectedSchemas
        .map((schema) => schema.group)
        .filter((group): group is string => Boolean(group)),
    );

    if (activeGroups.size === 0) return selectedSchemas;

    return schemas.filter(
      (schema) => activeIds.has(schema.id) || Boolean(schema.group && activeGroups.has(schema.group)),
    );
  };
  const activeSchemas = getActiveSchemas();
  const getLastActiveSchema = () => activeSchemas[activeSchemas.length - 1];
  const hasSelection = activeSchemas.length > 0;
  const [activeTab, setActiveTab] = useState<SidebarTab>(() =>
    getInitialTab(hasSelection, sampleDataPanel?.defaultOpen),
  );
  const sampleDataOpenedAutomaticallyRef = useRef(activeTab === 'sample-data' && !hasSelection);

  useEffect(() => {
    if (!sampleDataPanelEnabled) {
      return;
    }

    if (!hasSelection) {
      if (sampleDataPanel?.defaultOpen === false) {
        return;
      }
      setActiveTab((current) => {
        if (current !== 'sample-data') {
          sampleDataOpenedAutomaticallyRef.current = true;
        }
        return 'sample-data';
      });
      return;
    }

    if (sampleDataOpenedAutomaticallyRef.current) {
      sampleDataOpenedAutomaticallyRef.current = false;
      setActiveTab('properties');
    }
  }, [hasSelection, sampleDataPanel?.defaultOpen, sampleDataPanelEnabled]);

  const iconProps = { strokeWidth: 1.5, size: 20 };
  const renderProperties = () =>
    activeSchemas.length === 0 ? (
      <NoSelectionSidebar {...props} />
    ) : (
      <DetailView {...props} activeSchema={getLastActiveSchema()} activeSchemas={activeSchemas} />
    );
  const sampleData = (props.template as typeof props.template & { sampleData?: unknown }).sampleData;
  const tabs: { key: SidebarTab; label: string }[] = [
    { key: 'properties', label: i18n('designer.properties') },
    { key: 'sample-data', label: i18n('designer.sampleData') },
  ];
  const renderTabbedSidebar = () => (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        role="tablist"
        aria-label="Designer sidebar"
        style={{
          display: 'flex',
          flexShrink: 0,
          gap: 6,
          padding: '12px 56px 8px 12px',
          borderBottom: `1px solid ${token.colorSplit}`,
          background: token.colorBgLayout,
        }}
      >
        {tabs.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                sampleDataOpenedAutomaticallyRef.current = false;
                setActiveTab(tab.key);
              }}
              style={{
                flex: 1,
                minWidth: 0,
                height: 32,
                border: `1px solid ${selected ? token.colorPrimary : token.colorBorder}`,
                borderRadius: 6,
                background: selected ? token.colorPrimaryBg : token.colorBgContainer,
                color: selected ? token.colorPrimaryText : token.colorTextSecondary,
                fontSize: 12,
                fontWeight: selected ? 600 : 500,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {activeTab === 'sample-data' ? (
          <SampleDataEditor
            sampleData={sampleData}
            readOnly={sampleDataPanel?.readOnly}
            debounceMs={sampleDataPanel?.debounceMs}
            onChange={sampleDataPanel?.onChange}
          />
        ) : (
          renderProperties()
        )}
      </div>
    </div>
  );

  return (
    <div
      className={DESIGNER_CLASSNAME + 'right-sidebar'}
      style={{
        position: 'absolute',
        right: 0,
        zIndex: 1,
        height: '100%',
        width: sidebarOpen ? RIGHT_SIDEBAR_WIDTH : 0,
      }}
    >
      <Button
        className={DESIGNER_CLASSNAME + 'sidebar-toggle'}
        style={{
          position: 'absolute',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          top: '14px',
          right: '16px',
          paddingTop: '2px',
          zIndex: 100,
        }}
        icon={sidebarOpen ? <ArrowRight {...iconProps} /> : <ArrowLeft {...iconProps} />}
        onClick={() => setSidebarOpen(!sidebarOpen)}
      />
      <div
        style={{
          width: RIGHT_SIDEBAR_WIDTH,
          height: '100%',
          display: sidebarOpen ? 'flex' : 'none',
          top: 0,
          right: 0,
          position: 'absolute',
          fontFamily: "'Open Sans', sans-serif",
          boxSizing: 'border-box',
          background: token.colorBgLayout,
          borderLeft: `1px solid ${token.colorSplit}`,
        }}
      >
        {sampleDataPanelEnabled ? renderTabbedSidebar() : renderProperties()}
      </div>
    </div>
  );
};

export default Sidebar;
