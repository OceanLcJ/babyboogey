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

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: number; pageSize?: number }>;
}) {
  const { page: pageNum, pageSize } = await searchParams;
  const page = pageNum || 1;
  const limit = pageSize || 20;

  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  const total = await getOrdersCount({
    userId: user.id,
    status: OrderStatus.PAID,
  });

  const orders = await getOrders({
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

  return (
    <div className="space-y-8">
      <TableCard
        title="Payments"
        description="View your payments"
        table={table}
      />
    </div>
  );
}
