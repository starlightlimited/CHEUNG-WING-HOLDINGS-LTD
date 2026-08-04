"use server";

import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthSecretKey } from "./secret";

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const from = String(formData.get("from") ?? "").trim();

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      roles: {
        include: {
          role: {
            include: { permissions: { include: { permission: true } } },
          },
        },
      },
    },
  });

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    const q = new URLSearchParams({ error: "1" });
    if (from) q.set("from", from);
    redirect(`/?${q.toString()}`);
  }

  // Extract roles and permissions
  const permissions = user.roles.flatMap((ur) =>
    ur.role.permissions.map((rp) => `${rp.permission.action}:${rp.permission.resource}`)
  );
  const roleNames = Array.from(new Set(user.roles.map((ur) => ur.role.name).filter(Boolean)));

  const token = await new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
    permissions: Array.from(new Set(permissions)),
    roles: roleNames,
    isSuperAdmin: user.isSuperAdmin === true,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(getAuthSecretKey());

  (await cookies()).set("tvp_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });

  if (from.startsWith("/") && !from.startsWith("//")) {
    redirect(from);
  }
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete("tvp_session");
  (await cookies()).delete("tvp_active_company");
  redirect("/");
}
