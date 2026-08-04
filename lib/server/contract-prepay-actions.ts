"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAccessCompanyTenantData, requireCompanyId } from "@/lib/company";
import { getSession } from "@/lib/auth/session";
import {
  recognizePrepaymentAsRevenue,
  syncContractAndLinkedPrepaymentsToRevenue,
  syncPrepaymentToJournal,
} from "@/lib/finance/sync-business-journals";

function revalidateRevenuePaths() {
  revalidatePath("/accounting/journals");
  revalidatePath("/accounting/ledger");
  revalidatePath("/accounting/reports/pl");
  revalidatePath("/accounting/reports/bs");
  revalidatePath("/accounting/reports/trial-balance");
}

async function requireContractPrepayCompanyId(): Promise<string> {
  const session = await getSession();
  if (!session?.sub) {
    throw new Error("請先登入");
  }
  const companyId = await requireCompanyId();
  const allowed = await canAccessCompanyTenantData(
    session.sub,
    companyId,
    session.isSuperAdmin === true
  );
  if (!allowed) {
    throw new Error("無權執行此操作");
  }
  return companyId;
}

function toNumber(d: unknown): number {
  if (typeof d === "number") return d;
  return Number(d);
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function prepaidOnContract(
  prepayments: { linkedDocumentId: string | null; amount: unknown }[],
  contractId: string,
  contractDocumentNo: string
): number {
  return prepayments
    .filter(
      (p) =>
        p.linkedDocumentId != null &&
        (p.linkedDocumentId === contractId || p.linkedDocumentId === contractDocumentNo)
    )
    .reduce((sum, p) => sum + toNumber(p.amount), 0);
}

export type ContractPrepayActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

export async function linkOpenPrepaymentToContract(
  formData: FormData
): Promise<ContractPrepayActionResult> {
  try {
    const companyId = await requireContractPrepayCompanyId();
    const prepaymentId = String(formData.get("prepaymentId") ?? "").trim();
    const contractId = String(formData.get("contractId") ?? "").trim();
    const amountRaw = String(formData.get("amount") ?? "").trim();
    const amount = Number.parseFloat(amountRaw);

    if (!prepaymentId || !contractId) {
      return { ok: false, message: "請選擇合同並確認預收款。" };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, message: "對接金額須為大於 0 的數字。" };
    }

    const prepayments = await prisma.prepayment.findMany({
      where: { companyId },
      select: { id: true, amount: true, linkedDocumentId: true, payerName: true, customerId: true, status: true },
    });

    const prepayment = prepayments.find((p) => p.id === prepaymentId);
    if (!prepayment || prepayment.status !== "OPEN") {
      return { ok: false, message: "找不到可對接的開放中預收款。" };
    }

    const prepayAmount = toNumber(prepayment.amount);
    if (Math.abs(amount - prepayAmount) > 0.009) {
      return {
        ok: false,
        message: "目前僅支援以預收款全額對接；請將「本次對接金額」設為與預收款金額一致。",
      };
    }

    const contract = await prisma.salesDocument.findFirst({
      where: {
        id: contractId,
        companyId,
        type: "CONTRACT",
        status: { not: "CANCELLED" },
      },
      include: { customer: { select: { name: true } } },
    });
    if (!contract) {
      return { ok: false, message: "找不到有效的銷售合同。" };
    }

    if (prepayment.customerId) {
      if (prepayment.customerId !== contract.customerId) {
        return { ok: false, message: "預收款所屬客戶與合同客戶不一致，無法對接。" };
      }
    } else {
      const payer = norm(prepayment.payerName);
      const custName = norm(contract.customer?.name);
      if (!payer || payer !== custName) {
        return {
          ok: false,
          message: "預收款缺少客戶關聯或付款人名稱與合同客戶不一致，請先在預收款中補齊客戶。",
        };
      }
    }

    const totalAmount = toNumber(contract.totalAmount);
    const othersLinked = prepaidOnContract(
      prepayments.filter((p) => p.id !== prepayment.id),
      contract.id,
      contract.documentNo
    );
    if (othersLinked + prepayAmount > totalAmount + 0.01) {
      return {
        ok: false,
        message: "對接後已收預付款將超過合同總額，請檢查金額或選擇其他合同。",
      };
    }

    await prisma.prepayment.update({
      where: { id: prepaymentId, companyId },
      data: {
        linkedDocumentType: "CONTRACT",
        linkedDocumentId: contract.id,
        customerId: prepayment.customerId ?? contract.customerId,
      },
    });

    if (contract.status === "CONFIRMED" || contract.status === "COMPLETED") {
      await recognizePrepaymentAsRevenue(prisma, companyId, prepaymentId);
      await syncContractAndLinkedPrepaymentsToRevenue(prisma, companyId, contract.id);
      revalidateRevenuePaths();
    }

    revalidatePath("/financial/contract-invoice-prepay");
    revalidatePath("/financial/prepayments");
    revalidatePath("/accounting/ar");
    revalidatePath("/dashboard");
    return { ok: true, message: "已將預收款對接至所選合同。" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "對接失敗";
    return { ok: false, message: msg };
  }
}

export async function createContractDifferenceProformaInvoice(
  formData: FormData
): Promise<ContractPrepayActionResult> {
  try {
    const companyId = await requireContractPrepayCompanyId();
    const contractId = String(formData.get("contractId") ?? "").trim();
    if (!contractId) {
      return { ok: false, message: "請先選擇合同。" };
    }

    const contract = await prisma.salesDocument.findFirst({
      where: {
        id: contractId,
        companyId,
        type: "CONTRACT",
        status: { not: "CANCELLED" },
      },
      include: {
        items: { orderBy: { id: "asc" }, take: 1 },
        children: {
          where: { type: "PROFORMA_INVOICE", status: { not: "CANCELLED" } },
          select: { totalAmount: true },
        },
      },
    });

    if (!contract) {
      return { ok: false, message: "找不到有效的銷售合同。" };
    }

    if (!contract.items.length) {
      return { ok: false, message: "合同無產品明細，無法自動生成差額發票；請先在合同中維護明細。" };
    }

    const totalAmount = toNumber(contract.totalAmount);
    const invoicedAmount = contract.children.reduce((s, ch) => s + toNumber(ch.totalAmount), 0);
    const pending = Math.max(0, totalAmount - invoicedAmount);
    if (pending < 0.01) {
      return { ok: false, message: "此合同已無待開票金額。" };
    }

    const first = contract.items[0]!;
    const documentNo = `PI-${Date.now()}`;
    const pendingDec = new Prisma.Decimal(pending.toFixed(2));

    await prisma.salesDocument.create({
      data: {
        companyId,
        type: "PROFORMA_INVOICE",
        documentNo,
        customerId: contract.customerId,
        date: new Date(),
        dueDate: null,
        totalAmount: pendingDec,
        status: "DRAFT",
        notes: `差額發票（依合同 ${contract.documentNo} 待開票金額自動建立）`,
        parentId: contract.id,
        items: {
          create: [
            {
              productId: first.productId,
              quantity: 1,
              unitPrice: pendingDec,
              discount: new Prisma.Decimal(0),
              taxRate: new Prisma.Decimal(0),
              total: pendingDec,
            },
          ],
        },
      },
    });

    revalidatePath("/financial/contract-invoice-prepay");
    revalidatePath("/sales/proforma-invoices");
    revalidatePath("/accounting/ar");
    revalidatePath("/dashboard");
    return { ok: true, message: `已建立預收發票 ${documentNo}（金額 $${pending.toFixed(2)}）。` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "建立發票失敗";
    return { ok: false, message: msg };
  }
}

/**
 * 方案 B：於應收頁登記「收取剩餘待收」——建立已對接至該合同的預收款（與預收款管理表單一致之資料來源）。
 */
export async function receiveContractRemainingAsPrepayment(
  formData: FormData
): Promise<ContractPrepayActionResult> {
  try {
    const companyId = await requireContractPrepayCompanyId();
    const contractId = String(formData.get("contractId") ?? "").trim();
    const amountRaw = String(formData.get("amount") ?? "").trim();
    const amountNum = Number.parseFloat(amountRaw);
    const reference = String(formData.get("reference") ?? "").trim() || null;
    const noteRaw = String(formData.get("note") ?? "").trim();
    const note = noteRaw || "應收頁收取剩餘待收";
    const receivedRaw = String(formData.get("receivedAt") ?? "").trim();

    if (!contractId) {
      return { ok: false, message: "缺少合同。" };
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return { ok: false, message: "收款金額須為大於 0 的數字。" };
    }

    const contract = await prisma.salesDocument.findFirst({
      where: {
        id: contractId,
        companyId,
        type: "CONTRACT",
        status: { not: "CANCELLED" },
      },
      include: { customer: { select: { name: true } } },
    });
    if (!contract) {
      return { ok: false, message: "找不到有效的銷售合同。" };
    }

    const prepayments = await prisma.prepayment.findMany({
      where: { companyId },
      select: { linkedDocumentId: true, amount: true },
    });

    const totalAmount = toNumber(contract.totalAmount);
    const prepaid = prepaidOnContract(prepayments, contract.id, contract.documentNo);
    const remaining = Math.max(0, totalAmount - prepaid);

    if (remaining < 0.01) {
      return { ok: false, message: "此合同已無剩餘待收。" };
    }
    if (amountNum > remaining + 0.01) {
      return {
        ok: false,
        message: `收款金額不可超過剩餘待收（目前最多 $${remaining.toFixed(2)}）。`,
      };
    }

    const payerName = contract.customer?.name?.trim() || null;
    let receivedAt = new Date();
    if (receivedRaw) {
      const [y, m, d] = receivedRaw.split("-").map((x) => parseInt(x, 10));
      if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
        receivedAt = new Date(y, m - 1, d);
      }
    }

    const amount = new Prisma.Decimal(amountNum.toFixed(2));

    const created = await prisma.prepayment.create({
      data: {
        companyId,
        amount,
        payerName,
        customerId: contract.customerId,
        reference,
        linkedDocumentType: "CONTRACT",
        linkedDocumentId: contract.id,
        note,
        receivedAt,
      },
    });

    if (contract.status === "CONFIRMED" || contract.status === "COMPLETED") {
      await recognizePrepaymentAsRevenue(prisma, companyId, created.id);
      await syncContractAndLinkedPrepaymentsToRevenue(prisma, companyId, contract.id);
    } else {
      await syncPrepaymentToJournal(prisma, companyId, created.id);
    }

    revalidateRevenuePaths();
    revalidatePath("/accounting/ar");
    revalidatePath("/financial/prepayments");
    revalidatePath("/financial/contract-invoice-prepay");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message: `已登記預收款 $${amountNum.toFixed(2)} 並對接至合同 ${contract.documentNo}。`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "登記失敗";
    return { ok: false, message: msg };
  }
}
