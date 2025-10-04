import { loadThemeLayout } from "@/core/theme";
import { getLocale, setRequestLocale } from "next-intl/server";
import { getUserInfo } from "@/shared/services/user";
import { redirect } from "next/navigation";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  setRequestLocale(locale);

  // check if user is logged in
  const user = await getUserInfo();
  if (!user) {
    redirect("/sign-in");
  }

  const Layout = await loadThemeLayout("landing");

  return <Layout>{children}</Layout>;
}
