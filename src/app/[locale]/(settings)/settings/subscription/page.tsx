import { type Table } from "@/shared/types/blocks/table";
import { TableCard } from "@/shared/blocks/table";
import { getUserInfo } from "@/shared/services/user";
import { Empty } from "@/shared/blocks/common";
import {
  getSubscriptions,
  getSubscriptionsCount,
  Subscription,
} from "@/shared/services/subscription";
import moment from "moment";

export default async function SubscriptionPage({
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

  const total = await getSubscriptionsCount({
    userId: user.id,
  });

  const subscriptions = await getSubscriptions({
    userId: user.id,
    page,
    limit,
  });

  const table: Table = {
    title: "Subscriptions",
    columns: [
      { name: "subscriptionNo", title: "Subscription Number", type: "copy" },
      { name: "interval", title: "Interval", type: "label" },
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
        title: "Amount",
        callback: function (item) {
          return (
            <div className="text-primary">{`${item.amount / 100} ${
              item.currency
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
        title: "Current Period",
        callback: function (item) {
          return (
            <div>
              {`${moment(item.currentPeriodStart).format("YYYY-MM-DD")}`} ~
              <br />
              {`${moment(item.currentPeriodEnd).format("YYYY-MM-DD")}`}
            </div>
          );
        },
      },
      {
        name: "action",
        title: "",
        type: "dropdown",
        callback: (item: Subscription) => {
          return [];
        },
      },
    ],
    data: subscriptions,
    pagination: {
      total,
      page,
      limit,
    },
  };

  return (
    <div className="space-y-8">
      <TableCard table={table} />
    </div>
  );
}
