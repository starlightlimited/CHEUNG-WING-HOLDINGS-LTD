import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** 刪除指定公司下與產品主檔相關的數據（含阻擋刪除產品的銷售/採購明細與庫存流水）。單據頭（報價/合同/採購單）保留，合計金額歸零。 */
async function clearProductDomainForCompany(companyId: string) {
  await prisma.salesDocumentItem.deleteMany({
    where: { salesDocument: { companyId } },
  });
  await prisma.salesDocument.updateMany({
    where: { companyId },
    data: { totalAmount: 0 },
  });

  await prisma.purchaseOrderItem.deleteMany({
    where: { purchaseOrder: { companyId } },
  });
  await prisma.purchaseOrder.updateMany({
    where: { companyId },
    data: { totalAmount: 0 },
  });

  await prisma.inventoryTransaction.deleteMany({ where: { companyId } });
  await prisma.inventoryBalance.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
}

async function main() {
  const arg = process.argv[2];
  if (arg === "--all") {
    const companies = await prisma.company.findMany({ select: { id: true, code: true, name: true } });
    for (const c of companies) {
      await clearProductDomainForCompany(c.id);
      console.log(`已清空產品相關數據：${c.code}（${c.name}）`);
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
      `找不到公司代碼「${code}」。請傳入：npx tsx scripts/clear-products-data.ts <公司代碼>，或使用 --all 清空所有公司。`,
    );
    process.exit(1);
  }
  await clearProductDomainForCompany(company.id);
  console.log(`已清空產品相關數據：${code}（${company.name}）`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
