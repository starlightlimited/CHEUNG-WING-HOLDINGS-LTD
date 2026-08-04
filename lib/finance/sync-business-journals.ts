import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  createPostedJournalFromSource,
  resolveActiveGlByCode,
} from "@/lib/finance/create-posted-journal";

export const JOURNAL_SOURCE_PREPAYMENT = "PREPAYMENT" as const;
/** 預收轉收入：借預收／貸營業收入 */
export const JOURNAL_SOURCE_PREPAYMENT_REVENUE = "PREPAYMENT_REVENUE" as const;
/** 合同確認後未預收餘額：借應收／貸營業收入 */
export const JOURNAL_SOURCE_CONTRACT_REVENUE = "CONTRACT_REVENUE" as const;
export const JOURNAL_SOURCE_AR = "ACCOUNTS_RECEIVABLE" as const;
export const JOURNAL_SOURCE_AR_RECEIPT = "ACCOUNTS_RECEIVABLE_RECEIPT" as const;
export const JOURNAL_SOURCE_AP = "ACCOUNTS_PAYABLE" as const;
export const JOURNAL_SOURCE_AP_PAYMENT = "ACCOUNTS_PAYABLE_PAYMENT" as const;

/** 7 月中（含當日之前視為歷史已收／已轉收入） */
export const PREPAYMENT_REVENUE_CUTOFF = new Date(2026, 6, 15);

const BANK = "1100";
const AR = "1200";
const AP = "2000";
const UNEARNED = "2100";
const REVENUE = "4000";
const EXPENSE = "5100";

function toNum(d: unknown): number {
  if (typeof d === "number") return d;
  return Number(d);
}

function prepaidOnContract(
  prepayments: { linkedDocumentId: string | null; amount: unknown }[],
  contractId: string,
  documentNo: string,
): number {
  return prepayments
    .filter(
      (p) =>
        p.linkedDocumentId != null &&
        (p.linkedDocumentId === contractId || p.linkedDocumentId === documentNo),
    )
    .reduce((sum, p) => sum + toNum(p.amount), 0);
}

export type SyncBusinessJournalResult =
  | { ok: true; created: boolean; entryId: string }
  | {
      ok: false;
      reason: "missing_record" | "missing_gl" | "zero_amount" | "skipped_status";
    };

/** 預收款：借銀行存款、貸預收賬款 */
export async function syncPrepaymentToJournal(
  db: PrismaClient,
  companyId: string,
  prepaymentId: string,
): Promise<SyncBusinessJournalResult> {
  const row = await db.prepayment.findFirst({
    where: { id: prepaymentId, companyId },
  });
  if (!row) return { ok: false, reason: "missing_record" };
  if (row.amount.lte(0)) return { ok: false, reason: "zero_amount" };

  const [bankGl, unearnedGl] = await Promise.all([
    resolveActiveGlByCode(db, companyId, BANK),
    resolveActiveGlByCode(db, companyId, UNEARNED),
  ]);
  if (!bankGl || !unearnedGl) return { ok: false, reason: "missing_gl" };

  const label = row.payerName || row.reference || row.id.slice(0, 8);
  const result = await createPostedJournalFromSource(db, {
    companyId,
    sourceType: JOURNAL_SOURCE_PREPAYMENT,
    sourceId: row.id,
    entryDate: row.receivedAt,
    description: `預收款入帳：${label}`,
    lines: [
      { glAccountId: bankGl.id, debit: row.amount, credit: 0, memo: "銀行收款" },
      { glAccountId: unearnedGl.id, debit: 0, credit: row.amount, memo: "預收賬款" },
    ],
  });
  return { ok: true, ...result };
}

/**
 * 預收轉收入：借預收賬款、貸營業收入（冪等）。
 * 需先有現金入帳（1100/2100），否則 2100 會被沖成負數口徑仍可記，但業務上應先 syncPrepaymentToJournal。
 */
