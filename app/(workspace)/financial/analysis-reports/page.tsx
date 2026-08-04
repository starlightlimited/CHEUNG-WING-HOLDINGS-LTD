import { prisma } from "@/lib/prisma";
import { getDefaultCompanyId } from "@/lib/company";
import { getYearBudgetActuals } from "@/lib/finance/budget-actuals";

export default async function AnalysisReportsPage() {
  const companyId = await getDefaultCompanyId();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [actuals, budgets, pendingAr] = await Promise.all([
    getYearBudgetActuals(companyId, year),
    prisma.budgetLine.findMany({
      where: { companyId, year, month },
      select: { amount: true, budgetType: true },
    }),
    prisma.accountsReceivable.aggregate({
      where: { companyId, status: { in: ["OPEN", "PARTIAL"] } },
      _sum: { amount: true, receivedAmount: true },
    }),
  ]);

  const thisMonth = actuals.monthlyTotals.find((m) => m.month === month) ?? {
    month,
    revenue: 0,
    expense: 0,
  };
  const prevMonthNum = month === 1 ? 12 : month - 1;
  const prevYearPack =
    month === 1 ? await getYearBudgetActuals(companyId, year - 1) : actuals;
  const prevMonth =
    prevYearPack.monthlyTotals.find((m) => m.month === prevMonthNum) ?? {
      month: prevMonthNum,
      revenue: 0,
      expense: 0,
    };

  const revChange =
    prevMonth.revenue > 0
      ? ((thisMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100
      : thisMonth.revenue > 0
        ? 100
        : 0;
  const expChange =
    prevMonth.expense > 0
      ? ((thisMonth.expense - prevMonth.expense) / prevMonth.expense) * 100
      : thisMonth.expense > 0
        ? 100
        : 0;

  // 近 6 個月（含當月）
  const monthlyData: { label: string; revenue: number; expense: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const pack = y === year ? actuals : await getYearBudgetActuals(companyId, y);
    const row = pack.monthlyTotals.find((x) => x.month === m);
    monthlyData.push({
      label: `${y}年${m}月`,
      revenue: row?.revenue ?? 0,
      expense: row?.expense ?? 0,
    });
  }

  const nextMonthBudgetExp = (
    await prisma.budgetLine.findMany({
      where: {
        companyId,
        year: month === 12 ? year + 1 : year,
        month: month === 12 ? 1 : month + 1,
        budgetType: "EXPENSE",
      },
      select: { amount: true },
    })
  ).reduce((s, b) => s + Number(b.amount), 0);

  const arOpen =
    Number(pendingAr._sum.amount ?? 0) - Number(pendingAr._sum.receivedAmount ?? 0);
  const cashGap = Math.max(0, nextMonthBudgetExp - Math.max(0, arOpen));

  const maxVal = Math.max(
    1,
    ...monthlyData.map((d) => Math.max(d.revenue, d.expense)),
  );

  // 多維表：本月有實際的科目
  const monthCells = [...actuals.byKey.values()]
    .filter((c) => c.month === month && (c.actual !== 0 || c.pending !== 0))
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const budgetRev = budgets
    .filter((b) => b.budgetType === "REVENUE")
    .reduce((s, b) => s + Number(b.amount), 0);
  const budgetExp = budgets
    .filter((b) => b.budgetType === "EXPENSE")
    .reduce((s, b) => s + Number(b.amount), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">財務分析報告 (Reporting)</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            數據同步自已過帳憑證與月度預算（{year}年{month}月）。
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-sm font-medium text-zinc-500">本月實際收入</h3>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight tabular-nums">
              ${thisMonth.revenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
            <span
              className={`text-sm font-medium ${revChange >= 0 ? "text-emerald-600" : "text-red-600"}`}
            >
              {revChange >= 0 ? "+" : ""}
              {revChange.toFixed(0)}%
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            預算 ${budgetRev.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-sm font-medium text-zinc-500">本月實際支出</h3>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight tabular-nums">
              ${thisMonth.expense.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
            <span
              className={`text-sm font-medium ${expChange <= 0 ? "text-emerald-600" : "text-red-600"}`}
            >
              {expChange >= 0 ? "+" : ""}
              {expChange.toFixed(0)}%
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            預算 ${budgetExp.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-900/50 dark:bg-red-950/30">
          <h3 className="text-sm font-medium text-red-800 dark:text-red-300">下月現金流預警</h3>
          <div className="mt-2 text-sm text-red-700 dark:text-red-400">
            預計下月支出預算 <strong>${nextMonthBudgetExp.toLocaleString("en-US", { maximumFractionDigits: 0 })}</strong>
            ，未收應收 <strong>${Math.max(0, arOpen).toLocaleString("en-US", { maximumFractionDigits: 0 })}</strong>。
            <div className="mt-1 font-medium">
              預計資金缺口: ${cashGap.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-6 text-sm font-semibold">收支對照（近6個月 · 總帳同步）</h3>
        <div className="flex h-64 items-end justify-between gap-2 pt-4 sm:gap-6">
          {monthlyData.map((d) => {
            const revHeight = (d.revenue / maxVal) * 100;
            const expHeight = (d.expense / maxVal) * 100;
            return (
              <div key={d.label} className="group flex flex-1 flex-col items-center">
                <div className="mb-2 flex h-48 w-full items-end justify-center gap-1">
                  <div
                    className="relative w-1/3 max-w-[2rem] rounded-t-sm bg-emerald-400 dark:bg-emerald-500"
                    style={{ height: `${Math.max(revHeight, d.revenue > 0 ? 2 : 0)}%` }}
                    title={`收入: $${d.revenue.toFixed(0)}`}
                  />
                  <div
                    className="relative w-1/3 max-w-[2rem] rounded-t-sm bg-red-400 dark:bg-red-500"
                    style={{ height: `${Math.max(expHeight, d.expense > 0 ? 2 : 0)}%` }}
                    title={`支出: $${d.expense.toFixed(0)}`}
                  />
                </div>
                <span className="text-xs text-zinc-500">{d.label}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-sm bg-emerald-400 dark:bg-emerald-500" />
            <span className="text-zinc-600 dark:text-zinc-400">實際收入</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-sm bg-red-400 dark:bg-red-500" />
            <span className="text-zinc-600 dark:text-zinc-400">實際支出</span>
          </div>
        </div>
      </section>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-semibold">本月科目彙總（同步自總帳）</h3>
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">科目</th>
              <th className="px-4 py-3">類型</th>
              <th className="px-4 py-3 text-right">實際</th>
              <th className="px-4 py-3 text-right">申請中</th>
              <th className="px-4 py-3 text-right">淨影響</th>
            </tr>
          </thead>
          <tbody>
            {monthCells.map((d) => {
              const net = d.accountType === "REVENUE" ? d.actual : -d.actual - d.pending;
              return (
                <tr key={`${d.month}-${d.glAccountId}`} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-2 font-medium">
                    {d.accountCode} {d.accountName}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {d.accountType === "REVENUE" ? "收入" : "支出"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    ${d.actual.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-amber-600">
                    ${d.pending.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td
                    className={`px-4 py-2 text-right font-medium tabular-nums ${
                      net >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    ${net.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {monthCells.length === 0 ? (
          <p className="p-6 text-center text-sm text-zinc-500">本月尚無已過帳損益分錄。</p>
        ) : null}
      </div>
    </div>
  );
}
