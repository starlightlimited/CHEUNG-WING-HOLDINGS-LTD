import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_COMPANY_CODES = ["CW", "DEMO"] as const;
const SEED_ADMIN_EMAILS = ["admin@tvp.local", "demo@tvp.local"] as const;

/** 按外鍵依賴順序刪除單個公司下的所有業務數據（避免 PostgreSQL 級聯順序問題）。 */
async function deleteCompanyAndScopedRows(companyId: string) {
  const p = prisma;
  await p.salesDocumentItem.deleteMany({
    where: { salesDocument: { companyId } },
  });
  await p.salesDocument.updateMany({
    where: { companyId },
    data: { parentId: null },
  });
  await p.salesDocument.deleteMany({ where: { companyId } });

  await p.purchaseOrder.deleteMany({ where: { companyId } });

  await p.inventoryTransaction.deleteMany({ where: { companyId } });
  await p.inventoryBalance.deleteMany({ where: { companyId } });

  await p.paymentRequest.deleteMany({ where: { companyId } });
  await p.prepayment.deleteMany({ where: { companyId } });
  await p.accountsReceivable.deleteMany({ where: { companyId } });
  await p.accountsPayable.deleteMany({ where: { companyId } });

  await p.customerFollowUp.deleteMany({
    where: { customer: { companyId } },
  });
  await p.customer.deleteMany({ where: { companyId } });

  await p.customerGroup.deleteMany({ where: { companyId } });
  await p.customerSource.deleteMany({ where: { companyId } });

  await p.product.deleteMany({ where: { companyId } });

  await p.fileDocument.deleteMany({ where: { companyId } });
  await p.fileCategory.updateMany({
    where: { companyId },
    data: { parentId: null },
  });
  await p.fileCategory.deleteMany({ where: { companyId } });

  await p.budgetLine.deleteMany({ where: { companyId } });
  await p.journalEntry.deleteMany({ where: { companyId } });

  await p.documentNumberRule.deleteMany({ where: { companyId } });

  await p.userRole.deleteMany({ where: { companyId } });
  await p.rolePermission.deleteMany({
    where: { role: { companyId } },
  });
  await p.role.deleteMany({ where: { companyId } });

  await p.accountingCategory.deleteMany({ where: { companyId } });

  await p.glAccount.updateMany({
    where: { companyId },
    data: { parentId: null },
  });
  await p.glAccount.deleteMany({ where: { companyId } });

  await p.company.delete({ where: { id: companyId } });
}

async function main() {
  for (const code of SEED_COMPANY_CODES) {
    const company = await prisma.company.findUnique({ where: { code } });
    if (company) {
      await deleteCompanyAndScopedRows(company.id);
      console.log(`Removed company: ${code}`);
    } else {
      console.log(`No company with code ${code}`);
    }
  }

  for (const email of SEED_ADMIN_EMAILS) {
    const user = await prisma.user.deleteMany({ where: { email } });
    if (user.count > 0) {
      console.log(`Removed user: ${email}`);
    } else {
      console.log(`No user with email ${email}`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