export async function syncPrepaymentRevenueToJournal(
  db: PrismaClient,
  companyId: string,
  prepaymentId: string,
): Promise<SyncBusinessJournalResult> {
  const row = await db.prepayment.findFirst({
    where: { id: prepaymentId, companyId },
  });
  if (!row) return { ok: false, reason: "missing_record" };
  if (row.amount.lte(0)) return { ok: false, reason: "zero_amount" };

  const [unearnedGl, revGl] = await Promise.all([
    resolveActiveGlByCode(db, companyId, UNEARNED),
    resolveActiveGlByCode(db, companyId, REVENUE),
  ]);
  if (!unearnedGl || !revGl) return { ok: false, reason: "missing_gl" };

  const label = row.payerName || row.reference || row.id.slice(0, 8);
  const result = await createPostedJournalFromSource(db, {
    companyId,
    sourceType: JOURNAL_SOURCE_PREPAYMENT_REVENUE,
    sourceId: row.id,
    entryDate: row.receivedAt,
    description: `預收轉收入：${label}`,
    lines: [
      { glAccountId: unearnedGl.id, debit: row.amount, credit: 0, memo: "沖預收" },
      { glAccountId: revGl.id, debit: 0, credit: row.amount, memo: "營業收入" },
    ],
  });
  return { ok: true, ...result };
}

/**
 * 將預收款調整為「已收／已確認收入」：確保現金入帳 → 轉收入 → 狀態 CLOSED。
 */
export async function recognizePrepaymentAsRevenue(
  db: PrismaClient,
  companyId: string,
  prepaymentId: string,
): Promise<SyncBusinessJournalResult> {
  const cash = await syncPrepaymentToJournal(db, companyId, prepaymentId);
  if (!cash.ok) return cash;

  const rev = await syncPrepaymentRevenueToJournal(db, companyId, prepaymentId);
  if (!rev.ok) return rev;

  await db.prepayment.update({
    where: { id: prepaymentId },
    data: { status: "CLOSED" },
  });

  return rev;
}

/**
 * 已確認／已完成合同：未預收餘額認列為應收＋收入（借 1200／貸 4000）。
 * 已預收部分應由 PREPAYMENT_REVENUE 認列，避免重複。
 */
export async function syncContractRevenueToJournal(
  db: PrismaClient,
  companyId: string,
  contractId: string,
): Promise<SyncBusinessJournalResult> {
  const contract = await db.salesDocument.findFirst({
    where: { id: contractId, companyId, type: "CONTRACT" },
    include: { customer: { select: { name: true } } },
  });
  if (!contract) return { ok: false, reason: "missing_record" };
  if (contract.status !== "CONFIRMED" && contract.status !== "COMPLETED") {
    return { ok: false, reason: "skipped_status" };
  }
  if (contract.totalAmount.lte(0)) return { ok: false, reason: "zero_amount" };

  const prepayments = await db.prepayment.findMany({
    where: { companyId },
    select: { linkedDocumentId: true, amount: true },
  });
  const prepaid = prepaidOnContract(prepayments, contract.id, contract.documentNo);
  const remaining = new Prisma.Decimal(contract.totalAmount.toFixed(2)).sub(
    new Prisma.Decimal(prepaid.toFixed(2)),
  );
  if (remaining.lte(0.01)) return { ok: false, reason: "zero_amount" };

  const [arGl, revGl] = await Promise.all([
    resolveActiveGlByCode(db, companyId, AR),
    resolveActiveGlByCode(db, companyId, REVENUE),
  ]);
  if (!arGl || !revGl) return { ok: false, reason: "missing_gl" };

  const label = contract.documentNo;
  const cust = contract.customer?.name ? ` · ${contract.customer.name}` : "";
  const result = await createPostedJournalFromSource(db, {
    companyId,
    sourceType: JOURNAL_SOURCE_CONTRACT_REVENUE,
    sourceId: contract.id,
    entryDate: contract.date,
    description: `合同收入認列：${label}${cust}`,
    lines: [
      { glAccountId: arGl.id, debit: remaining, credit: 0, memo: "應收賬款（未預收）" },
      { glAccountId: revGl.id, debit: 0, credit: remaining, memo: "營業收入" },
    ],
  });
  return { ok: true, ...result };
}

