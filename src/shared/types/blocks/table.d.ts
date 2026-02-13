import { Pagination } from './common';

export interface TableColumn {
  name?: string;
  title?: string;
  type?:
    | 'copy'
    | 'image'
    | 'time'
    | 'label'
    | 'dropdown'
    | 'user'
    | 'json_preview';
  placeholder?: string;
  metadata?: UnsafeAny;
  className?: string;
  callback?: (item: UnsafeAny) => UnsafeAny;
}

export interface Table {
  title?: string;
  columns: TableColumn[];
  data: UnsafeAny[];
  emptyMessage?: string;
  pagination?: Pagination;
  actions?: Button[];
}
