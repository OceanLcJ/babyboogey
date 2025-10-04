import { ConsoleLayout } from "@/shared/blocks/console/layout";
import { Nav } from "@/shared/types/blocks/common";
import { ReactNode } from "react";
import { getPathname } from "@/shared/lib/browser";

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  // settings title
  const title = "Settings";

  const pathname = await getPathname();

  // settings nav
  const nav: Nav = {
    title: "Settings",
    items: [
      {
        title: "Profile",
        url: "/settings/profile",
        icon: "User",
        is_active: pathname === "/settings/profile",
      },
      {
        title: "Security",
        url: "/settings/security",
        icon: "Lock",
        is_active: pathname === "/settings/security",
      },
      {
        title: "Payments",
        url: "/settings/payments",
        icon: "DollarSign",
        is_active: pathname === "/settings/payments",
      },
      {
        title: "Subscription",
        url: "/settings/subscription",
        icon: "CreditCard",
        is_active: pathname === "/settings/subscription",
      },
      {
        title: "Credits",
        url: "/settings/credits",
        icon: "Coins",
        is_active: pathname === "/settings/credits",
      },
      {
        title: "API Keys",
        url: "/settings/api-keys",
        icon: "RiKeyLine",
        is_active: pathname === "/settings/api-keys",
      },
    ],
  };

  const topNav: Nav = {
    items: [
      {
        title: "Activity",
        url: "/activity",
        icon: "Activity",
      },
      {
        title: "Settings",
        url: "/settings",
        icon: "Settings",
        is_active: true,
      },
    ],
  };

  return (
    <ConsoleLayout title={title} nav={nav} className="py-16 md:py-20">
      {children}
    </ConsoleLayout>
  );
}
