"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireAdminUser } from "./admin";

export async function updateUserRole(userId: string, role: "USER" | "ADMIN") {
  await requireAdminUser();

  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  revalidatePath("/admin/users");
}

export async function getUsers() {
  await requireAdminUser();

  return prisma.user.findMany({
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
