import { Header, Main, MainHeader } from "@/shared/blocks/dashboard";
import { FormCard } from "@/shared/blocks/form";
import { Form } from "@/shared/types/blocks/form";
import { getUuid } from "@/shared/lib/hash";
import { addPost, NewPost, PostType } from "@/shared/services/post";
import { PostStatus } from "@/shared/services/post";
import { Crumb } from "@/shared/types/blocks/common";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PERMISSIONS } from "@/core/rbac";
import { requirePermission } from "@/core/rbac";
import { getUserInfo } from "@/shared/services/user";

export default async function PostAddPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Check if user has permission to add posts
  await requirePermission({
    code: PERMISSIONS.POSTS_WRITE,
    redirectUrl: "/admin/no-permission",
    locale,
  });

  const t = await getTranslations("admin.posts");

  const crumbs: Crumb[] = [
    { title: t("add.crumbs.admin"), url: "/admin" },
    { title: t("add.crumbs.posts"), url: "/admin/posts" },
    { title: t("add.crumbs.add"), is_active: true },
  ];

  const form: Form = {
    fields: [
      {
        name: "slug",
        type: "text",
        title: t("fields.slug"),
        tip: "unique slug for the post",
        validation: { required: true },
      },
      {
        name: "title",
        type: "text",
        title: t("fields.title"),
        validation: { required: true },
      },
      {
        name: "description",
        type: "textarea",
        title: t("fields.description"),
      },
      {
        name: "content",
        type: "markdown_editor",
        title: t("fields.content"),
      },
    ],
    passby: {
      type: "post",
    },
    data: {},
    submit: {
      button: {
        title: t("add.buttons.submit"),
      },
      handler: async (data, passby) => {
        "use server";

        const user = await getUserInfo();
        if (!user) {
          throw new Error("no auth");
        }

        const slug = data.get("slug") as string;
        const title = data.get("title") as string;
        const description = data.get("description") as string;
        const content = data.get("content") as string;

        if (!slug?.trim() || !title?.trim()) {
          throw new Error("slug and title are required");
        }

        const newPost: NewPost = {
          id: getUuid(),
          userId: user.id,
          parentId: "", // todo: select parent category
          slug: slug.trim().toLowerCase(),
          type: PostType.ARTICLE,
          title: title.trim(),
          description: description.trim(),
          image: "",
          content: content.trim(),
          categories: "",
          tags: "",
          authorName: "",
          authorImage: "",
          status: PostStatus.PUBLISHED,
        };

        const result = await addPost(newPost);

        if (!result) {
          throw new Error("add post failed");
        }

        return {
          status: "success",
          message: "post added",
          redirect_url: "/admin/posts",
        };
      },
    },
  };

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader title={t("add.title")} />
        <FormCard form={form} className="md:max-w-xl" />
      </Main>
    </>
  );
}
