import { prisma } from "@/lib/prisma";
import { getDefaultCompanyId } from "@/lib/company";
import { createJournalEntry } from "@/lib/server/actions";

export default async function NewJournalPage() {
  const companyId = await getDefaultCompanyId();
  const [accounts, categories] = await Promise.all([
    prisma.glAccount.findMany({
      where: { companyId, isActive: true },
      orderBy: { code: "asc" },
    }),
    prisma.accountingCategory.findMany({ where: { companyId }, orderBy: { code: "asc" } }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const rows = Array.from({ length: 8 }, (_, i) => i);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">新建憑證</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          至少兩行分錄；每行僅填借方或貸方；借貸合計必須相等。儲存後即視為正式帳並過帳至總帳明細。
        </p>
      </div>

      <form
        action={createJournalEntry}
        className="space-y-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">憑證日期</span>
            <input
              type="date"
              name="entryDate"
              defaultValue={today}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-zinc-600 dark:text-zinc-400">摘要</span>
            <input
              name="description"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              placeholder="可選"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="pb-2 pr-2">科目</th>
                <th className="pb-2 pr-2">類別</th>
                <th className="pb-2 pr-2">借方</th>
                <th className="pb-2 pr-2">貸方</th>
                <th className="pb-2">備註</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-2 pr-2">
                    <select
                      name={`line_${i}_account`}
                      className="w-full max-w-[220px] rounded-md border border-zinc-300 px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-950"
                      defaultValue=""
                    >
                      <option value="">—</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      name={`line_${i}_category`}
                      className="w-full max-w-[140px] rounded-md border border-zinc-300 px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-950"
                    >
                      <option value="">—</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      name={`line_${i}_debit`}
                      className="w-28 rounded-md border border-zinc-300 px-2 py-1.5 text-xs tabular-nums dark:border-zinc-600 dark:bg-zinc-950"
                      placeholder="0"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      name={`line_${i}_credit`}
                      className="w-28 rounded-md border border-zinc-300 px-2 py-1.5 text-xs tabular-nums dark:border-zinc-600 dark:bg-zinc-950"
                      placeholder="0"
                    />
                  </td>
                  <td className="py-2">
                    <input
                      name={`line_${i}_memo`}
                      className="w-full min-w-[120px] rounded-md border border-zinc-300 px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-950"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          儲存為草稿
        </button>
      </form>
    </div>
  );
}
