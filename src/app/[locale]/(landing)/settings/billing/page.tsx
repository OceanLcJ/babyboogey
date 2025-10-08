import { type Table } from "@/shared/types/blocks/table";
import { TableCard } from "@/shared/blocks/table";
import { getUserInfo } from "@/shared/services/user";
import { Empty } from "@/shared/blocks/common";
import {
  getSubscriptions,
  getSubscriptionsCount,
  Subscription,
  getCurrentSubscription,
} from "@/shared/services/subscription";
import moment from "moment";
import { PanelCard } from "@/shared/blocks/panel";
import { Tab } from "@/shared/types/blocks/common";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: number; pageSize?: number; status?: string }>;
}) {
  const { page: pageNum, pageSize, status } = await searchParams;
  const page = pageNum || 1;
  const limit = pageSize || 20;

  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  const currentSubscription = await getCurrentSubscription(user.id);

  const total = await getSubscriptionsCount({
    userId: user.id,
    status,
  });

  const subscriptions = await getSubscriptions({
    userId: user.id,
    status,
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

  const tabs: Tab[] = [
    {
      title: "All",
      name: "all",
      url: "/settings/billing",
      is_active: !status || status === "all",
    },
    {
      title: "Active",
      name: "active",
      url: "/settings/billing?status=active",
      is_active: status === "active",
    },
    {
      title: "Canceled",
      name: "canceled",
      url: "/settings/billing?status=canceled",
      is_active: status === "canceled",
    },
  ];

  return (
    <div className="space-y-8">
      <PanelCard
        title="Current Plan"
        buttons={[
          {
            title: "Adjust Plan",
            url: "/pricing",
            target: "_blank",
            icon: "Pencil",
            size: "sm",
          },
        ]}
        className="max-w-md"
      >
        <div className="text-3xl font-bold text-primary">
          {currentSubscription?.planName}
        </div>
        <div className="text-sm font-normal text-muted-foreground mt-4">
          {`Your subscription will auto renew on `}{" "}
          <span className="font-bold text-primary">
            {moment(currentSubscription?.currentPeriodEnd).format("YYYY-MM-DD")}
          </span>
        </div>
      </PanelCard>
      <TableCard title="Subscriptions History" tabs={tabs} table={table} />
    </div>
  );
}
