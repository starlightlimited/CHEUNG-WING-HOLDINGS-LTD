import Link from "next/link";
import { getDefaultCompanyId } from "@/lib/company";
import { getCustomerAnalytics } from "@/lib/server/sales-customer-analytics";

export const dynamic = "force-dynamic";

export default async function CustomerAnalysisPage() {
  const companyId = await getDefaultCompanyId();
  const { customerSources, conversionRates, totalCustomers } =
    await getCustomerAnalytics(companyId);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">客戶分析 (Customer Analysis)</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            基於客戶檔案、跟進記錄與銷售單據（當前公司租戶）。
          </p>
        </div>
        <Link
          href="/sales/analysis"
          className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          銷售分析 →
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-sm font-semibold mb-1">客戶來源分佈</h3>
          <p className="mb-4 text-xs text-zinc-500">來自客戶檔案「來源」欄位；空白計入「未填寫」</p>
          <div className="space-y-4">
            {totalCustomers === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">暫無客戶檔案。</p>
            ) : customerSources.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">暫無來源數據。</p>
            ) : (
              customerSources.map((item) => (
                <div key={item.source}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{item.source}</span>
                    <span className="text-zinc-500">
                      {item.count} 家 ({item.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.min(item.percentage, 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-sm font-semibold mb-1">銷售漏斗（客戶數）</h3>
          <p className="mb-4 text-xs text-zinc-500">
            佔比均以客戶總數為分母；同一客戶可同時滿足多個階段
          </p>
          <div className="space-y-4">
            {totalCustomers === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">暫無漏斗數據。</p>
            ) : (
              conversionRates.map((item, index) => {
                const width = `${100 - index * 18}%`;
                return (
                  <div key={item.stage} className="flex flex-col items-center">
                    <div
                      className="flex items-center justify-between gap-3 px-4 py-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 rounded-md border border-indigo-100 dark:border-indigo-900/50"
                      style={{ width }}
                    >
                      <span className="text-sm font-medium">{item.stage}</span>
                      <span className="flex shrink-0 items-baseline gap-2">
                        <span className="text-sm font-bold">{item.count}</span>
                        <span className="text-xs font-normal opacity-80">{item.rate}</span>
                      </span>
                    </div>
                    {index < conversionRates.length - 1 && (
                      <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700 my-1" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
