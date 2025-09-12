"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Button } from "@/components/ui/button";
import { Icon } from "@/blocks/base/icon";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { NavItem } from "@/types/blocks/base";

export function Dropdown({
  value,
  metadata,
  className,
}: {
  value: NavItem[];
  metadata: Record<string, any>;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
        >
          <MoreHorizontal />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[160px]">
        {value.map((item) => {
          return (
            <DropdownMenuItem key={item.title}>
              <Link
                href={item.url || ""}
                target={item.target || "_self"}
                className="flex items-center gap-2 w-full"
              >
                {item.icon && (
                  <Icon name={item.icon as string} className="w-4 h-4" />
                )}
                {item.title}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
