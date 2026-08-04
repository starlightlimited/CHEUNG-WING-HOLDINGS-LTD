import { prisma } from "@/lib/prisma";

function toNumber(d: unknown): number {
  if (typeof d === "number") return d;
  return Number(d);
}

/** 已對接到該銷售合同的預收加總（`linkedDocumentId` 為合同 id 或合同編號） */
export function sumPrepaymentsLinkedToContract(
  prepayments: { linkedDocumentId: string | null; amount: unknown }[],
  contractId: string,
  documentNo: string
): number {
  return prepayments
    .filter(
      (p) =>
        p.linkedDocumentId != null &&
        (p.linkedDocumentId === contractId || p.linkedDocumentId === documentNo)
    )
    .reduce((sum, p) => sum + toNumber(p.amount), 0);
}

/** 與「預收款對接」合同對接明細相同口徑的合同列 */
export type ContractPrepayContractRow = {
  id: string;
  documentNo: string;
  customerId: string;
  customerName: string;
  totalAmount: number;
  prepaidAmount: number;
  invoicedAmount: number;
  remainingAmount: number;
  pendingInvoice: number;
  status: string;
};

export type ContractPrepayPrepaymentRow = {
  id: string;
  amount: unknown;
  linkedDocumentId: string | null;
  payerName: string | null;
  customerId: string | null;
  status: string;
  customer: { name: string | null } | null;
};

/**
 * 載入銷售合同與預收款，並計算與「預收款對接」頁相同的合同對接明細列。
 */
export async function loadContractPrepayData(companyId: string): Promise<{
  rows: ContractPrepayContractRow[];
  prepayments: ContractPrepayPrepaymentRow[];
}> {
  const [contracts, prepayments] = await Promise.all([
    prisma.salesDocument.findMany({
      where: { companyId, type: "CONTRACT" },
      orderBy: { date: "desc" },
      take: 100,
      include: {
        customer: { select: { name: true } },
        children: {
          where: { type: "PROFORMA_INVOICE", status: { not: "CANCELLED" } },
          select: { totalAmount: true, status: true },
        },
      },
    }),
    prisma.prepayment.findMany({
      where: { companyId },
      orderBy: { receivedAt: "desc" },
      select: {
        id: true,
        amount: true,
        linkedDocumentId: true,
        payerName: true,
        customerId: true,
        status: true,
        customer: { select: { name: true } },
      },
    }),
  ]);

  const rows: ContractPrepayContractRow[] = contracts.map((c) => {
    const totalAmount = toNumber(c.totalAmount);
    const prepaidAmount = sumPrepaymentsLinkedToContract(prepayments, c.id, c.documentNo);
    const invoicedAmount = c.children.reduce((sum, ch) => sum + toNumber(ch.totalAmount), 0);
    const remainingAmount = Math.max(0, totalAmount - prepaidAmount);
    const pendingInvoice = Math.max(0, totalAmount - invoicedAmount);
    const settled =
      remainingAmount < 0.005 && pendingInvoice < 0.005 && totalAmount > 0;
    return {
      id: c.id,
      documentNo: c.documentNo,
      customerId: c.customerId,
      customerName: c.customer?.name ?? "—",
      totalAmount,
      prepaidAmount,
      invoicedAmount,
      remainingAmount,
      pendingInvoice,
      status: settled ? "已結清" : "待衝抵",
    };
  });

  return { rows, prepayments };
}

/** 與 ContractPrepayClient 的 OpenPrepayPayload 一致：首筆「開放且尚未關聯合同」的預收款，用於提示條與對接表單 */
export type OpenPrepayForMatching = {
  id: string;
  amount: number;
  customerId: string | null;
  payerName: string | null;
  customerName: string | null;
};

/**
 * 選取一筆待對接預收款（OPEN 且 linkedDocumentId 為空），供預收款對接頁提示與一鍵對接。
 * @param scopeCustomerId 若提供，僅在該客戶範圍內挑選（多合同客戶時避免錯配）。
 */
export function resolveOpenPrepayForMatching(
  prepayments: ContractPrepayPrepaymentRow[],
  scopeCustomerId?: string | null
): { openPrepay: OpenPrepayForMatching | null; openCustomerLabel: string | null } {
  const scope = scopeCustomerId?.trim() || null;
  const candidates = prepayments.filter(
    (p) =>
      p.status === "OPEN" &&
      (p.linkedDocumentId == null || String(p.linkedDocumentId).trim() === "") &&
      (!scope || p.customerId === scope)
  );
  const first = candidates[0];
  if (!first) {
    return { openPrepay: null, openCustomerLabel: null };
  }
  const customerName = first.customer?.name ?? null;
  const label =
    (customerName && customerName.trim()) ||
    (first.payerName && first.payerName.trim()) ||
    null;
  return {
    openPrepay: {
      id: first.id,
      amount: toNumber(first.amount),
      customerId: first.customerId,
      payerName: first.payerName,
      customerName,
    },
    openCustomerLabel: label,
  };
}
