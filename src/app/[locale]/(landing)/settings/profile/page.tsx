import { getUserInfo } from "@/shared/services/user";
import { Empty } from "@/shared/blocks/common";
import { Form as FormType } from "@/shared/types/blocks/form";
import { FormCard } from "@/shared/blocks/form";
import { UpdateUser, updateUser } from "@/shared/services/user";

export default async function ProfilePage() {
  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  const form: FormType = {
    fields: [
      {
        name: "email",
        title: "Email",
        type: "email",
        attributes: { disabled: true },
      },
      { name: "name", title: "Name", type: "text" },
      {
        name: "image",
        title: "Avatar",
        type: "upload_image",
        metadata: {
          max: 1,
        },
      },
    ],
    data: user,
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

        const name = data.get("name") as string;
        if (!name?.trim()) {
          throw new Error("name is required");
        }

        const image = data.get("image");
        console.log("image", image, typeof image);

        const updatedUser: UpdateUser = {
          name: name.trim(),
          image: image as string,
        };

        await updateUser(user.id, updatedUser);

        return {
          status: "success",
          message: "Profile updated",
          redirect_url: "/settings/profile",
        };
      },
      button: {
        title: "Save",
      },
    },
  };

  return (
    <div className="space-y-8">
      <FormCard title="Profile" description="Update your profile" form={form} />
    </div>
  );
}
