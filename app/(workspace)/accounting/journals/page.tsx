import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getDefaultCompanyId } from "@/lib/company";
import { JOURNAL_SOURCE_PAYMENT_REQUEST } from "@/lib/finance/sync-payment-request-journal";
import { cn } from "@/lib/utils";

export default async function JournalsPage() {
  const companyId = await getDefaultCompanyId();
  let entries = await prisma.journalEntry.findMany({
    where: { companyId },
    orderBy: [{ entryDate: "desc" }, { entryNo: "desc" }],
    include: {
      lines: { include: { glAccount: { select: { code: true, name: true } } } },
    },
    take: 100,
  });

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, code: true },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">會計憑證</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            列表僅顯示<strong className="font-medium text-zinc-800 dark:text-zinc-200">實際入帳</strong>
            ：手動建立之草稿／已過帳憑證，以及請款單標記「已支付」時自動產生之已過帳憑證。
          </p>
        </div>
        <Link
          href="/accounting/journals/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          新建憑證
        </Link>
      </div>
      <div className="space-y-4">
        {entries.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-6 dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              目前工作公司「{company?.name ?? "—"}（{company?.code ?? "—"}）」尚無會計憑證。
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
              <li>
                可點右上角<strong className="font-medium text-zinc-800 dark:text-zinc-200">新建憑證</strong>
                手動入帳；請款單改為「已支付」後也會自動產生憑證。
              </li>
              <li>
                若需重新初始化種子資料，請在專案目錄執行{" "}
                <code className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                  npm run db:seed
                </code>
                。
              </li>
            </ul>
          </div>
        ) : null}
        {entries.map((e) => {
          const href = "/accounting/journals/" + e.id;
          const posted = e.status === "POSTED";
          const badge = posted
            ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
            : "rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100";
          const label = posted ? "已過帳" : "草稿";
          return (
            <article
              key={e.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-baseline gap-3">
                <Link href={href} className="font-mono text-sm font-semibold hover:underline">
                  {e.entryNo}
                </Link>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {e.entryDate.toLocaleDateString("zh-CN")}
                </span>
                <span className={badge}>{label}</span>
                {e.sourceType === JOURNAL_SOURCE_PAYMENT_REQUEST && e.sourceId ? (
                  <Link
                    href="/financial/payment-requests"
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      "bg-violet-100 text-violet-900 hover:underline dark:bg-violet-950/50 dark:text-violet-200",
                    )}
                  >
                    來源：請款單
                  </Link>
                ) : null}
              </div>
              {e.description ? (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{e.description}</p>
              ) : null}
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {e.lines.map((l) => (
                    <tr key={l.id} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="py-2 pr-2">
                        {l.glAccount.code} {l.glAccount.name}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                        {l.debit.gt(0) ? l.debit.toFixed(2) : ""}
                      </td>
                      <td className="py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                        {l.credit.gt(0) ? l.credit.toFixed(2) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          );
        })}
      </div>
    </div>
  );
}
