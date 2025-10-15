import { type Table } from "@/shared/types/blocks/table";
import { TableCard } from "@/shared/blocks/table";
import { getUserInfo } from "@/shared/services/user";
import { Empty } from "@/shared/blocks/common";
import {
  getOrders,
  getOrdersCount,
  Order,
  OrderStatus,
} from "@/shared/services/order";
import { PaymentType } from "@/extensions/payment";
import { Tab } from "@/shared/types/blocks/common";
import { getTranslations } from "next-intl/server";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: number; pageSize?: number; type?: string }>;
}) {
  const { page: pageNum, pageSize, type } = await searchParams;
  const page = pageNum || 1;
  const limit = pageSize || 20;

  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  const t = await getTranslations("settings.payments");

  const total = await getOrdersCount({
    paymentType: type as PaymentType,
    userId: user.id,
    status: [OrderStatus.PAID],
  });

  const orders = await getOrders({
    paymentType: type as PaymentType,
    userId: user.id,
    status: [OrderStatus.PAID],
    page,
    limit,
  });

  const table: Table = {
    title: t("list.title"),
    columns: [
      { name: "orderNo", title: t("fields.order_no"), type: "copy" },
      { name: "productName", title: t("fields.product_name") },
      {
        name: "status",
        title: t("fields.status"),
        type: "label",
        metadata: { variant: "outline" },
      },
      {
        name: "paymentType",
        title: t("fields.type"),
        type: "label",
        metadata: { variant: "outline" },
      },
      {
        title: t("fields.paid_amount"),
        callback: function (item) {
          return (
            <div className="text-primary">{`${item.paymentAmount / 100} ${
              item.paymentCurrency
            }`}</div>
          );
        },
        type: "copy",
      },
      {
        name: "createdAt",
        title: t("fields.created_at"),
        type: "time",
      },
    ],
    data: orders,
    pagination: {
      total,
      page,
      limit,
    },
  };

  const tabs: Tab[] = [
    {
      title: t("list.tabs.all"),
      name: "all",
      url: "/settings/payments",
      is_active: !type || type === "all",
    },
    {
      title: t("list.tabs.one-time"),
      name: "one-time",
      url: "/settings/payments?type=one-time",
      is_active: type === "one-time",
    },
    {
      title: t("list.tabs.subscription"),
      name: "subscription",
      url: "/settings/payments?type=subscription",
      is_active: type === "subscription",
    },
    {
      title: t("list.tabs.renew"),
      name: "renew",
      url: "/settings/payments?type=renew",
      is_active: type === "renew",
    },
  ];

  return (
    <div className="space-y-8">
      <TableCard
        title={t("list.title")}
        description={t("list.description")}
        tabs={tabs}
        table={table}
      />
    </div>
  );
}
