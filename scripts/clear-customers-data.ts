import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * 清空指定公司下「客戶列表」對應的客戶主檔及必須先刪的關聯（銷售單據與明細、跟進記錄）。
 * 預收/應收/應付上對客戶的引用改為 SetNull（見 schema），不刪除分組與來源字典。
 */
async function clearCustomerListDomainForCompany(companyId: string) {
  await prisma.salesDocumentItem.deleteMany({
    where: { salesDocument: { companyId } },
  });
  await prisma.salesDocument.updateMany({
    where: { companyId },
    data: { parentId: null },
  });
  await prisma.salesDocument.deleteMany({ where: { companyId } });

  await prisma.customerFollowUp.deleteMany({
    where: { customer: { companyId } },
  });

  await prisma.customer.deleteMany({ where: { companyId } });
}

async function main() {
  const arg = process.argv[2];
  if (arg === "--all") {
    const companies = await prisma.company.findMany({ select: { id: true, code: true, name: true } });
    for (const c of companies) {
      await clearCustomerListDomainForCompany(c.id);
      console.log(`已清空客戶列表相關數據：${c.code}（${c.name}）`);
    }
    if (companies.length === 0) {
      console.log("資料庫中沒有公司記錄。");
    }
    return;
  }

  const code = arg || process.env.CLEAR_COMPANY_CODE || "CW";
  const company = await prisma.company.findUnique({
    where: { code },
    select: { id: true, name: true },
  });
  if (!company) {
    console.error(
      `找不到公司代碼「${code}」。請傳入：npx tsx scripts/clear-customers-data.ts <公司代碼>，或使用 --all 清空所有公司。`,
    );
    process.exit(1);
  }
  await clearCustomerListDomainForCompany(company.id);
  console.log(`已清空客戶列表相關數據：${code}（${company.name}）`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
