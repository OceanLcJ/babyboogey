import { user } from "@/config/db/schema";
import { db } from "@/core/db";
import { desc, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { getAuth } from "@/core/auth";
import { getRemainingCredits } from "./credit";
import { getUserRoles, getUserPermissions, Role, Permission } from "./rbac";

export interface UserCredits {
  remainingCredits: number;
  expiresAt: Date | null;
}

export type User = typeof user.$inferSelect & {
  credits?: UserCredits;
  roles?: Role[];
  permissions?: Permission[];
};
export type NewUser = typeof user.$inferInsert;
export type UpdateUser = Partial<Omit<NewUser, "id" | "createdAt" | "email">>;

export async function updateUser(userId: string, updatedUser: UpdateUser) {
  const [result] = await db()
    .update(user)
    .set(updatedUser)
    .where(eq(user.id, userId))
    .returning();

  return result;
}

export async function findUserById(userId: string) {
  const [result] = await db().select().from(user).where(eq(user.id, userId));

  return result;
}

export async function getUsers({
  page = 1,
  limit = 30,
}: {
  page?: number;
  limit?: number;
} = {}): Promise<User[]> {
  const result = await db()
    .select()
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  return result;
}

export async function getUserByUserIds(userIds: string[]) {
  const result = await db()
    .select()
    .from(user)
    .where(inArray(user.id, userIds));

  return result;
}

export async function getUserInfo() {
  const signUser = await getSignUser();

  return signUser;
}

export async function getUserCredits(userId: string) {
  const remainingCredits = await getRemainingCredits(userId);

  return { remainingCredits };
}

export async function getSignUser() {
  const auth = await getAuth();
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user;
}

export async function appendUserToResult(result: any) {
  if (!result || !result.length) {
    return result;
  }

  const userIds = result.map((item: any) => item.userId);
  const users = await getUserByUserIds(userIds);
  result = result.map((item: any) => {
    const user = users.find((user: any) => user.id === item.userId);
    return { ...item, user };
  });

  return result;
}
