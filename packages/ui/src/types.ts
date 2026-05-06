import type { Schema, SchemaForUI, Size, ChangeSchemas, BasePdf, Template } from '@pdfweave/common';

export type SidebarProps = {
  height: number;
  hoveringSchemaId: string | null;
  onChangeHoveringSchemaId: (id: string | null) => void;
  size: Size;
  pageSize: Size;
  basePdf: BasePdf;
  template: Template;
  activeElements: HTMLElement[];
  schemas: SchemaForUI[];
  schemasList: SchemaForUI[][];
  onSortEnd: (sortedSchemas: SchemaForUI[]) => void;
  addSchema: (schema: Schema, options?: { select?: boolean }) => void;
  onEdit: (id: string) => void;
  onEditEnd: () => void;
  changeSchemas: ChangeSchemas;
  deselectSchema: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (sidebarOpen: boolean) => void;
};
