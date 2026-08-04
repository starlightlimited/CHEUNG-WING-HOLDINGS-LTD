import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { STAFF_ENGLISH_NAMES } from "@/lib/staff-display-names";
import { sumPrepaymentsLinkedToContract } from "@/lib/finance/contract-prepay-data";

export const COMMISSION_RATE = 0.05;
export const COMMISSION_CATEGORY = "COMMISSION";

/**
 * 7 月前（不含 7/1）歷史佣金一律視為已結算。
 * 與預收收入截止日同屬 2026 業務切帳口徑。
 */
export const COMMISSION_HISTORICAL_CUTOFF = new Date("2026-07-01T00:00:00+08:00");

/** 請款 purpose 冪等鍵：COMMISSION:{contractId} */
export function commissionPurposeToken(contractId: string): string {
  return `COMMISSION:${contractId}`;
}

export function isHistoricalCommissionDate(date: Date): boolean {
  return date.getTime() < COMMISSION_HISTORICAL_CUTOFF.getTime();
}

export function parseCommissionContractId(purpose: string | null | undefined): string | null {
  if (!purpose) return null;
  const m = /^COMMISSION:(.+)$/.exec(purpose.trim());
  return m?.[1] ?? null;
}

/** 本公司銷售人員：依合同 id 穩定映射（SalesDocument 尚無真實業務員欄位） */
export function salespersonForContractId(contractId: string): string {
  let h = 0;
  for (let i = 0; i < contractId.length; i++) {
    h = (Math.imul(31, h) + contractId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % STAFF_ENGLISH_NAMES.length;
  return STAFF_ENGLISH_NAMES[idx];
}

/** 以香港時區解析 YYYY-MM 月份區間 */
export function hkMonthRange(month: string): { gte: Date; lt: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const gte = new Date(`${m[1]}-${m[2]}-01T00:00:00+08:00`);
  const nextY = mo === 12 ? y + 1 : y;
  const nextM = mo === 12 ? 1 : mo + 1;
  const lt = new Date(
    `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+08:00`,
  );
  return { gte, lt };
}

export type CommissionStatus =
  | "待回款"
  | "待結算"
  | "已申請"
  | "已核准"
  | "已結算"
  | "已拒絕";

function statusFromPaymentRequest(
  prStatus: string | undefined,
  prepaidAmount: number,
  contractDate?: Date,
): CommissionStatus {
  if (contractDate && isHistoricalCommissionDate(contractDate)) {
    return "已結算";
  }
  switch (prStatus) {
    case "SUBMITTED":
    case "DRAFT":
      return "已申請";
    case "APPROVED":
      return "已核准";
    case "PAID":
      return "已結算";
    case "REJECTED":
      return "已拒絕";
    default:
      return prepaidAmount > 0 ? "待結算" : "待回款";
  }
}

/**
 * 將 7 月前合同佣金落成系統完成狀態（請款 PAID）。
 * 直接寫入 PAID，不觸發費用憑證過帳（歷史切帳）。
 */
export async function ensureHistoricalCommissionsSettled(
  db: PrismaClient,
  companyId: string,
): Promise<{ created: number; updated: number }> {
  const contracts = await db.salesDocument.findMany({
    where: {
      companyId,
      type: "CONTRACT",
      status: { in: ["COMPLETED", "CONFIRMED"] },
      date: { lt: COMMISSION_HISTORICAL_CUTOFF },
    },
    include: { customer: { select: { name: true } } },
  });

  if (contracts.length === 0) {
    return { created: 0, updated: 0 };
  }

  const purposes = contracts.map((c) => commissionPurposeToken(c.id));
  const existing = await db.paymentRequest.findMany({
    where: {
      companyId,
      purpose: { in: purposes },
      status: { not: "REJECTED" },
    },
    select: { id: true, purpose: true, status: true },
  });

  const prByPurpose = new Map(existing.map((pr) => [pr.purpose ?? "", pr]));
  let created = 0;
  let updated = 0;
  const now = new Date();

  for (const contract of contracts) {
    const purpose = commissionPurposeToken(contract.id);
    const pr = prByPurpose.get(purpose);
    const totalAmount = Number(contract.totalAmount);
    const commissionAmount = totalAmount * COMMISSION_RATE;
    if (commissionAmount <= 0) continue;

    const customerName = contract.customer?.name || "未知客戶";
    const salesperson = salespersonForContractId(contract.id);

    if (!pr) {
      await db.paymentRequest.create({
        data: {
          companyId,
          title: `銷售佣金結算：${contract.documentNo}（${customerName}）【歷史已結算】`,
          amount: new Prisma.Decimal(commissionAmount.toFixed(2)),
          purpose,
          requestedBy: salesperson,
          department: "銷售部",
          category: COMMISSION_CATEGORY,
          status: "PAID",
          approverRole: "財務",
          approvedBy: "系統切帳",
          approvedAt: now,
        },
      });
      created += 1;
      continue;
    }

    if (pr.status !== "PAID") {
      await db.paymentRequest.update({
        where: { id: pr.id },
        data: {
          status: "PAID",
          approvedBy: "系統切帳",
          approvedAt: now,
        },
      });
      updated += 1;
    }
  }

  return { created, updated };
}

export type CommissionRow = {
  id: string;
  documentNo: string;
  customerName: string;
  date: Date;
  totalAmount: number;
  prepaidAmount: number;
  commissionRate: number;
  commissionAmount: number;
  status: CommissionStatus;
  contractStatus: string;
  salesperson: string;
  paymentRequestId: string | null;
  canSettle: boolean;
};

export type CommissionSummary = {
  totalSales: number;
  totalCommission: number;
  contractCount: number;
  pendingSettleCount: number;
  settledCount: number;
};

/**
 * 同步佣金視圖：合同 + 預收回款 + 請款單狀態。
 * 載入前會將 7 月前歷史佣金寫入請款 PAID（已結算）。
 */
export async function loadSyncedCommissions(
  db: PrismaClient,
  companyId: string,
  month?: string | null,
): Promise<{ data: CommissionRow[]; summary: CommissionSummary }> {
  let dateFilter: { date?: { gte: Date; lt: Date } } = {};
  if (month) {
    const range = hkMonthRange(month);
    if (!range) {
      throw new Error("Invalid month format");
    }
    dateFilter = { date: range };
  }

  // 歷史切帳：7 月前一律落成系統完成狀態
  await ensureHistoricalCommissionsSettled(db, companyId);

  const [contracts, prepayments, paymentRequests] = await Promise.all([
    db.salesDocument.findMany({
      where: {
        companyId,
        type: "CONTRACT",
        status: { in: ["COMPLETED", "CONFIRMED"] },
        ...dateFilter,
      },
      include: { customer: { select: { name: true } } },
      orderBy: { date: "desc" },
    }),
    db.prepayment.findMany({
      where: { companyId },
      select: { linkedDocumentId: true, amount: true },
    }),
    db.paymentRequest.findMany({
      where: {
        companyId,
        OR: [
          { category: COMMISSION_CATEGORY },
          { purpose: { startsWith: "COMMISSION:" } },
        ],
      },
      select: { id: true, purpose: true, status: true, amount: true },
    }),
  ]);

  const prByContractId = new Map<
    string,
    { id: string; status: string; amount: unknown }
  >();
  for (const pr of paymentRequests) {
    const contractId = parseCommissionContractId(pr.purpose);
    if (!contractId) continue;
    // 同一合同多筆時保留最新建立順序中的最後一筆（findMany 未保證序，以 id 覆蓋即可）
    prByContractId.set(contractId, pr);
  }

  const data: CommissionRow[] = contracts.map((contract) => {
    const totalAmount = Number(contract.totalAmount);
    const prepaidAmount = sumPrepaymentsLinkedToContract(
      prepayments,
      contract.id,
      contract.documentNo,
    );
    const pr = prByContractId.get(contract.id);
    const historical = isHistoricalCommissionDate(contract.date);
    const status = statusFromPaymentRequest(pr?.status, prepaidAmount, contract.date);
    const canSettle =
      !historical &&
      prepaidAmount > 0 &&
      (pr == null || pr.status === "REJECTED");

    return {
      id: contract.id,
      documentNo: contract.documentNo,
      customerName: contract.customer?.name || "未知客戶",
      date: contract.date,
      totalAmount,
      prepaidAmount,
      commissionRate: COMMISSION_RATE * 100,
      commissionAmount: totalAmount * COMMISSION_RATE,
      status,
      contractStatus: contract.status,
      salesperson: salespersonForContractId(contract.id),
      paymentRequestId: pr?.id ?? null,
      canSettle,
    };
  });

  const summary: CommissionSummary = {
    totalSales: data.reduce((sum, item) => sum + item.totalAmount, 0),
    totalCommission: data.reduce((sum, item) => sum + item.commissionAmount, 0),
    contractCount: data.length,
    pendingSettleCount: data.filter((d) => d.status === "待結算").length,
    settledCount: data.filter((d) => d.status === "已結算").length,
  };

  return { data, summary };
}

export type SettleCommissionResult =
  | { ok: true; created: boolean; paymentRequestId: string; status: CommissionStatus }
  | { ok: false; reason: string };

/**
 * 申請佣金結算：建立財務請款單（category=COMMISSION）。
 * 冪等：同一合同已有未拒絕請款則回傳既有單。
 * 條件：合同已確認／完成，且已有對接預收回款。
 */
export async function settleCommissionToPaymentRequest(
  db: PrismaClient,
  companyId: string,
  contractId: string,
  requestedBy?: string | null,
): Promise<SettleCommissionResult> {
  const contract = await db.salesDocument.findFirst({
    where: {
      id: contractId,
      companyId,
      type: "CONTRACT",
      status: { in: ["CONFIRMED", "COMPLETED"] },
    },
    include: { customer: { select: { name: true } } },
  });

  if (!contract) {
    return { ok: false, reason: "找不到可結算的銷售合同" };
  }

  if (isHistoricalCommissionDate(contract.date)) {
    // 7 月前由切帳流程落成 PAID，不可再重複申請
    await ensureHistoricalCommissionsSettled(db, companyId);
    const purpose = commissionPurposeToken(contract.id);
    const historicalPr = await db.paymentRequest.findFirst({
      where: { companyId, purpose, status: { not: "REJECTED" } },
      orderBy: { createdAt: "desc" },
    });
    if (historicalPr) {
      return {
        ok: true,
        created: false,
        paymentRequestId: historicalPr.id,
        status: "已結算",
      };
    }
    return { ok: false, reason: "7 月前合同已視為歷史結算，無需再申請" };
  }

  const purpose = commissionPurposeToken(contract.id);
  const existing = await db.paymentRequest.findFirst({
    where: {
      companyId,
      purpose,
      status: { not: "REJECTED" },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return {
      ok: true,
      created: false,
      paymentRequestId: existing.id,
      status: statusFromPaymentRequest(existing.status, 1, contract.date),
    };
  }

  const prepayments = await db.prepayment.findMany({
    where: { companyId },
    select: { linkedDocumentId: true, amount: true },
  });
  const prepaidAmount = sumPrepaymentsLinkedToContract(
    prepayments,
    contract.id,
    contract.documentNo,
  );

  if (prepaidAmount <= 0) {
    return { ok: false, reason: "該合同尚無對接回款，無法申請佣金結算" };
  }

  const totalAmount = Number(contract.totalAmount);
  const commissionAmount = totalAmount * COMMISSION_RATE;
  if (commissionAmount <= 0) {
    return { ok: false, reason: "佣金金額無效" };
  }

  const salesperson = requestedBy?.trim() || salespersonForContractId(contract.id);
  const customerName = contract.customer?.name || "未知客戶";

  const created = await db.paymentRequest.create({
    data: {
      companyId,
      title: `銷售佣金結算：${contract.documentNo}（${customerName}）`,
      amount: new Prisma.Decimal(commissionAmount.toFixed(2)),
      purpose,
      requestedBy: salesperson,
      department: "銷售部",
      category: COMMISSION_CATEGORY,
      status: "SUBMITTED",
      approverRole: "財務",
    },
  });

  return {
    ok: true,
    created: true,
    paymentRequestId: created.id,
    status: "已申請",
  };
}
