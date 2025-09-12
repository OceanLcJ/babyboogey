import { Header, Main, MainHeader } from "@/blocks/dashboard";
import { TableCard } from "@/blocks/table";
import { type Table } from "@/types/blocks/table";
import { getUsers } from "@/services/user";

export default async function AdminUsersPage() {
  const users = await getUsers();
  console.log(users);
  const table: Table = {
    columns: [
      { name: "id", title: "ID", type: "copy" },
      { name: "name", title: "Name" },
      { name: "image", title: "Avatar", type: "image" },
      { name: "email", title: "Email", type: "copy" },
      { name: "emailVerified", title: "Email Verified", type: "label" },
      { name: "createdAt", title: "Created At", type: "time" },
    ],
    data: users,
  };

  return (
    <>
      <Header />
      <Main>
        <MainHeader title="Users" />
        <TableCard table={table} />
      </Main>
    </>
  );
}
