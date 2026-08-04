import { prisma } from "@/lib/prisma";
import { getDefaultCompanyId } from "@/lib/company";
import type { SessionUser } from "@/lib/auth/session";

/**
 * 側欄左下角顯示用：目前登入角色（Admin / Staff 等）。
 * 平台超管優先顯示 Super Admin；否則取當前公司下的角色名，多個以「 / 」連接。
 */
export async function getSessionRoleLabel(session: SessionUser): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { isSuperAdmin: true },
  });
  if (user?.isSuperAdmin || session.isSuperAdmin) {
    return "Super Admin";
  }

  let companyId: string | null = null;
  try {
    companyId = await getDefaultCompanyId();
  } catch {
    companyId = null;
  }

  const roleRows = await prisma.userRole.findMany({
    where: companyId
      ? { userId: session.sub, companyId }
      : { userId: session.sub },
    select: { role: { select: { name: true } } },
    orderBy: { role: { name: "asc" } },
  });

  const names = Array.from(new Set(roleRows.map((r) => r.role.name).filter(Boolean)));
  if (names.length === 0) {
    if (session.roles && session.roles.length > 0) {
      return session.roles.join(" / ");
    }
    return "—";
  }
  return names.join(" / ");
}
