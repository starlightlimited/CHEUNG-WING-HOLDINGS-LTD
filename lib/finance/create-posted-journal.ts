import type { PrismaClient } from "@prisma/client";
import { JournalEntryStatus, Prisma } from "@prisma/client";
import { nextJournalEntryNo } from "@/lib/finance/journal-entry-no";

export type PostedJournalLineInput = {
  glAccountId: string;
  debit: Prisma.Decimal | number | string;
  credit: Prisma.Decimal | number | string;
  memo?: string | null;
  accountingCategoryId?: string | null;
};

export async function findJournalBySource(
  db: PrismaClient,
  companyId: string,
  sourceType: string,
  sourceId: string,
) {
  return db.journalEntry.findFirst({
    where: { companyId, sourceType, sourceId },
  });
}

/**
 * 以業務來源冪等建立「已過帳」憑證（總帳明細只讀 POSTED）。
 */
export async function createPostedJournalFromSource(
  db: PrismaClient,
  params: {
    companyId: string;
    sourceType: string;
    sourceId: string;
    entryDate: Date;
    description: string;
    lines: PostedJournalLineInput[];
  },
): Promise<{ created: boolean; entryId: string }> {
  const existing = await findJournalBySource(
    db,
    params.companyId,
    params.sourceType,
    params.sourceId,
  );
  if (existing) return { created: false, entryId: existing.id };

  if (params.lines.length < 2) {
    throw new Error("posted_journal_needs_at_least_two_lines");
  }

  let td = new Prisma.Decimal(0);
  let tc = new Prisma.Decimal(0);
  const normalized = params.lines.map((l) => {
    const debit = new Prisma.Decimal(l.debit);
    const credit = new Prisma.Decimal(l.credit);
    td = td.add(debit);
    tc = tc.add(credit);
    return {
      glAccountId: l.glAccountId,
      debit,
      credit,
      memo: l.memo ?? null,
      accountingCategoryId: l.accountingCategoryId ?? null,
    };
  });
  if (!td.eq(tc) || td.lte(0)) {
    throw new Error("posted_journal_unbalanced");
  }

  const entryNo = await nextJournalEntryNo(params.companyId);
  const entry = await db.journalEntry.create({
    data: {
      companyId: params.companyId,
      entryNo,
      entryDate: params.entryDate,
      description: params.description.slice(0, 500),
      status: JournalEntryStatus.POSTED,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      lines: { create: normalized },
    },
  });

  return { created: true, entryId: entry.id };
}

export async function resolveActiveGlByCode(
  db: PrismaClient,
  companyId: string,
  code: string,
) {
  return db.glAccount.findFirst({
    where: { companyId, code, isActive: true },
  });
}
