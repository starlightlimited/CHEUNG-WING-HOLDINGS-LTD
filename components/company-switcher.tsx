import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";

function LogoutButton() {
  return (
    <form action={logoutAction} className="shrink-0">
      <button
        type="submit"
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        退出登入
      </button>
    </form>
  );
}

export function CompanySwitcher({
  companies,
  currentCompanyId,
  canManageCompanies,
  userLabel,
}: {
  companies: { id: string; name: string; code: string }[];
  currentCompanyId: string | null;
  /** @deprecated 已固定預設公司，不再提供切換；保留參數以免呼叫端破壞型變更 */
  showSwitcher?: boolean;
  canManageCompanies: boolean;
  userLabel: string;
}) {
  const current = companies.find((c) => c.id === currentCompanyId) ?? companies[0] ?? null;

  if (companies.length === 0) {
    return (
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-zinc-800 dark:bg-amber-950/30 dark:text-amber-100">
        <div className="min-w-0 flex-1">
          {canManageCompanies ? (
            <>
              尚未建立公司。請至
              <Link href="/data-entry/company-profile" className="mx-1 font-medium underline underline-offset-2">
                公司基本資料
              </Link>
              建立第一家公司。
            </>
          ) : (
            <>您尚未被分配至任何公司，請聯繫系統管理員。</>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden max-w-[12rem] truncate text-xs text-amber-900/80 dark:text-amber-100/80 sm:inline" title={userLabel}>
            {userLabel}
          </span>
          <LogoutButton />
        </div>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          當前公司：
          <span className="font-medium text-zinc-900 dark:text-zinc-50">{current?.name}</span>
          <span className="ml-2 font-mono text-xs text-zinc-500">({current?.code})</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <span
          className="hidden max-w-[12rem] truncate text-xs text-zinc-500 dark:text-zinc-400 sm:inline"
          title={userLabel}
        >
          {userLabel}
        </span>
        <LogoutButton />
      </div>
    </div>
  );
}
