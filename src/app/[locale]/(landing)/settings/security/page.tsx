import { getUserInfo } from "@/shared/services/user";
import { Empty } from "@/shared/blocks/common";
import { Form as FormType } from "@/shared/types/blocks/form";
import { UpdateUser, updateUser } from "@/shared/services/user";
import { PanelCard } from "@/shared/blocks/panel";
import { Button as ButtonType } from "@/shared/types/blocks/common";

export default async function SecurityPage() {
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
      {
        name: "password",
        title: "Current Password",
        type: "password",
        attributes: { type: "password" },
        validation: { required: true },
      },
      {
        name: "new_password",
        title: "New Password",
        type: "password",
        validation: { required: true },
      },
      {
        name: "confirm_password",
        title: "Confirm Password",
        type: "password",
        validation: { required: true },
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

        const password = data.get("password") as string;
        if (!password?.trim()) {
          throw new Error("password is required");
        }

        const updatedUser: UpdateUser = {
          // password: password.trim(),
          // new_password: new_password.trim(),
          // confirm_password: confirm_password.trim(),
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
      <PanelCard
        title="Reset Password"
        description="Reset your sign-in password"
        content="We will send you an email to reset your password."
        buttons={[
          {
            title: "Reset Password",
            url: "/settings/security",
            target: "_self",
            variant: "default",
            size: "sm",
            icon: "RiLockPasswordLine",
          },
        ]}
        className="max-w-md"
      />
      <PanelCard
        title="Delete Account"
        description="Permantly delete your account"
        content="Are you sure you want to delete your account? This action cannot be undone."
        buttons={[
          {
            title: "Delete Account",
            url: "/settings/security",
            target: "_self",
            variant: "destructive",
            size: "sm",
            icon: "RiDeleteBinLine",
          },
        ]}
        className="max-w-md"
      />
    </div>
  );
}
