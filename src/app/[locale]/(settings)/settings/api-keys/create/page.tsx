import { getUserInfo } from "@/shared/services/user";
import { Empty } from "@/shared/blocks/common";
import { Form as FormType } from "@/shared/types/blocks/form";
import { FormCard } from "@/shared/blocks/form";
import { createApikey, NewApikey } from "@/shared/services/apikey";
import { getUuid, getNonceStr } from "@/shared/lib/hash";
import { ApikeyStatus } from "@/shared/services/apikey";
import { Crumb } from "@/shared/types/blocks/common";

export default async function CreateApiKeyPage() {
  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  const form: FormType = {
    title: "Create API Key",
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
    },
    submit: {
      handler: async (data: FormData, passby: any) => {
        "use server";

        const { user } = passby;
        if (!user) {
          throw new Error("no auth");
        }

        const title = data.get("title") as string;
        if (!title?.trim()) {
          throw new Error("title is required");
        }

        const key = `sk-${getNonceStr(32)}`;

        const newApikey: NewApikey = {
          id: getUuid(),
          userId: user.id,
          title: title.trim(),
          key: key,
          status: ApikeyStatus.ACTIVE,
        };

        await createApikey(newApikey);

        return {
          status: "success",
          message: "API Key created",
          redirect_url: "/settings/api-keys",
        };
      },
      button: {
        title: "Create",
      },
    },
  };

  const crumbs: Crumb[] = [
    {
      title: "API Keys",
      url: "/settings/api-keys",
    },
    {
      title: "Create",
      is_active: true,
    },
  ];

  return (
    <div className="space-y-8">
      <FormCard title="Create API Key" crumbs={crumbs} form={form} />
    </div>
  );
}
