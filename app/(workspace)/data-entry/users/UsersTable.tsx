"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { displayUserName } from "@/lib/user-display-name";
import UserEditDialog from "./UserEditDialog";

type Company = { id: string; name: string; code: string };

export type UserListRow = {
  id: string;
  email: string;
  name: string | null;
  isSuperAdmin: boolean;
  createdAt: string;
  roles: {
    companyId: string;
    role: { id: string; name: string };
    company: { id: string; name: string; code: string };
  }[];
};

export default function UsersTable({
  users,
  companies,
  defaultCompanyId,
  builtinRoleNames,
  currentUserId,
  superAdminCount,
  isPlatformSuperAdmin,
}: {
  users: UserListRow[];
  companies: Company[];
  defaultCompanyId: string;
  builtinRoleNames: string[];
  currentUserId: string;
  superAdminCount: number;
  /** 平台超管：可編輯超級管理員帳號與標記 */
  isPlatformSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserListRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const closeEdit = useCallback(() => setEditId(null), []);

  const canDelete = useCallback(
    (u: UserListRow) => {
      if (u.id === currentUserId) return false;
      if (u.isSuperAdmin && !isPlatformSuperAdmin) return false;
      if (u.isSuperAdmin && superAdminCount <= 1) return false;
      return true;
    },
    [currentUserId, superAdminCount, isPlatformSuperAdmin]
  );

  const canEditRow = useCallback(
    (u: UserListRow) => {
      if (u.isSuperAdmin && !isPlatformSuperAdmin) return false;
      return true;
    },
    [isPlatformSuperAdmin]
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeleteTarget(null);
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error || "刪除失敗");
      }
    } catch {
      alert("刪除失敗");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">用戶名稱</th>
              <th className="px-4 py-3">登錄郵箱</th>
              <th className="px-4 py-3">身份</th>
              <th className="px-4 py-3">分配角色</th>
              <th className="px-4 py-3">創建時間</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className="px-4 py-3 font-medium">{displayUserName(user.name) || "—"}</td>
                <td className="px-4 py-3 font-mono text-zinc-600 dark:text-zinc-400">{user.email}</td>
                <td className="px-4 py-3">
                  {user.isSuperAdmin ? (
                    <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
                      超級管理員
                    </span>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex max-w-md flex-wrap gap-1">
                    {user.roles.map((ur) => {
                      const multiCompany = companies.length > 1;
                      return (
                        <span
                          key={`${ur.companyId}-${ur.role.id}`}
                          className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                          title={ur.company.name}
                        >
                          {multiCompany ? `${ur.company.name} · ${ur.role.name}` : ur.role.name}
                        </span>
                      );
                    })}
                    {user.roles.length === 0 && <span className="text-zinc-400">無公司角色</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {canEditRow(user) ? (
                      <button
                        type="button"
                        onClick={() => setEditId(user.id)}
                        className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        編輯
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                    {canDelete(user) ? (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(user)}
                        className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
                      >
                        刪除
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  暫無用戶數據
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <UserEditDialog
        userId={editId}
        open={editId !== null}
        onClose={closeEdit}
        companies={companies}
        defaultCompanyId={defaultCompanyId}
        builtinRoleNames={builtinRoleNames}
        allowSuperAdminFields={isPlatformSuperAdmin}
      />

      {deleteTarget ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-lg font-semibold">確認刪除</h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              確定刪除用戶「{displayUserName(deleteTarget.name) || deleteTarget.email}」？其所有公司下的角色關聯將一併刪除，且不可復原。
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDelete()}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "刪除中…" : "刪除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