/** 合同確認後：對接中的預收轉收入，並認列未預收餘額 */
export async function syncContractAndLinkedPrepaymentsToRevenue(
  db: PrismaClient,
  companyId: string,
  contractId: string,
): Promise<{ prepayRecognized: number; contractRev: SyncBusinessJournalResult }> {
  const contract = await db.salesDocument.findFirst({
    where: { id: contractId, companyId, type: "CONTRACT" },
    select: { id: true, documentNo: true, status: true },
  });
  if (!contract) {
    return {
      prepayRecognized: 0,
      contractRev: { ok: false, reason: "missing_record" },
    };
  }

  let prepayRecognized = 0;
  if (contract.status === "CONFIRMED" || contract.status === "COMPLETED") {
    const linked = await db.prepayment.findMany({
      where: {
        companyId,
        OR: [
          { linkedDocumentId: contract.id },
          { linkedDocumentId: contract.documentNo },
        ],
      },
      select: { id: true },
    });
    for (const p of linked) {
      const r = await recognizePrepaymentAsRevenue(db, companyId, p.id);
      if (r.ok && r.created) prepayRecognized += 1;
      else if (r.ok) {
        await db.prepayment.update({
          where: { id: p.id },
          data: { status: "CLOSED" },
        });
      }
    }
  }

  const contractRev = await syncContractRevenueToJournal(db, companyId, contractId);
  return { prepayRecognized, contractRev };
}

/** 應收認列：借應收賬款、貸營業收入 */
export async function syncReceivableToJournal(
  db: PrismaClient,
  companyId: string,
  receivableId: string,
): Promise<SyncBusinessJournalResult> {
  const row = await db.accountsReceivable.findFirst({
    where: { id: receivableId, companyId },
  });
  if (!row) return { ok: false, reason: "missing_record" };
  if (row.amount.lte(0)) return { ok: false, reason: "zero_amount" };

  const [arGl, revGl] = await Promise.all([
    resolveActiveGlByCode(db, companyId, AR),
    resolveActiveGlByCode(db, companyId, REVENUE),
  ]);
  if (!arGl || !revGl) return { ok: false, reason: "missing_gl" };

  const label = row.invoiceNo || row.customerName;
  const result = await createPostedJournalFromSource(db, {
    companyId,
    sourceType: JOURNAL_SOURCE_AR,
    sourceId: row.id,
    entryDate: row.issueDate,
    description: `應收認列：${label}${row.description ? ` · ${row.description}` : ""}`,
    lines: [
      { glAccountId: arGl.id, debit: row.amount, credit: 0, memo: "應收賬款" },
      { glAccountId: revGl.id, debit: 0, credit: row.amount, memo: "營業收入" },
    ],
  });
  return { ok: true, ...result };
}

/** 應收回款：借銀行存款、貸應收賬款（有 receivedAmount 才產生） */
export async function syncReceivableReceiptToJournal(
  db: PrismaClient,
  companyId: string,
  receivableId: string,
): Promise<SyncBusinessJournalResult> {
  const row = await db.accountsReceivable.findFirst({
    where: { id: receivableId, companyId },
  });
  if (!row) return { ok: false, reason: "missing_record" };
  if (row.receivedAmount.lte(0)) return { ok: false, reason: "zero_amount" };

  const [bankGl, arGl] = await Promise.all([
    resolveActiveGlByCode(db, companyId, BANK),
    resolveActiveGlByCode(db, companyId, AR),
  ]);
  if (!bankGl || !arGl) return { ok: false, reason: "missing_gl" };

  const label = row.invoiceNo || row.customerName;
  const result = await createPostedJournalFromSource(db, {
    companyId,
    sourceType: JOURNAL_SOURCE_AR_RECEIPT,
    sourceId: row.id,
    entryDate: row.issueDate,
    description: `應收回款：${label}`,
    lines: [
      { glAccountId: bankGl.id, debit: row.receivedAmount, credit: 0, memo: "銀行收款" },
      { glAccountId: arGl.id, debit: 0, credit: row.receivedAmount, memo: "沖應收" },
    ],
  });
  return { ok: true, ...result };
}

