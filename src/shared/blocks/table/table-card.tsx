import { Table as TableType } from "@/shared/types/blocks/table";
import { Table } from "@/shared/blocks/table";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  CardDescription,
} from "@/shared/components/ui/card";
import { Pagination } from "@/shared/blocks/common/pagination";
import { cn } from "@/shared/lib/utils";
import { Button as ButtonType } from "@/shared/types/blocks/common";
import { Button } from "@/shared/components/ui/button";
import { Link } from "@/core/i18n/navigation";
import { SmartIcon } from "../common/smart-icon";

export function TableCard({
  title,
  description,
  buttons,
  table,
  className,
}: {
  title?: string;
  description?: string;
  buttons?: ButtonType[];
  table: TableType;
  className?: string;
}) {
  return (
    <Card className={cn(className)}>
      {(title || description || buttons) && (
        <CardHeader className="flex flex-wrap items-center gap-2">
          <div className="flex flex-col gap-2">
            {title && <CardTitle>{title}</CardTitle>}
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <div className="flex-1"></div>
          {buttons && buttons.length > 0 && (
            <div className="flex items-center gap-2">
              {buttons.map((button, idx) => (
                <Button
                  key={idx}
                  asChild
                  variant={button.variant || "default"}
                  size={button.size || "sm"}
                >
                  <Link
                    href={button.url || ""}
                    target={button.target || "_self"}
                  >
                    {button.icon && <SmartIcon name={button.icon as string} />}
                    {button.title}
                  </Link>
                </Button>
              ))}
            </div>
          )}
        </CardHeader>
      )}

      {table && (
        <CardContent>
          <Table {...table} />
        </CardContent>
      )}

      {table.pagination && (
        <CardFooter>
          <Pagination {...table.pagination} />
        </CardFooter>
      )}
    </Card>
  );
}
