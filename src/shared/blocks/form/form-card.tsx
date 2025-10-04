import { Form as FormType } from "@/shared/types/blocks/form";
import { Form } from "@/shared/blocks/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";
import { Crumb } from "@/shared/types/blocks/common";
import { Fragment } from "react";
import { Breadcrumb } from "@/shared/components/ui/breadcrumb";
import { BreadcrumbList } from "@/shared/components/ui/breadcrumb";
import { BreadcrumbItem } from "@/shared/components/ui/breadcrumb";
import { BreadcrumbLink } from "@/shared/components/ui/breadcrumb";
import { BreadcrumbSeparator } from "@/shared/components/ui/breadcrumb";
import { BreadcrumbPage } from "@/shared/components/ui/breadcrumb";

export function FormCard({
  title,
  description,
  crumbs,
  form,
  className,
}: {
  title?: string;
  description?: string;
  crumbs?: Crumb[];
  form: FormType;
  className?: string;
}) {
  return (
    <Card className={cn(className)}>
      {crumbs && crumbs.length > 0 && (
        <Breadcrumb className="px-6">
          <BreadcrumbList>
            {crumbs.map((crumb, index) => (
              <Fragment key={index}>
                <BreadcrumbItem className="hidden md:block">
                  {crumb.is_active ? (
                    <BreadcrumbPage>{crumb.title}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink href={crumb.url || ""}>
                      {crumb.title}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {index < crumbs.length - 1 && (
                  <BreadcrumbSeparator className="hidden md:block" />
                )}
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      <CardHeader>
        {title && <CardTitle>{title}</CardTitle>}
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>

      {form && (
        <CardContent>
          <Form {...form} />
        </CardContent>
      )}
    </Card>
  );
}
