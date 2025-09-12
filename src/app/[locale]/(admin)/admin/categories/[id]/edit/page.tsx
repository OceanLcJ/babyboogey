import { Header, Main, MainHeader } from "@/blocks/dashboard";
import { FormCard } from "@/blocks/form";
import { Form } from "@/types/blocks/form";
import {
  addTaxonomy,
  findCategory,
  findTaxonomy,
  NewTaxonomy,
  TaxonomyStatus,
  TaxonomyType,
  updateTaxonomy,
  UpdateTaxonomy,
} from "@/services/taxonomy";
import { getUuid } from "@/lib/hash";
import { getUserInfo } from "@/services/user";

export default async function CategoryEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const category = await findCategory({ id });
  if (!category) {
    return "Category not found";
  }

  const user = await getUserInfo();
  if (!user) {
    return "no auth";
  }

  if (!user || category.userId !== user.id) {
    return "access denied";
  }

  const form: Form = {
    fields: [
      {
        name: "slug",
        type: "text",
        title: "Slug",
        tip: "unique slug for the category",
        validation: { required: true },
      },
      {
        name: "title",
        type: "text",
        title: "Category Name",
        validation: { required: true },
      },
      {
        name: "description",
        type: "textarea",
        title: "Description",
      },
    ],
    passby: {
      type: "category",
      category: category,
      user: user,
    },
    data: category,
    submit: {
      button: {
        text: "Edit Category",
      },
      handler: async (data, passby) => {
        "use server";

        const { user, category } = passby;
        if (!user || !category || category.userId !== user.id) {
          throw new Error("access denied");
        }

        const slug = data.get("slug") as string;
        const title = data.get("title") as string;
        const description = data.get("description") as string;

        if (!slug?.trim() || !title?.trim()) {
          throw new Error("slug and title are required");
        }

        const updateCategory: UpdateTaxonomy = {
          parentId: "", // todo: select parent category
          slug: slug.trim().toLowerCase(),
          title: title.trim(),
          description: description.trim(),
          image: "",
          icon: "",
          status: TaxonomyStatus.PUBLISHED,
        };

        const result = await updateTaxonomy(category.id, updateCategory);

        if (!result) {
          throw new Error("update category failed");
        }

        return {
          status: "success",
          message: "category updated",
          redirect_url: "/admin/categories",
        };
      },
    },
  };

  return (
    <>
      <Header />
      <Main>
        <MainHeader title="Edit Category" />
        <FormCard form={form} className="md:max-w-xl" />
      </Main>
    </>
  );
}
