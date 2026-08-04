import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * 清空財務模組相關業務資料（不動會計科目、憑證、銷售單據）。
 * 刪除順序：ApprovalLog → PaymentRequest → Prepayment → BudgetLine
 *
 * 用法：
 *   npx tsx scripts/clear-financial-data.ts              # 預設：最早建立的 Company
 *   npx tsx scripts/clear-financial-data.ts CW         # 指定公司 code
 *
 * 環境變數（可選）：CLEAR_FINANCIAL_COMPANY_CODE=CW
 */
async function resolveCompanyId(): Promise<string | null> {
  const fromEnv = process.env.CLEAR_FINANCIAL_COMPANY_CODE?.trim();
  const fromArg = process.argv[2]?.trim();
  const code = fromArg || fromEnv;
  if (code) {
    const c = await prisma.company.findUnique({
      where: { code },
      select: { id: true, code: true, name: true },
    });
    if (!c) {
      console.error(`No company with code: ${code}`);
      return null;
    }
    console.log(`Target company: ${c.code} (${c.name})`);
    return c.id;
  }
  const first = await prisma.company.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, code: true, name: true },
  });
  if (!first) {
    console.error("No company in database.");
    return null;
  }
  console.log(`Target company (first by createdAt): ${first.code} (${first.name})`);
  return first.id;
}

async function clearFinancialScopedRows(companyId: string) {
  const r1 = await prisma.approvalLog.deleteMany({ where: { companyId } });
  const r2 = await prisma.paymentRequest.deleteMany({ where: { companyId } });
  const r3 = await prisma.prepayment.deleteMany({ where: { companyId } });
  const r4 = await prisma.budgetLine.deleteMany({ where: { companyId } });
  console.log(
    `Deleted: ApprovalLog=${r1.count}, PaymentRequest=${r2.count}, Prepayment=${r3.count}, BudgetLine=${r4.count}`
  );
}

async function main() {
  const companyId = await resolveCompanyId();
  if (!companyId) {
    process.exitCode = 1;
    return;
  }
  await clearFinancialScopedRows(companyId);
  console.log("Clear financial data OK.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
