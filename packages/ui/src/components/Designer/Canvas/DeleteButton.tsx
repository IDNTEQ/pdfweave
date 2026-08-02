import React from 'react';
import { Button, theme } from 'antd';
import { X } from 'lucide-react';
import { DESIGNER_CLASSNAME } from '../../../constants.js';

const fmt4Num = (prop: string) => Number(prop.replace('px', ''));

interface DeleteButtonProps {
  id: string;
  activeElements: HTMLElement[];
}

/**
 * The little X button that appears top-right of the active selection.
 * Selecto's onDragStart treats clicks on this element (matched by `id`) as a
 * removeSchemas request.
 */
const DeleteButton: React.FC<DeleteButtonProps> = ({ id, activeElements: aes }) => {
  const { token } = theme.useToken();
  const size = 26;
  const top = Math.min(...aes.map(({ style }) => fmt4Num(style.top)));
  const left = Math.max(...aes.map(({ style }) => fmt4Num(style.left) + fmt4Num(style.width))) + 10;

  return (
    <Button
      id={id}
      className={DESIGNER_CLASSNAME + 'delete-button'}
      style={{
        position: 'absolute',
        zIndex: 1,
        top,
        left,
        width: size,
        height: size,
        padding: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: token.borderRadius,
        color: token.colorWhite,
        background: token.colorPrimary,
      }}
    >
      <X style={{ pointerEvents: 'none' }} />
    </Button>
  );
};

export default DeleteButton;
