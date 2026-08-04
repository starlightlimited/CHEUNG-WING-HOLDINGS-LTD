"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getDefaultCompanyId } from "@/lib/company";
import type { DocumentCaseStatus } from "@prisma/client";

const PATH = "/files/case-management";

/** 避免與 Prisma 單例或未完成 generate 時對 undefined 呼叫 .count / .findMany */
function documentCaseModelsAvailable(): boolean {
  const p = prisma as unknown as {
    documentCaseCategory?: { count?: unknown; findMany?: unknown };
    documentCase?: { count?: unknown; findMany?: unknown };
  };
  return (
    typeof p.documentCaseCategory?.count === "function" &&
    typeof p.documentCaseCategory?.findMany === "function" &&
    typeof p.documentCase?.count === "function" &&
    typeof p.documentCase?.findMany === "function"
  );
}

const DOCUMENT_CASE_PRISMA_MSG =
  "Prisma 尚未載入「案件」資料表（常見：未執行 generate，或 dev 仍使用舊快取）。請依序：① npx prisma generate  ②完全關閉並重啟 npm run dev（必要時刪除 .next）③ npx prisma db push。Windows 若 generate 出現 EPERM，請先關閉 dev 再執行 generate。";

/** 當前公司尚無任何案件分類與案件時，自動寫入與主 seed 一致的種子資料（避免僅跑部分腳本時頁面空白）。 */
async function ensureDocumentCaseSeedDataIfUnset(companyId: string): Promise<void> {
  if (!documentCaseModelsAvailable()) return;
  const [catCount, caseCount] = await Promise.all([
    prisma.documentCaseCategory.count({ where: { companyId } }),
    prisma.documentCase.count({ where: { companyId } }),
  ]);
  if (catCount > 0 || caseCount > 0) return;
  const { seedDocumentCases } = await import("../../prisma/seed-document-cases");
  await seedDocumentCases(prisma, companyId);
}

async function categoryIsUnder(
  companyId: string,
  startId: string,
  ancestorId: string
): Promise<boolean> {
  let id: string | null = startId;
  const seen = new Set<string>();
  while (id) {
    if (id === ancestorId) return true;
    if (seen.has(id)) break;
    seen.add(id);
    const parentRow: { parentId: string | null } | null =
      await prisma.documentCaseCategory.findFirst({
        where: { id, companyId },
        select: { parentId: true },
      });
    id = parentRow?.parentId ?? null;
  }
  return false;
}

