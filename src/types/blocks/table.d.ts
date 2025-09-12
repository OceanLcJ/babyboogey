import { Pagination } from "./base";

export interface TableColumn {
  name?: string;
  title?: string;
  type?: "copy" | "image" | "time" | "label" | "dropdown";
  metadata?: any;
  className?: string;
  callback?: (item: any) => any;
}

export interface Table {
  columns: TableColumn[];
  data: any[];
  pagination?: Pagination;
  actions?: Button[];
}
