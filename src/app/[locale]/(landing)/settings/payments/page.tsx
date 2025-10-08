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

  const total = await getOrdersCount({
    paymentType: type as PaymentType,
    userId: user.id,
    status: OrderStatus.PAID,
  });

  const orders = await getOrders({
    paymentType: type as PaymentType,
    userId: user.id,
    status: OrderStatus.PAID,
    page,
    limit,
  });

  const table: Table = {
    title: "Payments",
    columns: [
      { name: "orderNo", title: "Order Number", type: "copy" },
      { name: "productName", title: "Product Name" },
      {
        name: "status",
        title: "Status",
        type: "label",
        metadata: { variant: "outline" },
      },
      {
        name: "paymentProvider",
        title: "Provider",
        type: "label",
        metadata: { variant: "outline" },
      },
      {
        name: "paymentType",
        title: "Type",
        type: "label",
        metadata: { variant: "outline" },
      },
      {
        title: "Paid Amount",
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
        title: "Created At",
        type: "time",
      },
      {
        name: "action",
        title: "",
        type: "dropdown",
        callback: (item: Order) => {
          return [];
        },
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
      title: "All",
      name: "all",
      url: "/settings/payments",
      is_active: !type || type === "all",
    },
    {
      title: "One-Time",
      name: "one-time",
      url: "/settings/payments?type=one-time",
      is_active: type === "one-time",
    },
    {
      title: "Subscription",
      name: "subscription",
      url: "/settings/payments?type=subscription",
      is_active: type === "subscription",
    },
    {
      title: "Renew",
      name: "renew",
      url: "/settings/payments?type=renew",
      is_active: type === "renew",
    },
  ];

  return (
    <div className="space-y-8">
      <TableCard
        title="Payments"
        description="View your payments"
        tabs={tabs}
        table={table}
      />
    </div>
  );
}
