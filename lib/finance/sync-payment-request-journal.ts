import type { PrismaClient } from "@prisma/client";
import {
  createPostedJournalFromSource,
  findJournalBySource,
  resolveActiveGlByCode,
} from "@/lib/finance/create-posted-journal";

export const JOURNAL_SOURCE_PAYMENT_REQUEST = "PAYMENT_REQUEST" as const;

/** 與 seed 一致：管理費用、銀行存款 */
const EXPENSE_GL_CODE = "5100";
const BANK_GL_CODE = "1100";

export type SyncPaidPrJournalResult =
  | { ok: true; created: boolean; entryId: string }
  | { ok: false; reason: "not_paid" | "already_synced" | "missing_request" | "missing_gl" };

/**
 * 已支付請款單 → 一筆已過帳憑證（借管理費用、貸銀行存款），冪等。
 */
export async function syncPaidPaymentRequestToJournal(
  db: PrismaClient,
  companyId: string,
  paymentRequestId: string,
): Promise<SyncPaidPrJournalResult> {
  const existing = await findJournalBySource(
    db,
    companyId,
    JOURNAL_SOURCE_PAYMENT_REQUEST,
    paymentRequestId,
  );
  if (existing) return { ok: true, created: false, entryId: existing.id };

  const pr = await db.paymentRequest.findFirst({
    where: { id: paymentRequestId, companyId },
  });
  if (!pr) return { ok: false, reason: "missing_request" };
  if (pr.status !== "PAID") return { ok: false, reason: "not_paid" };

  const [expenseGl, bankGl, category] = await Promise.all([
    resolveActiveGlByCode(db, companyId, EXPENSE_GL_CODE),
    resolveActiveGlByCode(db, companyId, BANK_GL_CODE),
    db.accountingCategory.findFirst({
      where: { companyId, code: { in: ["ADM", "GEN"] } },
      orderBy: { code: "asc" },
    }),
  ]);
  if (!expenseGl || !bankGl) return { ok: false, reason: "missing_gl" };

  const descParts = [`請款已支付：${pr.title}`];
  if (pr.purpose) descParts.push(pr.purpose);

  const result = await createPostedJournalFromSource(db, {
    companyId,
    sourceType: JOURNAL_SOURCE_PAYMENT_REQUEST,
    sourceId: pr.id,
    entryDate: pr.approvedAt ?? pr.createdAt,
    description: descParts.join(" · "),
    lines: [
      {
        glAccountId: expenseGl.id,
        debit: pr.amount,
        credit: 0,
        memo: "請款費用",
        accountingCategoryId: category?.id ?? null,
      },
      {
        glAccountId: bankGl.id,
        debit: 0,
        credit: pr.amount,
        memo: "銀行付款",
        accountingCategoryId: category?.id ?? null,
      },
    ],
  });

  return { ok: true, ...result };
}
