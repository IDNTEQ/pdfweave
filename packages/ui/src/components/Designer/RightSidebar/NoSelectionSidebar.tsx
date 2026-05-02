import React, { useContext, useEffect, useRef, useState } from 'react';
import { Segmented, Typography } from 'antd';
import type { SidebarProps } from '../../../types.js';
import { OptionsContext } from '../../../contexts.js';
import ListView from './ListView/index.js';
import TemplateDataPanel from './TemplateDataPanel.js';

const { Text } = Typography;

const HeaderTabs = ({
  value,
  onChange,
}: {
  value: 'fields' | 'data';
  onChange: (value: 'fields' | 'data') => void;
}) => (
  <div style={{ width: '100%', display: 'grid', gap: 6 }}>
    <Text strong style={{ textAlign: 'center' }}>
      Designer
    </Text>
    <Segmented
      block
      size="small"
      value={value}
      options={[
        { label: 'Fields', value: 'fields' },
        { label: 'Data', value: 'data' },
      ]}
      onChange={(next) => onChange(next as 'fields' | 'data')}
    />
  </div>
);

const NoSelectionSidebar = (props: SidebarProps) => {
  const options = useContext(OptionsContext);
  const [view, setView] = useState<'fields' | 'data'>(options.designData ? 'data' : 'fields');
  const wasMissingDesignData = useRef(!options.designData);

  useEffect(() => {
    if (options.designData && wasMissingDesignData.current) {
      setView('data');
      wasMissingDesignData.current = false;
    } else if (!options.designData) {
      wasMissingDesignData.current = true;
      setView((current) => (current === 'data' ? 'fields' : current));
    }
  }, [options.designData]);

  const headerContent = <HeaderTabs value={view} onChange={setView} />;

  if (view === 'data') {
    return <TemplateDataPanel {...props} headerContent={headerContent} />;
  }

  return <ListView {...props} headerContent={headerContent} />;
};

export default NoSelectionSidebar;
