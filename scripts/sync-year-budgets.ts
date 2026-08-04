/**
 * 補齊指定年度月度預算：金額全年大致固定（符合「預算大致不變」）。
 * - 4000 收入、5100 管理費：1–12 月同額
 * - 5000 營業成本：僅保留有實際／示範超支的月份，避免全年 0% 噪音
 *
 * Usage: npx tsx scripts/sync-year-budgets.ts [year]
 */
import { BudgetType, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** 全年固定月預算（略高於多數月份實際，僅少數月超支） */
const FLAT_REVENUE = 40000;
const FLAT_OPEX = 50000;
/** 1 月種子進貨暫估約 168500，預算刻意偏低以示範超支 */
const JAN_COGS_BUDGET = 140000;

async function main() {
  const year = Number.parseInt(process.argv[2] ?? String(new Date().getFullYear()), 10);
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  let upserted = 0;
  let removed = 0;

  for (const company of companies) {
    const gls = await prisma.glAccount.findMany({
      where: { companyId: company.id, code: { in: ["4000", "5000", "5100"] } },
      select: { id: true, code: true },
    });
    const byCode = Object.fromEntries(gls.map((g) => [g.code, g.id]));

    // 移除 2–12 月的 5000 預算（無實際時只會顯示 0%）
    if (byCode["5000"]) {
      const del = await prisma.budgetLine.deleteMany({
        where: {
          companyId: company.id,
          year,
          glAccountId: byCode["5000"],
          budgetType: BudgetType.EXPENSE,
          month: { gte: 2 },
        },
      });
      removed += del.count;
    }

    for (let month = 1; month <= 12; month++) {
      const specs: { code: string; budgetType: BudgetType; amount: number; note: string }[] = [
        {
          code: "4000",
          budgetType: BudgetType.REVENUE,
          amount: FLAT_REVENUE,
          note: "月度收入預算（全年固定）",
        },
        {
          code: "5100",
          budgetType: BudgetType.EXPENSE,
          amount: FLAT_OPEX,
          note: "月度管理費用預算（全年固定）",
        },
      ];
      if (month === 1) {
        specs.push({
          code: "5000",
          budgetType: BudgetType.EXPENSE,
          amount: JAN_COGS_BUDGET,
          note: "營業成本預算（1月進貨暫估）",
        });
      }

      for (const s of specs) {
        const glAccountId = byCode[s.code];
        if (!glAccountId) continue;
        await prisma.budgetLine.upsert({
          where: {
            companyId_year_month_glAccountId_budgetType: {
              companyId: company.id,
              year,
              month,
              glAccountId,
              budgetType: s.budgetType,
            },
          },
          create: {
            companyId: company.id,
            year,
            month,
            glAccountId,
            amount: s.amount,
            budgetType: s.budgetType,
            note: s.note,
          },
          update: { amount: s.amount, note: s.note },
        });
        upserted += 1;
      }
    }
    console.log(`公司 ${company.name}: upsert=${upserted} 段, 移除空成本預算=${removed}`);
  }

  console.log(
    `完成。固定預算：收入 $${FLAT_REVENUE}/月、管理費 $${FLAT_OPEX}/月；超支示範：1月成本、1月／4月管理費。`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
