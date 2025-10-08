import { type Table } from "@/shared/types/blocks/table";
import { TableCard } from "@/shared/blocks/table";
import { PanelCard } from "@/shared/blocks/panel";
import { getUserInfo } from "@/shared/services/user";
import { Empty } from "@/shared/blocks/common";
import {
  Credit,
  CreditStatus,
  CreditTransactionType,
  getCredits,
  getCreditsCount,
  getRemainingCredits,
} from "@/shared/services/credit";
import { Tab } from "@/shared/types/blocks/common";

export default async function CreditsPage({
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

  const total = await getCreditsCount({
    transactionType: type as CreditTransactionType,
    userId: user.id,
    status: CreditStatus.ACTIVE,
  });

  const credits = await getCredits({
    userId: user.id,
    status: CreditStatus.ACTIVE,
    transactionType: type as CreditTransactionType,
    page,
    limit,
  });

  const table: Table = {
    title: "Credits History",
    columns: [
      { name: "transactionNo", title: "Transaction No", type: "copy" },
      { name: "description", title: "Description" },
      {
        name: "transactionType",
        title: "Type",
        type: "label",
        metadata: { variant: "outline" },
      },
      {
        name: "transactionScene",
        title: "Scene",
        type: "label",
        placeholder: "-",
        metadata: { variant: "outline" },
      },
      {
        name: "credits",
        title: "Credits",
        type: "label",
        metadata: { variant: "outline" },
      },
      {
        name: "expiresAt",
        title: "Expires At",
        type: "time",
        placeholder: "-",
        metadata: { format: "YYYY-MM-DD HH:mm:ss" },
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
        callback: (item: Credit) => {
          return [];
        },
      },
    ],
    data: credits,
    pagination: {
      total,
      page,
      limit,
    },
  };

  const remainingCredits = await getRemainingCredits(user.id);

  const tabs: Tab[] = [
    {
      title: "All",
      name: "all",
      url: "/settings/credits",
      is_active: !type || type === "all",
    },
    {
      title: "Grant",
      name: "grant",
      url: "/settings/credits?type=grant",
      is_active: type === "grant",
    },
    {
      title: "Consume",
      name: "consume",
      url: "/settings/credits?type=consume",
      is_active: type === "consume",
    },
  ];

  return (
    <div className="space-y-8">
      <PanelCard
        title="Credits Balance"
        buttons={[
          {
            title: "Buy Credits",
            url: "/pricing",
            target: "_blank",
            icon: "Coins",
          },
        ]}
        className="max-w-md"
      >
        <div className="text-3xl font-bold text-primary">
          {remainingCredits}
        </div>
      </PanelCard>
      <TableCard title="Credits History" tabs={tabs} table={table} />
    </div>
  );
}
