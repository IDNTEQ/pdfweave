import React, { useEffect } from 'react';
import { theme } from 'antd';
import {
  Anchor,
  BringToFront,
  Clipboard,
  Copy,
  CopyPlus,
  Group,
  Scissors,
  SendToBack,
  Trash2,
  Ungroup,
} from 'lucide-react';

export type DesignerContextMenuAction =
  | 'copy'
  | 'cut'
  | 'paste'
  | 'duplicate'
  | 'group'
  | 'ungroup'
  | 'applyAnchorToSelection'
  | 'delete'
  | 'bringToFront'
  | 'sendToBack';

type MenuItem = {
  action: DesignerContextMenuAction;
  label: string;
  disabled?: boolean;
  icon: React.ReactNode;
};

type Props = {
  open: boolean;
  x: number;
  y: number;
  canPaste: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  applyAnchorSourceSchemaName?: string;
  onAction: (action: DesignerContextMenuAction) => void;
  onClose: () => void;
};

const ContextMenu = ({
  open,
  x,
  y,
  canPaste,
  canGroup,
  canUngroup,
  applyAnchorSourceSchemaName,
  onAction,
  onClose,
}: Props) => {
  const { token } = theme.useToken();

  useEffect(() => {
    if (!open) return undefined;

    const close = () => onClose();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Esc') onClose();
    };

    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  const iconSize = 15;
  const items: MenuItem[] = [
    { action: 'copy', label: 'Copy', icon: <Copy size={iconSize} /> },
    { action: 'cut', label: 'Cut', icon: <Scissors size={iconSize} /> },
    { action: 'paste', label: 'Paste', disabled: !canPaste, icon: <Clipboard size={iconSize} /> },
    { action: 'duplicate', label: 'Duplicate', icon: <CopyPlus size={iconSize} /> },
    { action: 'group', label: 'Group', disabled: !canGroup, icon: <Group size={iconSize} /> },
    { action: 'ungroup', label: 'Ungroup', disabled: !canUngroup, icon: <Ungroup size={iconSize} /> },
    ...(applyAnchorSourceSchemaName
      ? [
          {
            action: 'applyAnchorToSelection' as const,
            label: `Apply ${applyAnchorSourceSchemaName}'s anchor to selection`,
            icon: <Anchor size={iconSize} />,
          },
        ]
      : []),
    { action: 'delete', label: 'Delete', icon: <Trash2 size={iconSize} /> },
    { action: 'bringToFront', label: 'Bring to Front', icon: <BringToFront size={iconSize} /> },
    { action: 'sendToBack', label: 'Send to Back', icon: <SendToBack size={iconSize} /> },
  ];

  return (
    <div
      role="menu"
      aria-label="Schema context menu"
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => event.stopPropagation()}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 10000,
        minWidth: 176,
        padding: 4,
        borderRadius: token.borderRadius,
        background: token.colorBgElevated,
        border: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: token.boxShadowSecondary,
      }}
    >
      {items.map(({ action, label, disabled, icon }) => (
        <button
          key={action}
          type="button"
          role="menuitem"
          disabled={disabled}
          onClick={() => {
            if (!disabled) onAction(action);
          }}
          style={{
            width: '100%',
            height: 30,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 10px',
            border: 0,
            borderRadius: token.borderRadiusSM,
            background: 'transparent',
            color: disabled ? token.colorTextDisabled : token.colorText,
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 13,
            textAlign: 'left',
          }}
        >
          <span aria-hidden="true" style={{ display: 'inline-flex', width: iconSize, height: iconSize }}>
            {icon}
          </span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
};

export default ContextMenu;
