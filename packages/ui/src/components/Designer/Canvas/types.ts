import type { MutableRefObject } from 'react';
import type { BasePdf, ChangeSchemas, SchemaForUI, Size } from '@pdfweave/common';

export interface GuidesInterface {
  getGuides(): number[];
  scroll(pos: number): void;
  scrollGuides(pos: number): void;
  loadGuides(guides: number[]): void;
  resize(): void;
}

export interface DesignerActions {
  copy: (ids?: string[]) => void;
  cut: (ids?: string[]) => void;
  paste: () => void;
  duplicate: (ids?: string[]) => void;
  group: (ids?: string[]) => void;
  ungroup: (ids?: string[]) => void;
  remove: (ids?: string[]) => void;
  bringToFront: (ids?: string[]) => void;
  sendToBack: (ids?: string[]) => void;
  canPaste: () => boolean;
}

export interface CanvasProps {
  basePdf: BasePdf;
  height: number;
  hoveringSchemaId: string | null;
  onChangeHoveringSchemaId: (id: string | null) => void;
  pageCursor: number;
  schemasList: SchemaForUI[][];
  scale: number;
  backgrounds: string[];
  pageSizes: Size[];
  size: Size;
  activeElements: HTMLElement[];
  onEdit: (targets: HTMLElement[]) => void;
  changeSchemas: ChangeSchemas;
  removeSchemas: (ids: string[]) => void;
  designerActions: DesignerActions;
  paperRefs: MutableRefObject<HTMLDivElement[]>;
  sidebarOpen: boolean;
  onPageOverflowChange?: (info: { pageIndex: number; overflowingSchemaCount: number }) => void;
}
