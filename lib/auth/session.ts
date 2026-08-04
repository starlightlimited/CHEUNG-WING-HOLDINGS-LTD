import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getAuthSecretKey } from "./secret";

export type SessionUser = {
  sub: string;
  email: string;
  name?: string | null;
  permissions?: string[];
  /** 公司內角色名稱（如 Admin、Staff）；舊 token 可能沒有 */
  roles?: string[];
  /** JWT 內可選；未帶則視為 false */
  isSuperAdmin?: boolean;
};

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get("tvp_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getAuthSecretKey());
    return {
      sub: String(payload.sub ?? ""),
      email: String(payload.email ?? ""),
      name: payload.name != null ? String(payload.name) : null,
      permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
      roles: Array.isArray(payload.roles)
        ? payload.roles.map((r) => String(r)).filter(Boolean)
        : [],
      isSuperAdmin: payload.isSuperAdmin === true,
    };
  } catch {
    return null;
  }
}
