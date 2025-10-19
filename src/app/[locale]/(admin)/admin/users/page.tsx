import { Header, Main, MainHeader } from "@/shared/blocks/dashboard";
import { TableCard } from "@/shared/blocks/table";
import { type Table } from "@/shared/types/blocks/table";
import { getUsers, User } from "@/shared/services/user";
import { getTranslations } from "next-intl/server";
import { Crumb } from "@/shared/types/blocks/common";
import { requirePermission, PERMISSIONS } from "@/core/rbac";
import { getUserRoles } from "@/shared/services/rbac";
import { Badge } from "@/shared/components/ui/badge";

export default async function AdminUsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Check if user has permission to read users
  await requirePermission({
    code: PERMISSIONS.USERS_READ,
    redirectUrl: "/admin/no-permission",
    locale,
  });

  const t = await getTranslations("admin.users");

  const users = await getUsers();

  const crumbs: Crumb[] = [
    { title: t("list.crumbs.admin"), url: "/admin" },
    { title: t("list.crumbs.users"), is_active: true },
  ];

  const table: Table = {
    columns: [
      { name: "id", title: t("fields.id"), type: "copy" },
      { name: "name", title: t("fields.name") },
      {
        name: "image",
        title: t("fields.avatar"),
        type: "image",
        placeholder: "-",
      },
      { name: "email", title: t("fields.email"), type: "copy" },
      {
        name: "roles",
        title: t("fields.roles"),
        callback: async (item: User) => {
          const roles = await getUserRoles(item.id);

          return (
            <div className="flex flex-col gap-2">
              {roles.map((role) => (
                <Badge key={role.id} variant="outline">
                  {role.title}
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        name: "emailVerified",
        title: t("fields.email_verified"),
        type: "label",
        placeholder: "-",
      },
      { name: "createdAt", title: t("fields.created_at"), type: "time" },
      {
        name: "actions",
        title: t("fields.actions"),
        type: "dropdown",
        callback: (item: User) => [
          {
            name: "edit",
            title: t("list.buttons.edit"),
            icon: "RiEditLine",
            url: `/admin/users/${item.id}/edit`,
          },
          {
            name: "edit-roles",
            title: t("list.buttons.edit_roles"),
            icon: "Users",
            url: `/admin/users/${item.id}/edit-roles`,
          },
        ],
      },
    ],
    data: users,
  };

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader title={t("list.title")} />
        <TableCard table={table} />
      </Main>
    </>
  );
}
