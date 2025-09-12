import { Header, Main, MainHeader } from "@/blocks/dashboard";
import { TableCard } from "@/blocks/table";
import { type Table } from "@/types/blocks/table";
import { Button } from "@/types/blocks/base";
import {
  getCategories,
  getCategoriesCount,
  type Taxonomy,
} from "@/services/taxonomy";

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: number; pageSize?: number }>;
}) {
  const { page: pageNum, pageSize } = await searchParams;
  const page = pageNum || 1;
  const limit = pageSize || 30;

  const total = await getCategoriesCount();
  const data = await getCategories({
    page,
    limit,
  });

  const table: Table = {
    columns: [
      {
        name: "slug",
        title: "Slug",
        type: "copy",
        metadata: { message: "Copied" },
      },
      { name: "title", title: "Title" },
      {
        name: "status",
        title: "Status",
        type: "label",
        metadata: { variant: "outline" },
      },
      { name: "createdAt", title: "Created At", type: "time" },
      { name: "updatedAt", title: "Updated At", type: "time" },
      {
        name: "action",
        title: "",
        type: "dropdown",
        callback: (item: Taxonomy) => {
          return [
            {
              name: "edit",
              title: "Edit",
              icon: "RiEditLine",
              url: `/admin/categories/${item.id}/edit`,
            },
          ];
        },
      },
    ],
    actions: [
      {
        name: "edit",
        text: "Edit",
        icon: "RiEditLine",
        url: "/admin/categories/[id]/edit",
      },
    ],
    data,
    pagination: {
      total,
      page,
      limit,
    },
  };

  const actions: Button[] = [
    {
      name: "add",
      text: "Add Category",
      icon: "RiAddLine",
      url: "/admin/categories/add",
    },
  ];

  return (
    <>
      <Header />
      <Main>
        <MainHeader title="Categories" actions={actions} />
        <TableCard table={table} />
      </Main>
    </>
  );
}
