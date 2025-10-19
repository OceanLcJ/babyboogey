import { Header, Main, MainHeader } from "@/shared/blocks/dashboard";
import { TableCard } from "@/shared/blocks/table";
import { type Table } from "@/shared/types/blocks/table";
import { Crumb, Tab } from "@/shared/types/blocks/common";
import { getOrders, getOrdersCount } from "@/shared/services/order";
import { PaymentType } from "@/extensions/payment";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PERMISSIONS, requirePermission } from "@/core/rbac";
export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    page?: number;
    pageSize?: number;
    type?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Check if user has permission to read payments
  await requirePermission({
    code: PERMISSIONS.PAYMENTS_READ,
    redirectUrl: "/admin/no-permission",
    locale,
  });

  const t = await getTranslations("admin.payments");

  const { page: pageNum, pageSize, type } = await searchParams;
  const page = pageNum || 1;
  const limit = pageSize || 30;

  const crumbs: Crumb[] = [
    { title: t("list.crumbs.admin"), url: "/admin" },
    { title: t("list.crumbs.payments"), is_active: true },
  ];

  const tabs: Tab[] = [
    {
      name: "all",
      title: t("list.tabs.all"),
      url: "/admin/payments",
      is_active: !type || type === "all",
    },
    {
      name: "subscription",
      title: t("list.tabs.subscription"),
      url: "/admin/payments?type=subscription",
      is_active: type === "subscription",
    },
    {
      name: "one-time",
      title: t("list.tabs.one-time"),
      url: "/admin/payments?type=one-time",
      is_active: type === "one-time",
    },
  ];

  const total = await getOrdersCount({
    paymentType: type as PaymentType,
  });

  const payments = await getOrders({
    paymentType: type as PaymentType,
    getUser: true,
    page,
    limit,
  });

  const table: Table = {
    columns: [
      { name: "orderNo", title: t("fields.order_no"), type: "copy" },
      { name: "user", title: t("fields.user"), type: "user" },
      {
        title: t("fields.amount"),
        callback: (item) => {
          return (
            <div className="text-primary">{`${item.amount / 100} ${
              item.currency
            }`}</div>
          );
        },
        type: "copy",
      },
      { name: "status", title: t("fields.status"), type: "label" },
      {
        name: "paymentType",
        title: t("fields.type"),
        type: "label",
        placeholder: "-",
      },
      {
        name: "productId",
        title: t("fields.product"),
        type: "label",
        placeholder: "-",
      },
      { name: "description", title: t("fields.description"), placeholder: "-" },
      {
        name: "paymentProvider",
        title: t("fields.provider"),
        type: "label",
      },
      { name: "createdAt", title: t("fields.created_at"), type: "time" },
    ],
    data: payments,
    pagination: {
      total,
      page,
      limit,
    },
  };

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader title={t("list.title")} tabs={tabs} />
        <TableCard table={table} />
      </Main>
    </>
  );
}
