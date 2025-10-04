import { getUserInfo } from "@/shared/services/user";
import { Empty } from "@/shared/blocks/common";
import { Form as FormType } from "@/shared/types/blocks/form";
import { FormCard } from "@/shared/blocks/form";
import {
  findApikeyById,
  updateApikey,
  UpdateApikey,
} from "@/shared/services/apikey";
import { getNonceStr } from "@/shared/lib/hash";
import { Crumb } from "@/shared/types/blocks/common";

export default async function EditApiKeyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const apikey = await findApikeyById(id);
  if (!apikey) {
    return <Empty message="API Key not found" />;
  }

  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  if (apikey.userId !== user.id) {
    return <Empty message="no permission" />;
  }

  const form: FormType = {
    title: "Edit API Key",
    fields: [
      {
        name: "title",
        title: "Title",
        type: "text",
        placeholder: "",
        validation: { required: true },
      },
    ],
    passby: {
      user: user,
      apikey: apikey,
    },
    data: apikey,
    submit: {
      handler: async (data: FormData, passby: any) => {
        "use server";

        const { user, apikey } = passby;

        if (!apikey) {
          throw new Error("apikey not found");
        }

        if (!user) {
          throw new Error("no auth");
        }

        if (apikey.userId !== user.id) {
          throw new Error("no permission");
        }

        const title = data.get("title") as string;
        if (!title?.trim()) {
          throw new Error("title is required");
        }

        const key = `sk-${getNonceStr(32)}`;

        const updatedApikey: UpdateApikey = {
          title: title.trim(),
        };

        await updateApikey(apikey.id, updatedApikey);

        return {
          status: "success",
          message: "API Key updated",
          redirect_url: "/settings/api-keys",
        };
      },
      button: {
        title: "Update",
      },
    },
  };

  const crumbs: Crumb[] = [
    {
      title: "API Keys",
      url: "/settings/api-keys",
    },
    {
      title: "Edit",
      is_active: true,
    },
  ];

  return (
    <div className="space-y-8">
      <FormCard title="Edit API Key" crumbs={crumbs} form={form} />
    </div>
  );
}
