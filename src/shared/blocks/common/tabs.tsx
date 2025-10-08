"use client";

import { ScrollArea, ScrollBar } from "@/shared/components/ui/scroll-area";
import {
  TabsList,
  TabsTrigger,
  Tabs as TabsComponent,
} from "@/shared/components/ui/tabs";
import { Tab } from "@/shared/types/blocks/common";
import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { useRouter } from "@/core/i18n/navigation";

export function Tabs({
  tabs,
  size,
}: {
  tabs: Tab[];
  size?: "sm" | "md" | "lg";
}) {
  const router = useRouter();
  const [tabName, setTabName] = useState(
    tabs?.find((tab) => tab.is_active)?.name || ""
  );
  const [tab, setTab] = useState({} as Tab);

  useEffect(() => {
    if (tabName) {
      const currentTab =
        tabs?.find((tab) => tab.name === tabName) || ({} as Tab);
      if (currentTab.url) {
        router.push(currentTab.url);
        // setTab(currentTab);
      }
    }
  }, [tabName]);

  return (
    <div className="relative mb-8">
      <ScrollArea className="w-full lg:max-w-none">
        <div className="space-x-2 flex items-center">
          <TabsComponent value={tabName} onValueChange={setTabName}>
            <TabsList className={cn(size === "sm" && "h-8")}>
              {tabs.map((tab, idx) => (
                <TabsTrigger key={idx} value={tab.name || ""}>
                  {tab.title}
                </TabsTrigger>
              ))}
            </TabsList>
          </TabsComponent>
        </div>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>
    </div>
  );
}
