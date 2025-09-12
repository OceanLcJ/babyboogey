import {
  Table as TableComponent,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";

import { Image } from "./image";
import { Label } from "./label";
import { Time } from "./time";
import { Copy } from "./copy";

import { type TableColumn } from "@/types/blocks/table";
import { type Pagination } from "@/types/blocks/base";
import { Dropdown } from "./dropdown";

export function Table({
  columns,
  data,
  emptyMessage,
  pagination,
}: {
  columns?: TableColumn[];
  data?: any[];
  emptyMessage?: string;
  pagination?: Pagination;
}) {
  if (!columns) {
    columns = [];
  }

  return (
    <TableComponent className="w-full">
      <TableHeader className="">
        <TableRow className="rounded-md">
          {columns &&
            columns.map((item: TableColumn, idx: number) => {
              return (
                <TableHead key={idx} className={item.className}>
                  {item.title}
                </TableHead>
              );
            })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data && data.length > 0 ? (
          data.map((item: any, idx: number) => (
            <TableRow key={idx} className="h-16">
              {columns &&
                columns.map((column: TableColumn, iidx: number) => {
                  const value = item[column.name as keyof typeof item];

                  const content = column.callback
                    ? column.callback(item)
                    : value;

                  let cellContent = content;

                  if (column.type === "image") {
                    cellContent = (
                      <Image
                        value={value}
                        metadata={column.metadata}
                        className={column.className}
                      />
                    );
                  } else if (column.type === "time") {
                    cellContent = (
                      <Time
                        value={value}
                        metadata={column.metadata}
                        className={column.className}
                      />
                    );
                  } else if (column.type === "label") {
                    cellContent = (
                      <Label
                        value={value}
                        metadata={column.metadata}
                        className={column.className}
                      />
                    );
                  } else if (column.type === "copy" && value) {
                    cellContent = (
                      <Copy
                        value={value}
                        metadata={column.metadata}
                        className={column.className}
                      >
                        {content}
                      </Copy>
                    );
                  } else if (column.type === "dropdown") {
                    cellContent = (
                      <Dropdown
                        value={content}
                        metadata={column.metadata}
                        className={column.className}
                      />
                    );
                  }

                  return (
                    <TableCell key={iidx} className={column.className}>
                      {cellContent}
                    </TableCell>
                  );
                })}
            </TableRow>
          ))
        ) : (
          <TableRow className="">
            <TableCell colSpan={columns.length}>
              <div className="flex w-full justify-center items-center py-8 text-muted-foreground">
                <p>{emptyMessage}</p>
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </TableComponent>
  );
}

export * from "./table-card";
