"use client";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ScrollBar } from "@/components/ui/scroll-area";
import { Nav, NavItem, Button as ButtonType } from "@/types/blocks/common";
import { Link } from "@/core/i18n/navigation";
import { Button } from "@/components/ui/button";
import { SmartIcon } from "@/blocks/common/smart-icon";

export function MainHeader({
  title,
  description,
  tabs,
  actions,
}: {
  title?: string;
  description?: string;
  tabs?: NavItem[];
  actions?: ButtonType[];
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold tracking-tight">{title || ""}</h2>
          <p className="text-muted-foreground">{description || ""}</p>
        </div>
        <div>
          {actions?.map((action, idx) => (
            <Link
              key={idx}
              href={action.url || ""}
              target={action.target || "_self"}
            >
              <Button
                onClick={action.onClick}
                variant={action.variant || "default"}
                size={action.size || "sm"}
              >
                {action.icon && <SmartIcon name={action.icon as string} />}
                {action.title}
              </Button>
            </Link>
          ))}
        </div>
      </div>
      {tabs && tabs.length > 0 ? (
        <div className="relative mb-8">
          <ScrollArea className="w-full lg:max-w-none">
            <div className="space-x-2 flex items-center">
              {tabs?.map((tab) => (
                <Link key={tab.title || tab.title} href={tab.url || ""}>
                  <div
                    className={cn(
                      "px-4 py-1 rounded-full border text-sm text-muted-foreground block duration-150",
                      tab.is_active
                        ? "bg-primary text-primary-foreground font-bold"
                        : "hover:bg-primary hover:text-primary-foreground"
                    )}
                  >
                    {tab.title}
                  </div>
                </Link>
              ))}
            </div>
            <ScrollBar orientation="horizontal" className="invisible" />
          </ScrollArea>
        </div>
      ) : null}
    </div>
  );
}
