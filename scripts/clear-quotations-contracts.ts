import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * 清除指定公司下的報價單與銷售合同（SalesDocument：QUOTATION、CONTRACT）。
 * - 將仍掛在這些單據下的子單 parentId 置空（常見：預收發票掛在合同上）
 * - 解除預收款上 linkedDocumentType=CONTRACT 且指向本批合同的關聯（id 或合同編號）
 * - 可選將單號規則 QUOTATION / CONTRACT 的 currentSeq 歸零（與 --no-reset-seq 關閉）
 *
 * 用法：
 *   npx tsx scripts/clear-quotations-contracts.ts
 *   npx tsx scripts/clear-quotations-contracts.ts CW
 *   npx tsx scripts/clear-quotations-contracts.ts CW --no-reset-seq
 *   npx tsx scripts/clear-quotations-contracts.ts CW --reset-seq   # 無單據時仍歸零單號序號
 *
 * 環境變數（可選）：CLEAR_SALES_QC_COMPANY_CODE=CW
 */
async function resolveCompanyId(): Promise<string | null> {
  const fromEnv = process.env.CLEAR_SALES_QC_COMPANY_CODE?.trim();
  const arg = process.argv[2]?.trim();
  const code = arg && !arg.startsWith("--") ? arg : fromEnv;
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

function wantForceResetSeq(): boolean {
  return process.argv.includes("--reset-seq");
}

function wantNoResetSeq(): boolean {
  return process.argv.includes("--no-reset-seq");
}

async function main() {
  const companyId = await resolveCompanyId();
  if (!companyId) {
    process.exitCode = 1;
    return;
  }

  const qcDocs = await prisma.salesDocument.findMany({
    where: { companyId, type: { in: ["QUOTATION", "CONTRACT"] } },
    select: { id: true, documentNo: true, type: true },
  });
  const ids = qcDocs.map((d) => d.id);
  const contracts = qcDocs.filter((d) => d.type === "CONTRACT");
  const contractIds = contracts.map((d) => d.id);
  const contractNos = contracts.map((d) => d.documentNo);

  let deletedCount = 0;
  if (ids.length === 0) {
    console.log("No QUOTATION or CONTRACT rows.");
  } else {
    const u1 = await prisma.salesDocument.updateMany({
      where: { companyId, parentId: { in: ids } },
      data: { parentId: null },
    });
    console.log(`Cleared parentId on ${u1.count} document(s) that pointed at removed quotes/contracts.`);

    let prepUnlinked = 0;
    if (contractIds.length > 0) {
      const r = await prisma.prepayment.updateMany({
        where: {
          companyId,
          linkedDocumentType: "CONTRACT",
          linkedDocumentId: { in: contractIds },
        },
        data: { linkedDocumentType: null, linkedDocumentId: null },
      });
      prepUnlinked += r.count;
    }
    if (contractNos.length > 0) {
      const r = await prisma.prepayment.updateMany({
        where: {
          companyId,
          linkedDocumentType: "CONTRACT",
          linkedDocumentId: { in: contractNos },
        },
        data: { linkedDocumentType: null, linkedDocumentId: null },
      });
      prepUnlinked += r.count;
    }
    console.log(`Unlinked prepayments (CONTRACT by id or documentNo): ${prepUnlinked} row(s) updated.`);

    const del = await prisma.salesDocument.deleteMany({
      where: { companyId, type: { in: ["QUOTATION", "CONTRACT"] } },
    });
    deletedCount = del.count;
    console.log(`Deleted SalesDocument (QUOTATION+CONTRACT): ${del.count}`);
  }

  const shouldResetSeq =
    !wantNoResetSeq() && (deletedCount > 0 || wantForceResetSeq());
  if (shouldResetSeq) {
    const rules = await prisma.documentNumberRule.updateMany({
      where: { companyId, documentType: { in: ["QUOTATION", "CONTRACT"] } },
      data: { currentSeq: 0 },
    });
    console.log(`Reset document number rules (QUOTATION/CONTRACT): ${rules.count} row(s).`);
  } else if (wantNoResetSeq()) {
    console.log("Skipped document number rule reset (--no-reset-seq).");
  } else {
    console.log("Skipped document number rule reset (nothing deleted; use --reset-seq to force).");
  }

  console.log("Clear quotations/contracts OK.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
