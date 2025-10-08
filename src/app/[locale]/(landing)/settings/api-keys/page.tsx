import { type Table } from "@/shared/types/blocks/table";
import { TableCard } from "@/shared/blocks/table";
import { getUserInfo } from "@/shared/services/user";
import { Empty } from "@/shared/blocks/common";
import {
  getApikeys,
  getApikeysCount,
  Apikey,
  ApikeyStatus,
} from "@/shared/services/apikey";
import { Button } from "@/shared/types/blocks/common";

export default async function ApiKeysPage({
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

  const total = await getApikeysCount({
    userId: user.id,
    status: ApikeyStatus.ACTIVE,
  });

  const apikeys = await getApikeys({
    userId: user.id,
    status: ApikeyStatus.ACTIVE,
    page,
    limit,
  });

  const table: Table = {
    columns: [
      {
        name: "title",
        title: "Title",
      },
      { name: "key", title: "API Key", type: "copy" },
      {
        name: "createdAt",
        title: "Created At",
        type: "time",
      },
      {
        name: "action",
        title: "",
        type: "dropdown",
        callback: (item: Apikey) => {
          return [
            {
              title: "Edit",
              url: `/settings/api-keys/${item.id}/edit`,
              icon: "RiEditLine",
            },
            {
              title: "Delete",
              url: `/settings/api-keys/${item.id}/delete`,
              icon: "RiDeleteBinLine",
            },
          ];
        },
      },
    ],
    data: apikeys,
    emptyMessage: "No API Keys",
    pagination: {
      total,
      page,
      limit,
    },
  };

  const buttons: Button[] = [
    {
      title: "Create API Key",
      url: "/settings/api-keys/create",
      icon: "Plus",
    },
  ];

  return (
    <div className="space-y-8">
      <TableCard title="API Keys" buttons={buttons} table={table} />
    </div>
  );
}
