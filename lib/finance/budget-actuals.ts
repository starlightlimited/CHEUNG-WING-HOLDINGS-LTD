import { prisma } from "@/lib/prisma";
import { fetchPostedLines } from "@/lib/finance/reports";

function monthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);
  return { start, end };
}

export type BudgetActualCell = {
  glAccountId: string;
  accountCode: string;
  accountName: string;
  accountType: "REVENUE" | "EXPENSE";
  month: number;
  /** 已過帳憑證實際發生額 */
  actual: number;
  /** 申請中請款（SUBMITTED／APPROVED），歸入 5100 */
  pending: number;
};

function cellKey(month: number, glAccountId: string) {
  return `${month}:${glAccountId}`;
}

/**
 * 依年彙總各月各損益科目實際額（POSTED 憑證）＋未支付請款 pending。
 * 實際額不寫入 BudgetLine，查詢時與總帳同步。
 */
export async function getYearBudgetActuals(
  companyId: string,
  year: number,
): Promise<{
  byKey: Map<string, BudgetActualCell>;
  monthlyTotals: { month: number; revenue: number; expense: number }[];
  expenseGl5100Id: string | null;
}> {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);

  const [lines, accounts, pendingPrs] = await Promise.all([
    fetchPostedLines(companyId, { start: yearStart, end: yearEnd }),
    prisma.glAccount.findMany({
      where: { companyId, isActive: true, type: { in: ["REVENUE", "EXPENSE"] } },
      select: { id: true, code: true, name: true, type: true },
    }),
    prisma.paymentRequest.findMany({
      where: {
        companyId,
        status: { in: ["SUBMITTED", "APPROVED"] },
        createdAt: { gte: yearStart, lte: yearEnd },
      },
      select: { amount: true, createdAt: true },
    }),
  ]);

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const expenseGl5100Id = accounts.find((a) => a.code === "5100")?.id ?? null;
  const byKey = new Map<string, BudgetActualCell>();

  const ensure = (month: number, glAccountId: string): BudgetActualCell | null => {
    const acc = accountById.get(glAccountId);
    if (!acc || (acc.type !== "REVENUE" && acc.type !== "EXPENSE")) return null;
    const key = cellKey(month, glAccountId);
    let cell = byKey.get(key);
    if (!cell) {
      cell = {
        glAccountId,
        accountCode: acc.code,
        accountName: acc.name,
        accountType: acc.type,
        month,
        actual: 0,
        pending: 0,
      };
      byKey.set(key, cell);
    }
    return cell;
  };

  for (const l of lines) {
    const t = l.glAccount.type;
    if (t !== "REVENUE" && t !== "EXPENSE") continue;
    const month = l.journalEntry.entryDate.getMonth() + 1;
    const cell = ensure(month, l.glAccountId);
    if (!cell) continue;
    if (t === "REVENUE") {
      cell.actual += Number(l.credit) - Number(l.debit);
    } else {
      cell.actual += Number(l.debit) - Number(l.credit);
    }
  }

  if (expenseGl5100Id) {
    for (const pr of pendingPrs) {
      const month = pr.createdAt.getMonth() + 1;
      const cell = ensure(month, expenseGl5100Id);
      if (cell) cell.pending += Number(pr.amount);
    }
  }

  const monthlyTotals = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    let revenue = 0;
    let expense = 0;
    for (const cell of byKey.values()) {
      if (cell.month !== month) continue;
      if (cell.accountType === "REVENUE") revenue += cell.actual;
      else expense += cell.actual;
    }
    return { month, revenue, expense };
  });

  return { byKey, monthlyTotals, expenseGl5100Id };
}

export async function getMonthBudgetActuals(companyId: string, year: number, month: number) {
  const { byKey } = await getYearBudgetActuals(companyId, year);
  const out: BudgetActualCell[] = [];
  for (const cell of byKey.values()) {
    if (cell.month === month) out.push(cell);
  }
  return out;
}

export { monthRange, cellKey };