/** 案件管理頁首屏：必要時種子後一次返回分類與案件，避免雙請求競態。 */
export async function getDocumentCaseManagementPageData() {
  // #region agent log
  fetch("http://127.0.0.1:7400/ingest/d1cd1f78-10d6-4ca1-8b6b-cd229733bede", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "50577c" },
    body: JSON.stringify({
      sessionId: "50577c",
      runId: "post-fix",
      hypothesisId: "H1",
      location: "document-cases.ts:getDocumentCaseManagementPageData",
      message: "action module parsed and invoked",
      data: { utf8SourceOk: true, hasSeedHelper: typeof ensureDocumentCaseSeedDataIfUnset === "function" },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  try {
    if (!documentCaseModelsAvailable()) {
      return { success: false, message: DOCUMENT_CASE_PRISMA_MSG };
    }
    const companyId = await getDefaultCompanyId();
    await ensureDocumentCaseSeedDataIfUnset(companyId);
    const [categories, cases] = await Promise.all([
      prisma.documentCaseCategory.findMany({
        where: { companyId },
        include: {
          _count: { select: { children: true, cases: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      }),
      prisma.documentCase.findMany({
        where: { companyId },
        include: {
          category: { select: { id: true, name: true } },
        },
        orderBy: [{ updatedAt: "desc" }],
      }),
    ]);
    return { success: true, data: { categories, cases } };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message };
  }
}

export async function getDocumentCaseCategories() {
  try {
    if (!documentCaseModelsAvailable()) {
      return { success: false, message: DOCUMENT_CASE_PRISMA_MSG };
    }
    const companyId = await getDefaultCompanyId();
    await ensureDocumentCaseSeedDataIfUnset(companyId);
    const rows = await prisma.documentCaseCategory.findMany({
      where: { companyId },
      include: {
        _count: { select: { children: true, cases: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    return { success: true, data: rows };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message };
  }
}

export async function createDocumentCaseCategory(data: {
  name: string;
  description?: string;
  parentId?: string | null;
  sortOrder?: number;
}) {
  try {
    const companyId = await getDefaultCompanyId();
    if (data.parentId) {
      const parent = await prisma.documentCaseCategory.findFirst({
        where: { id: data.parentId, companyId },
      });
      if (!parent) return { success: false, message: "上層分類不存在" };
    }
    const row = await prisma.documentCaseCategory.create({
      data: {
        companyId,
        name: data.name,
        description: data.description || null,
        parentId: data.parentId || null,
        sortOrder: data.sortOrder ?? 0,
      },
    });
    revalidatePath(PATH);
    return { success: true, data: row };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message };
  }
}

export async function updateDocumentCaseCategory(
  id: string,
  data: {
    name?: string;
    description?: string;
    parentId?: string | null;
    sortOrder?: number;
  }
) {
  try {
    const companyId = await getDefaultCompanyId();
    const existing = await prisma.documentCaseCategory.findFirst({
      where: { id, companyId },
    });
    if (!existing) return { success: false, message: "分類不存在或無權限" };
    if (data.parentId === id) return { success: false, message: "不可將分類設為自己的子層" };
    if (data.parentId) {
      const parent = await prisma.documentCaseCategory.findFirst({
        where: { id: data.parentId, companyId },
      });
      if (!parent) return { success: false, message: "上層分類不存在" };
      const cycle = await categoryIsUnder(companyId, data.parentId, id);
      if (cycle) return { success: false, message: "不可將上層設為自己的下層分類（會造成循環）" };
    }
    const row = await prisma.documentCaseCategory.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        parentId: data.parentId === undefined ? undefined : data.parentId,
        sortOrder: data.sortOrder,
      },
    });
    revalidatePath(PATH);
    return { success: true, data: row };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message };
  }
}

export async function deleteDocumentCaseCategory(id: string) {
  try {
    const companyId = await getDefaultCompanyId();
    const existing = await prisma.documentCaseCategory.findFirst({
      where: { id, companyId },
      include: { _count: { select: { children: true, cases: true } } },
    });
    if (!existing) return { success: false, message: "分類不存在或無權限" };
    if (existing._count.children > 0) {
      return { success: false, message: "請先刪除或移動子分類" };
    }
    if (existing._count.cases > 0) {
      return { success: false, message: "此分類下仍有案件，請先變更案件所屬分類" };
    }
    await prisma.documentCaseCategory.delete({ where: { id } });
    revalidatePath(PATH);
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message };
  }
}

export async function getDocumentCases() {
  try {
    if (!documentCaseModelsAvailable()) {
      return { success: false, message: DOCUMENT_CASE_PRISMA_MSG };
    }
    const companyId = await getDefaultCompanyId();
    await ensureDocumentCaseSeedDataIfUnset(companyId);
    const rows = await prisma.documentCase.findMany({
      where: { companyId },
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
    });
    return { success: true, data: rows };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message };
  }
}

export async function createDocumentCase(data: {
  code: string;
  title: string;
  description?: string;
  categoryId?: string | null;
  status?: DocumentCaseStatus;
  openedAt?: Date | null;
  closedAt?: Date | null;
}) {
  try {
    const companyId = await getDefaultCompanyId();
    if (data.categoryId) {
      const cat = await prisma.documentCaseCategory.findFirst({
        where: { id: data.categoryId, companyId },
      });
      if (!cat) return { success: false, message: "案件分類不存在" };
    }
    const row = await prisma.documentCase.create({
      data: {
        companyId,
        code: data.code.trim(),
        title: data.title.trim(),
        description: data.description?.trim() || null,
        categoryId: data.categoryId || null,
        status: data.status ?? "OPEN",
        openedAt: data.openedAt ?? null,
        closedAt: data.closedAt ?? null,
      },
    });
    revalidatePath(PATH);
    return { success: true, data: row };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message };
  }
}

export async function updateDocumentCase(
  id: string,
  data: {
    code?: string;
    title?: string;
    description?: string | null;
    categoryId?: string | null;
    status?: DocumentCaseStatus;
    openedAt?: Date | null;
    closedAt?: Date | null;
  }
) {
  try {
    const companyId = await getDefaultCompanyId();
    const existing = await prisma.documentCase.findFirst({ where: { id, companyId } });
    if (!existing) return { success: false, message: "案件不存在或無權限" };
    if (data.categoryId) {
      const cat = await prisma.documentCaseCategory.findFirst({
        where: { id: data.categoryId, companyId },
      });
      if (!cat) return { success: false, message: "案件分類不存在" };
    }
    const row = await prisma.documentCase.update({
      where: { id },
      data: {
        code: data.code?.trim(),
        title: data.title?.trim(),
        description: data.description === undefined ? undefined : data.description?.trim() || null,
        categoryId: data.categoryId === undefined ? undefined : data.categoryId,
        status: data.status,
        openedAt: data.openedAt === undefined ? undefined : data.openedAt,
        closedAt: data.closedAt === undefined ? undefined : data.closedAt,
      },
    });
    revalidatePath(PATH);
    return { success: true, data: row };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message };
  }
}

export async function deleteDocumentCase(id: string) {
  try {
    const companyId = await getDefaultCompanyId();
    const existing = await prisma.documentCase.findFirst({ where: { id, companyId } });
    if (!existing) return { success: false, message: "案件不存在或無權限" };
    await prisma.documentCase.delete({ where: { id } });
    revalidatePath(PATH);
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message };
  }
}
