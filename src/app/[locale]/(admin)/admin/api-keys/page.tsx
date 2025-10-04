import { Header, Main, MainHeader } from "@/shared/blocks/dashboard";
import { TableCard } from "@/shared/blocks/table";
import { type Table } from "@/shared/types/blocks/table";
import { getUserInfo } from "@/shared/services/user";
import { getPosts, getPostsCount, Post } from "@/shared/services/post";
import { PostType } from "@/shared/services/post";
import { Button, Crumb } from "@/shared/types/blocks/common";
import { getTaxonomies, TaxonomyType } from "@/shared/services/taxonomy";
import { Empty } from "@/shared/blocks/common";
import { Apikey, getApikeys, getApikeysCount } from "@/shared/services/apikey";

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: number; pageSize?: number }>;
}) {
  const { page: pageNum, pageSize } = await searchParams;
  const page = pageNum || 1;
  const limit = pageSize || 30;

  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  const crumbs: Crumb[] = [
    { title: "Admin", url: "/admin" },
    { title: "API Keys", is_active: true },
  ];

  const total = await getApikeysCount({});

  const apiKeys = await getApikeys({
    getUser: true,
    page,
    limit,
  });

  const table: Table = {
    columns: [
      { name: "title", title: "Title" },
      { name: "key", title: "API Key", type: "copy" },
      { name: "user", title: "User", type: "user" },
      { name: "createdAt", title: "Created At", type: "time" },
      {
        name: "action",
        title: "",
        type: "dropdown",
        callback: (item: Post) => {
          return [];
        },
      },
    ],
    data: apiKeys,
    pagination: {
      total,
      page,
      limit,
    },
  };

  const actions: Button[] = [];

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader title="API Keys" actions={actions} />
        <TableCard table={table} />
      </Main>
    </>
  );
}
