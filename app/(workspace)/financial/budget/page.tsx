import { prisma } from "@/lib/prisma";
import { getDefaultCompanyId } from "@/lib/company";
import { upsertBudgetLine } from "@/lib/server/actions";
import { cellKey, getYearBudgetActuals } from "@/lib/finance/budget-actuals";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string }>;
}) {
  const sp = await searchParams;
  const companyId = await getDefaultCompanyId();
  const now = new Date();
  const y = Number.parseInt(sp.y ?? String(now.getFullYear()), 10);
  const mo = now.getMonth() + 1;

  const [accounts, lines, actualsPack] = await Promise.all([
    prisma.glAccount.findMany({
      where: { companyId, isActive: true, type: { in: ["REVENUE", "EXPENSE"] } },
      orderBy: { code: "asc" },
    }),
    prisma.budgetLine.findMany({
      where: { companyId, year: y },
      include: { glAccount: true },
      orderBy: [{ month: "asc" }, { glAccount: { code: "asc" } }],
    }),
    getYearBudgetActuals(companyId, y),
  ]);

  type Row = {
    id: string;
    month: number;
    glAccountId: string;
    accountCode: string;
    accountName: string;
    budgetType: "REVENUE" | "EXPENSE";
    note: string | null;
    budget: number;
    actual: number;
    pending: number;
  };

  const rowMap = new Map<string, Row>();

  for (const l of lines) {
    const key = cellKey(l.month, l.glAccountId);
    const act = actualsPack.byKey.get(key);
    rowMap.set(key, {
      id: l.id,
      month: l.month,
      glAccountId: l.glAccountId,
      accountCode: l.glAccount.code,
      accountName: l.glAccount.name,
      budgetType: l.budgetType,
      note: l.note,
      budget: Number(l.amount),
      actual: act?.actual ?? 0,
      pending: l.budgetType === "EXPENSE" ? (act?.pending ?? 0) : 0,
    });
  }

  // 有實際發生、但尚未設定預算的科目也列出
  for (const cell of actualsPack.byKey.values()) {
    const key = cellKey(cell.month, cell.glAccountId);
    if (rowMap.has(key)) continue;
    if (cell.actual === 0 && cell.pending === 0) continue;
    rowMap.set(key, {
      id: `actual-${key}`,
      month: cell.month,
      glAccountId: cell.glAccountId,
      accountCode: cell.accountCode,
      accountName: cell.accountName,
      budgetType: cell.accountType,
      note: "尚無預算（已同步實際）",
      budget: 0,
      actual: cell.actual,
      pending: cell.accountType === "EXPENSE" ? cell.pending : 0,
    });
  }

  // 過去月份：預算有設但完全無實際／申請中 → 不佔表（避免整排 0%）
  const rows = [...rowMap.values()]
    .filter((r) => {
      if (r.actual !== 0 || r.pending !== 0) return true;
      if (r.budget <= 0) return false;
      // 當月及未來月保留規劃用預算列
      if (r.month >= mo) return true;
      return false;
    })
    .sort((a, b) => {
      if (a.month !== b.month) return a.month - b.month;
      return a.accountCode.localeCompare(b.accountCode);
    });

  // 超支只看「支出」預算；收入超過預算視為達成，不算超支
  const overspend = rows.filter((r) => {
    if (r.budgetType !== "EXPENSE" || r.budget <= 0) return false;
    return r.actual + r.pending > r.budget;
  });

  const yearRevBudget = rows
    .filter((r) => r.budgetType === "REVENUE")
    .reduce((s, r) => s + r.budget, 0);
  const yearExpBudget = rows
    .filter((r) => r.budgetType === "EXPENSE")
    .reduce((s, r) => s + r.budget, 0);
  const yearRevActual = actualsPack.monthlyTotals.reduce((s, m) => s + m.revenue, 0);
  const yearExpActual = actualsPack.monthlyTotals.reduce((s, m) => s + m.expense, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">月度預算統計與收支管理 (Budgeting)</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            預算來自設定；實際額同步自已過帳憑證（損益科目）；申請中為未支付請款。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <form method="get" action="/financial/budget" className="flex items-end gap-2">
            <label className="text-sm">
              年
              <input
                name="y"
                type="number"
                defaultValue={y}
                className="mt-1 ml-1 w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              />
            </label>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            >
              查詢
            </button>
          </form>
          {overspend.length > 0 ? (
            <span className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-200 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-100" />
              </span>
              超支預警: {overspend.length} 項
            </span>
          ) : (
            <span className="flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              超支預警: 正常
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label={`${y} 收入預算`} value={yearRevBudget} />
        <SummaryCard label={`${y} 收入實際`} value={yearRevActual} tone="emerald" />
        <SummaryCard label={`${y} 支出預算`} value={yearExpBudget} />
        <SummaryCard label={`${y} 支出實際`} value={yearExpActual} tone="red" />
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold">預算設定表單</h3>
        <form action={upsertBudgetLine} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            年
            <input
              name="year"
              type="number"
              defaultValue={y}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </label>
          <label className="text-sm">
            月
            <input
              name="month"
              type="number"
              min={1}
              max={12}
              defaultValue={mo}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </label>
          <label className="text-sm">
            預算類型
            <select
              name="budgetType"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              defaultValue="EXPENSE"
            >
              <option value="REVENUE">收入</option>
              <option value="EXPENSE">支出</option>
            </select>
          </label>
          <label className="text-sm">
            費用類別 / 科目
            <select
              name="glAccountId"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              required
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm lg:col-span-2">
            預算上限金額
            <input
              name="amount"
              type="number"
              step="0.01"
              placeholder="例如: 10000"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm tabular-nums dark:border-zinc-600 dark:bg-zinc-950"
              required
            />
          </label>
          <label className="text-sm lg:col-span-2">
            部門 / 備註
            <input
              name="note"
              placeholder="例如: 市場部"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </label>
          <div className="mt-2 sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              保存預算設定
            </button>
          </div>
        </form>
      </section>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h3 className="text-sm font-semibold">預算監控表格（{y}年 · 與總帳同步）</h3>
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">月份</th>
              <th className="px-4 py-3">類別 / 部門</th>
              <th className="px-4 py-3 text-right">預算總額</th>
              <th className="px-4 py-3 text-right">實際發生</th>
              <th className="px-4 py-3 text-right">申請中</th>
              <th className="px-4 py-3 text-right">剩餘可用</th>
              <th className="w-48 px-4 py-3">執行進度(%)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const used = r.actual + r.pending;
              const remaining = r.budget - used;
              const progress = r.budget > 0 ? (used / r.budget) * 100 : 0;
              const isRevenue = r.budgetType === "REVENUE";
              const isOver = r.budget > 0 && used > r.budget;
              // 收入超標=達成(綠)；支出超支=警示(紅)
              let progressColor = "bg-emerald-500";
              if (isOver) progressColor = isRevenue ? "bg-sky-500" : "bg-red-500";
              else if (progress > 80) progressColor = "bg-orange-500";

              const remainClass = !r.budget
                ? "text-zinc-500"
                : isOver
                  ? isRevenue
                    ? "text-sky-600 dark:text-sky-400"
                    : "text-red-600 dark:text-red-400"
                  : "text-emerald-600 dark:text-emerald-400";

              return (
                <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-3">{r.month}月</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {r.accountCode} {r.accountName}
                      <span className="ml-2 text-xs font-normal text-zinc-500">
                        {isRevenue ? "收入" : "支出"}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500">{r.note ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    ${r.budget.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                    ${r.actual.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-600 dark:text-amber-400">
                    ${r.pending.toFixed(2)}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium tabular-nums ${remainClass}`}>
                    {r.budget > 0 ? `$${remaining.toFixed(2)}` : "—"}
                    {isOver && isRevenue ? (
                      <span className="ml-1 text-xs font-normal">超標</span>
                    ) : null}
                    {isOver && !isRevenue ? (
                      <span className="ml-1 text-xs font-normal">超支</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div
                          className={`h-full ${progressColor}`}
                          style={{ width: `${r.budget > 0 ? Math.min(progress, 100) : 0}%` }}
                        />
                      </div>
                      <span
                        className={`w-9 text-right text-xs font-medium ${
                          isOver
                            ? isRevenue
                              ? "text-sky-600"
                              : "text-red-600"
                            : progress > 80
                              ? "text-orange-600"
                              : ""
                        }`}
                      >
                        {r.budget > 0 ? `${progress.toFixed(0)}%` : "—"}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-zinc-500">暫無預算與實際數據</p>
        ) : null}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "red";
}) {
  const valueClass =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "red"
        ? "text-red-700 dark:text-red-400"
        : "";
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${valueClass}`}>
        ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}