/** 應付認列：借管理費用、貸應付賬款 */
export async function syncPayableToJournal(
  db: PrismaClient,
  companyId: string,
  payableId: string,
): Promise<SyncBusinessJournalResult> {
  const row = await db.accountsPayable.findFirst({
    where: { id: payableId, companyId },
  });
  if (!row) return { ok: false, reason: "missing_record" };
  if (row.amount.lte(0)) return { ok: false, reason: "zero_amount" };

  const [expenseGl, apGl] = await Promise.all([
    resolveActiveGlByCode(db, companyId, EXPENSE),
    resolveActiveGlByCode(db, companyId, AP),
  ]);
  if (!expenseGl || !apGl) return { ok: false, reason: "missing_gl" };

  const label = row.billNo || row.vendorName;
  const result = await createPostedJournalFromSource(db, {
    companyId,
    sourceType: JOURNAL_SOURCE_AP,
    sourceId: row.id,
    entryDate: row.issueDate,
    description: `應付認列：${label}${row.description ? ` · ${row.description}` : ""}`,
    lines: [
      { glAccountId: expenseGl.id, debit: row.amount, credit: 0, memo: "費用／成本" },
      { glAccountId: apGl.id, debit: 0, credit: row.amount, memo: "應付賬款" },
    ],
  });
  return { ok: true, ...result };
}

/** 應付付款：借應付賬款、貸銀行存款（有 paidAmount 才產生） */
export async function syncPayablePaymentToJournal(
  db: PrismaClient,
  companyId: string,
  payableId: string,
): Promise<SyncBusinessJournalResult> {
  const row = await db.accountsPayable.findFirst({
    where: { id: payableId, companyId },
  });
  if (!row) return { ok: false, reason: "missing_record" };
  if (row.paidAmount.lte(0)) return { ok: false, reason: "zero_amount" };

  const [apGl, bankGl] = await Promise.all([
    resolveActiveGlByCode(db, companyId, AP),
    resolveActiveGlByCode(db, companyId, BANK),
  ]);
  if (!apGl || !bankGl) return { ok: false, reason: "missing_gl" };

  const label = row.billNo || row.vendorName;
  const result = await createPostedJournalFromSource(db, {
    companyId,
    sourceType: JOURNAL_SOURCE_AP_PAYMENT,
    sourceId: row.id,
    entryDate: row.issueDate,
    description: `應付付款：${label}`,
    lines: [
      { glAccountId: apGl.id, debit: row.paidAmount, credit: 0, memo: "沖應付" },
      { glAccountId: bankGl.id, debit: 0, credit: row.paidAmount, memo: "銀行付款" },
    ],
  });
  return { ok: true, ...result };
}

/** 將尚未過帳的草稿憑證全部視為正式帳並過帳 */
export async function postAllDraftJournals(
  db: PrismaClient,
  companyId?: string,
): Promise<{ posted: number; skipped: number }> {
  const drafts = await db.journalEntry.findMany({
    where: {
      status: "DRAFT",
      ...(companyId ? { companyId } : {}),
    },
    include: { lines: true },
  });

  let posted = 0;
  let skipped = 0;
  for (const entry of drafts) {
    let td = new Prisma.Decimal(0);
    let tc = new Prisma.Decimal(0);
    for (const l of entry.lines) {
      td = td.add(l.debit);
      tc = tc.add(l.credit);
    }
    if (!td.eq(tc) || entry.lines.length < 2) {
      skipped += 1;
      continue;
    }
    await db.journalEntry.update({
      where: { id: entry.id },
      data: { status: "POSTED" },
    });
    posted += 1;
  }
  return { posted, skipped };
}
