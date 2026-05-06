import React from 'react';
import { theme } from 'antd';
import { ZOOM } from '@pdfweave/common';

const PageOverflowIndicator = ({
  pageHeight,
  bottomPaddingMm,
  hasOverflow,
}: {
  pageHeight: number;
  bottomPaddingMm: number;
  hasOverflow: boolean;
}) => {
  const { token } = theme.useToken();

  if (!hasOverflow) {
    return null;
  }

  const top = (pageHeight - bottomPaddingMm) * ZOOM;
  const color = token.colorTextTertiary;

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        height: 0,
        color,
        opacity: 0.7,
        pointerEvents: 'none',
        zIndex: 3,
      }}
    >
      <div
        style={{
          borderTop: `1px dashed ${color}`,
          width: '100%',
        }}
      />
      <span
        style={{
          position: 'absolute',
          right: 6,
          top: -18,
          padding: '1px 5px',
          borderRadius: token.borderRadiusSM,
          background: token.colorBgContainer,
          color,
          fontSize: 10,
          lineHeight: '14px',
          whiteSpace: 'nowrap',
          boxShadow: token.boxShadowTertiary,
        }}
      >
        ✂ paginates here
      </span>
    </div>
  );
};

export default PageOverflowIndicator;
