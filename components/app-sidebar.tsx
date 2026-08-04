"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { NAV_SECTIONS } from "@/config/navigation";
import { logoutAction } from "@/lib/auth/actions";

function sectionOpenDefault(pathname: string) {
  const init: Record<string, boolean> = {};
  for (const s of NAV_SECTIONS) {
    init[s.id] = s.items.some((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
  }
  return init;
}

export function AppSidebar({
  roleLabel,
  userName,
}: {
  /** 目前登入角色，如 Admin、Staff、Admin / Staff */
  roleLabel: string;
  userName?: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>(() => sectionOpenDefault(pathname));

  const mergedOpen = useMemo(() => {
    const next = { ...open };
    for (const s of NAV_SECTIONS) {
      if (s.items.some((i) => pathname === i.href || pathname.startsWith(i.href + "/"))) {
        next[s.id] = true;
      }
    }
    return next;
  }, [pathname, open]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Cheung Wing Holdings Limited
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV_SECTIONS.map((section) => {
          const isOpen = mergedOpen[section.id] ?? false;
          return (
            <div key={section.id} className="mb-1">
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [section.id]: !isOpen }))}
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <span className="pr-2 leading-snug">{section.title}</span>
                <span className="shrink-0 text-zinc-400">{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen ? (
                <ul className="ml-1 border-l border-zinc-200 pb-2 pl-2 dark:border-zinc-700">
                  {section.items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={
                            active
                              ? "block rounded-md bg-zinc-900 px-2 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
                              : "block rounded-md px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          }
                        >
                          {item.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        <div className="mb-2 px-1">
          {userName ? (
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100" title={userName}>
              {userName}
            </p>
          ) : null}
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400" title={roleLabel}>
            登入角色：{roleLabel}
          </p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            退出登入
          </button>
        </form>
      </div>
    </aside>
  );
}
