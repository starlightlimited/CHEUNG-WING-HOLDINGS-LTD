import type { PrismaClient } from "@prisma/client";
import { syncNutCatalog } from "@/app/(workspace)/products/list/nut-catalog";
import {
  ensurePermissionCatalog,
  seedDefaultRolesForCompany,
} from "@/lib/rbac/seed-company-rbac";
import { DEFAULT_COMPANY_CODE, LEGACY_COMPANY_CODES } from "@/lib/company-constants";

export type SyncSystemMasterSummary = {
  sourceFound: boolean;
  targets: { code: string; chartCopied: boolean; rulesCopied: boolean; nutSynced: boolean }[];
};

/**
 * 將預設公司的「系統主數據」模板同步到其他公司（冪等、不覆寫已有總帳科目）。
 * - 全域：補齊 Permission 目錄。
 * - 每家公司：補齊預設「公司角色」等（seedDefaultRolesForCompany）。
 * - 若目標公司尚無總帳科目：從預設公司複製會計類別 + 科目（含 parent 順序）。
 * - 若目標公司尚無任何單號規則：從預設公司複製 DocumentNumberRule。
 * - 每家公司執行 syncNutCatalog（堅果主數據 SKU，與 seed 一致）。
 */
export async function syncSystemMaster(
  db: PrismaClient,
  options?: { targetCompanyCode?: string },
): Promise<SyncSystemMasterSummary> {
  const summary: SyncSystemMasterSummary = { sourceFound: false, targets: [] };

  let source = await db.company.findFirst({
    where: { code: DEFAULT_COMPANY_CODE },
    select: { id: true, code: true },
  });
  if (!source) {
    for (const code of LEGACY_COMPANY_CODES) {
      source = await db.company.findFirst({
        where: { code },
        select: { id: true, code: true },
      });
      if (source) break;
    }
  }
  if (!source) return summary;
  summary.sourceFound = true;

  await ensurePermissionCatalog(db);

  const codeFilter = options?.targetCompanyCode?.trim();
  const list = await db.company.findMany({
    where: codeFilter ? { code: codeFilter } : undefined,
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  if (codeFilter && list.length === 0) {
    return summary;
  }

  for (const company of list) {
    await seedDefaultRolesForCompany(db, company.id);

    const glCount = await db.glAccount.count({ where: { companyId: company.id } });
    const chartCopied = company.id !== source.id && glCount === 0;

    if (chartCopied) {
      const sourceCats = await db.accountingCategory.findMany({
        where: { companyId: source.id },
        orderBy: { code: "asc" },
      });
      for (const c of sourceCats) {
        await db.accountingCategory.upsert({
          where: { companyId_code: { companyId: company.id, code: c.code } },
          create: {
            companyId: company.id,
            code: c.code,
            name: c.name,
            description: c.description,
          },
          update: { name: c.name, description: c.description },
        });
      }

      const sourceGl = await db.glAccount.findMany({
        where: { companyId: source.id },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      });
      const roots = sourceGl.filter((a) => !a.parentId);
      const childs = sourceGl.filter((a) => a.parentId);
      const ordered = [...roots, ...childs];
      const idMap = new Map<string, string>();

      for (const a of ordered) {
        let parentNew: string | null = null;
        if (a.parentId) {
          parentNew = idMap.get(a.parentId) ?? null;
        }
        const row = await db.glAccount.upsert({
          where: { companyId_code: { companyId: company.id, code: a.code } },
          create: {
            companyId: company.id,
            code: a.code,
            name: a.name,
            type: a.type,
            parentId: parentNew,
            isActive: a.isActive,
            sortOrder: a.sortOrder,
          },
          update: {
            name: a.name,
            type: a.type,
            parentId: parentNew,
            isActive: a.isActive,
            sortOrder: a.sortOrder,
          },
        });
        idMap.set(a.id, row.id);
      }
    }

    const ruleCount = await db.documentNumberRule.count({
      where: { companyId: company.id },
    });
    const rulesCopied = company.id !== source.id && ruleCount === 0;
    if (rulesCopied) {
      const sourceRules = await db.documentNumberRule.findMany({
        where: { companyId: source.id },
      });
      for (const r of sourceRules) {
        await db.documentNumberRule.upsert({
          where: {
            companyId_documentType: {
              companyId: company.id,
              documentType: r.documentType,
            },
          },
          create: {
            companyId: company.id,
            documentType: r.documentType,
            prefix: r.prefix,
            dateFormat: r.dateFormat,
            sequenceLen: r.sequenceLen,
            currentSeq: r.currentSeq,
          },
          update: {
            prefix: r.prefix,
            dateFormat: r.dateFormat,
            sequenceLen: r.sequenceLen,
          },
        });
      }
    }

    await syncNutCatalog(db, company.id);

    summary.targets.push({
      code: company.code,
      chartCopied,
      rulesCopied,
      nutSynced: true,
    });
  }

  return summary;
}
