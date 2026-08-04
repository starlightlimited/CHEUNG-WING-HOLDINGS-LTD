"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDefaultCompanyId } from "@/lib/company";
import { nextJournalEntryNo } from "@/lib/finance/journal-entry-no";
import { syncPaidPaymentRequestToJournal } from "@/lib/finance/sync-payment-request-journal";
import {
  PREPAYMENT_REVENUE_CUTOFF,
  recognizePrepaymentAsRevenue,
  syncPayableToJournal,
  syncPrepaymentToJournal,
  syncReceivableToJournal,
} from "@/lib/finance/sync-business-journals";

function revalidateAccountingPaths() {
  revalidatePath("/accounting/journals");
  revalidatePath("/accounting/reports/pl");
  revalidatePath("/accounting/reports/bs");
  revalidatePath("/accounting/reports/trial-balance");
  revalidatePath("/accounting/ledger");
}

export async function deleteProduct(id: string): Promise<void> {
  const companyId = await getDefaultCompanyId();
  await prisma.product.delete({
    where: { id, companyId },
  });
  revalidatePath("/products/list");
  revalidatePath("/products/basic-info");
  revalidatePath("/data-entry/product-master");
}

export async function saveProductBasicInfo(
  id: string | null,
  data: {
    sku: string;
    name: string;
    barcode: string | null;
    description: string | null;
    price: number;
    specs: any;
    attachments: any;
  }
): Promise<void> {
  const companyId = await getDefaultCompanyId();
  
  if (id) {
    const product = await prisma.product.findUnique({ where: { id, companyId } });
    if (!product) throw new Error("Product not found");
    
    const currentAttributes = product.attributes ? (typeof product.attributes === 'string' ? JSON.parse(product.attributes as string) : product.attributes) : {};
    
    await prisma.product.update({
      where: { id, companyId },
      data: {
        sku: data.sku,
        name: data.name,
        barcode: data.barcode,
        description: data.description,
        price: new Prisma.Decimal(data.price),
        attributes: {
          ...(currentAttributes as Record<string, any>),
          specs: data.specs,
        },
        attachments: data.attachments,
      },
    });
  } else {
    await prisma.product.create({
      data: {
        companyId,
        sku: data.sku,
        name: data.name,
        barcode: data.barcode,
        description: data.description,
        price: new Prisma.Decimal(data.price),
        attributes: {
          specs: data.specs,
        },
        attachments: data.attachments,
      },
    });
  }
  
  revalidatePath("/products/list");
  revalidatePath("/products/basic-info");
  revalidatePath("/data-entry/product-master");
}

export async function updateProductSpecsMedia(
  productId: string,
  specs: any,
  attachments: any
): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const product = await prisma.product.findUnique({
    where: { id: productId, companyId },
  });
  if (!product) return;

  const currentAttributes = product.attributes ? (typeof product.attributes === 'string' ? JSON.parse(product.attributes as string) : product.attributes) : {};

  await prisma.product.update({
    where: { id: productId, companyId },
    data: {
      attributes: {
        ...(currentAttributes as Record<string, any>),
        specs,
      },
      attachments,
    },
  });
  revalidatePath("/products/specs-media");
}

export async function updateProductTypesAttributes(
  productId: string,
  typesData: any
): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const product = await prisma.product.findUnique({
    where: { id: productId, companyId },
  });
  if (!product) return;

  const currentAttributes = product.attributes ? (typeof product.attributes === 'string' ? JSON.parse(product.attributes as string) : product.attributes) : {};

  await prisma.product.update({
    where: { id: productId, companyId },
    data: {
      attributes: {
        ...(currentAttributes as Record<string, any>),
        ...typesData,
      },
    },
  });
  revalidatePath("/products/types-attributes");
}

export async function updateProductBOM(
  productId: string,
  bom: any
): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const product = await prisma.product.findUnique({
    where: { id: productId, companyId },
  });
  if (!product) return;

  const currentAttributes = product.attributes ? (typeof product.attributes === 'string' ? JSON.parse(product.attributes as string) : product.attributes) : {};

  await prisma.product.update({
    where: { id: productId, companyId },
    data: {
      attributes: {
        ...(currentAttributes as Record<string, any>),
        bom,
      },
    },
  });
  revalidatePath("/products/accessories-bom");
}

export async function batchUpdateProductPricing(
  updates: { id: string; price: number; cost: number; attributes: any }[]
): Promise<void> {
  const companyId = await getDefaultCompanyId();
  
  await prisma.$transaction(
    updates.map(update => {
      return prisma.product.update({
        where: { id: update.id, companyId },
        data: {
          price: new Prisma.Decimal(update.price),
          cost: new Prisma.Decimal(update.cost),
          attributes: update.attributes,
        }
      })
    })
  );
  revalidatePath("/products/pricing");
  revalidatePath("/products/basic-info");
  revalidatePath("/data-entry/product-master");
}

export async function createInventoryTransaction(formData: FormData): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const productId = String(formData.get("productId") ?? "").trim();
  const type = String(formData.get("type") ?? "IN") as "IN" | "OUT";
  const quantity = Number.parseInt(String(formData.get("quantity") ?? "0"), 10);
  const unitCost = new Prisma.Decimal(String(formData.get("unitCost") ?? "0"));
  const warehouseId = String(formData.get("warehouseId") ?? "").trim() || null;
  const referenceType = String(formData.get("referenceType") ?? "").trim() || null;

  if (!productId || isNaN(quantity) || quantity <= 0) return;

  // 1. Transaction
  await prisma.inventoryTransaction.create({
    data: {
      companyId,
      productId,
      type,
      quantity,
      unitCost,
      referenceType,
    },
  });

  // 2. Update Balance
  const qtyChange = type === "IN" ? quantity : -quantity;
  await prisma.inventoryBalance.upsert({
    where: {
      companyId_productId_warehouseId: {
        companyId,
        productId,
        warehouseId: warehouseId || "",
      },
    },
    create: {
      companyId,
      productId,
      warehouseId,
      quantity: qtyChange,
    },
    update: {
      quantity: { increment: qtyChange },
    },
  });

  revalidatePath("/data-entry/warehouse-stock");
  revalidatePath("/sales/inventory-procurement");
  revalidatePath("/inventory/transactions");
  revalidatePath("/inventory/details");
}

/** 採購明細收貨入庫（依採購單明細關聯庫存流水） */
export async function receivePurchaseOrderLine(formData: FormData): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const purchaseOrderItemId = String(formData.get("purchaseOrderItemId") ?? "").trim();
  const quantity = Number.parseInt(String(formData.get("quantity") ?? "0"), 10);
  const unitCost = new Prisma.Decimal(String(formData.get("unitCost") ?? "0"));

  if (!purchaseOrderItemId || !Number.isFinite(quantity) || quantity <= 0) return;

  const line = await prisma.purchaseOrderItem.findFirst({
    where: { id: purchaseOrderItemId, purchaseOrder: { companyId } },
    include: { purchaseOrder: true },
  });
  if (!line || line.purchaseOrder.status === "CANCELLED") return;

  const receivedAgg = await prisma.inventoryTransaction.aggregate({
    where: {
      companyId,
      productId: line.productId,
      type: "IN",
      referenceType: "PO_RECEIVE",
      referenceId: purchaseOrderItemId,
    },
    _sum: { quantity: true },
  });
  const received = receivedAgg._sum.quantity ?? 0;
  const remaining = line.quantity - received;
  if (quantity > remaining) return;

  await prisma.inventoryTransaction.create({
    data: {
      companyId,
      productId: line.productId,
      type: "IN",
      quantity,
      unitCost,
      referenceType: "PO_RECEIVE",
      referenceId: purchaseOrderItemId,
    },
  });

  await prisma.inventoryBalance.upsert({
    where: {
      companyId_productId_warehouseId: {
        companyId,
        productId: line.productId,
        warehouseId: "",
      },
    },
    create: {
      companyId,
      productId: line.productId,
      warehouseId: "",
      quantity,
    },
    update: {
      quantity: { increment: quantity },
    },
  });

  revalidatePath("/sales/inventory-procurement");
  revalidatePath("/data-entry/warehouse-stock");
  revalidatePath("/inventory/details");
  revalidatePath("/inventory/transactions");
}

/** 銷售明細出庫（依銷售單據明細關聯庫存流水） */
export async function issueSalesDocumentLine(formData: FormData): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const salesDocumentItemId = String(formData.get("salesDocumentItemId") ?? "").trim();
  const quantity = Number.parseInt(String(formData.get("quantity") ?? "0"), 10);
  const unitCost = new Prisma.Decimal(String(formData.get("unitCost") ?? "0"));

  if (!salesDocumentItemId || !Number.isFinite(quantity) || quantity <= 0) return;

  const line = await prisma.salesDocumentItem.findFirst({
    where: { id: salesDocumentItemId, salesDocument: { companyId } },
    include: { salesDocument: true },
  });
  if (!line || line.salesDocument.status === "CANCELLED") return;

  const shippedAgg = await prisma.inventoryTransaction.aggregate({
    where: {
      companyId,
      productId: line.productId,
      type: "OUT",
      referenceType: "SO_SHIP",
      referenceId: salesDocumentItemId,
    },
    _sum: { quantity: true },
  });
  const shipped = shippedAgg._sum.quantity ?? 0;
  const remaining = line.quantity - shipped;
  if (quantity > remaining) return;

  await prisma.inventoryTransaction.create({
    data: {
      companyId,
      productId: line.productId,
      type: "OUT",
      quantity,
      unitCost,
      referenceType: "SO_SHIP",
      referenceId: salesDocumentItemId,
    },
  });

  await prisma.inventoryBalance.upsert({
    where: {
      companyId_productId_warehouseId: {
        companyId,
        productId: line.productId,
        warehouseId: "",
      },
    },
    create: {
      companyId,
      productId: line.productId,
      warehouseId: "",
      quantity: -quantity,
    },
    update: {
      quantity: { increment: -quantity },
    },
  });

  revalidatePath("/sales/inventory-procurement");
  revalidatePath("/data-entry/warehouse-stock");
  revalidatePath("/inventory/details");
  revalidatePath("/inventory/transactions");
}

export async function updateCompanyProfile(formData: FormData): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const taxId = String(formData.get("taxId") ?? "").trim() || null;

  if (!name) return;

  await prisma.company.update({
    where: { id: companyId },
    data: { name, address, phone, email, taxId },
  });
  revalidatePath("/data-entry/company-profile");
}

export async function createDocumentNumberRule(formData: FormData): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const documentType = String(formData.get("documentType") ?? "").trim();
  const prefix = String(formData.get("prefix") ?? "").trim();
  const dateFormat = String(formData.get("dateFormat") ?? "").trim() || null;
  const sequenceLen = Number.parseInt(String(formData.get("sequenceLen") ?? "3"), 10);

  if (!documentType || !prefix || isNaN(sequenceLen)) return;

  await prisma.documentNumberRule.upsert({
    where: { companyId_documentType: { companyId, documentType } },
    create: { companyId, documentType, prefix, dateFormat, sequenceLen },
    update: { prefix, dateFormat, sequenceLen },
  });
  revalidatePath("/data-entry/document-numbers");
}

export async function deleteDocumentNumberRule(formData: FormData): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const ruleId = String(formData.get("ruleId") ?? "").trim();
  if (!ruleId) return;

  const rule = await prisma.documentNumberRule.findFirst({
    where: { id: ruleId, companyId },
  });
  if (!rule) return;

  await prisma.documentNumberRule.delete({ where: { id: ruleId } });
  revalidatePath("/data-entry/document-numbers");
}

export async function createGlAccount(formData: FormData): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "ASSET") as
    | "ASSET"
    | "LIABILITY"
    | "EQUITY"
    | "REVENUE"
    | "EXPENSE";
  if (!code || !name) return;
  try {
    await prisma.glAccount.create({
      data: { companyId, code, name, type },
    });
  } catch {
    return;
  }
  revalidatePath("/accounting/accounts");
}

export async function createInitialInventory(formData: FormData): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const productId = String(formData.get("productId") ?? "").trim();
  const quantity = Number.parseInt(String(formData.get("quantity") ?? "0"), 10);
  const unitCost = new Prisma.Decimal(String(formData.get("unitCost") ?? "0"));
  const warehouseId = String(formData.get("warehouseId") ?? "").trim() || null;

  if (!productId || isNaN(quantity) || quantity <= 0) return;

  // 1. 增加庫存臺賬
  await prisma.inventoryBalance.upsert({
    where: {
      companyId_productId_warehouseId: {
        companyId,
        productId,
        warehouseId: warehouseId || "",
      },
    },
    create: {
      companyId,
      productId,
      warehouseId,
      quantity,
    },
    update: {
      quantity: { increment: quantity },
    },
  });

  // 2. 記錄交易流水 (期初錄入)
  await prisma.inventoryTransaction.create({
    data: {
      companyId,
      productId,
      type: "IN",
      quantity,
      unitCost,
      referenceType: "INITIAL",
      referenceId: "INIT-" + new Date().getTime(),
    },
  });

  revalidatePath("/data-entry/warehouse-stock");
  revalidatePath("/inventory/details");
}

export async function toggleGlAccountActive(id: string, isActive: boolean) {
  const companyId = await getDefaultCompanyId();
  const acc = await prisma.glAccount.findFirst({ where: { id, companyId } });
  if (!acc) return;
  await prisma.glAccount.update({ where: { id }, data: { isActive } });
  revalidatePath("/accounting/accounts");
}

export async function toggleGlAccountForm(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";
  if (!id) return;
  await toggleGlAccountActive(id, isActive);
}

export async function createAccountingCategory(formData: FormData): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!code || !name) return;
  try {
    await prisma.accountingCategory.create({
      data: { companyId, code, name, description },
    });
  } catch {
    return;
  }
  revalidatePath("/accounting/categories");
}

type LineInput = {
  glAccountId: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  memo: string | null;
  accountingCategoryId: string | null;
};

function parseJournalLines(
  formData: FormData,
  categories: { id: string }[],
): LineInput[] {
  const lines: LineInput[] = [];
  const defaultCat = categories[0]?.id ?? null;
  for (let i = 0; i < 8; i++) {
    const glAccountId = String(formData.get(`line_${i}_account`) ?? "").trim();
    const debitRaw = String(formData.get(`line_${i}_debit`) ?? "").trim();
    const creditRaw = String(formData.get(`line_${i}_credit`) ?? "").trim();
    const memo = String(formData.get(`line_${i}_memo`) ?? "").trim() || null;
    const rawCat = String(formData.get(`line_${i}_category`) ?? "").trim();
    const catId = (rawCat || defaultCat || null) as string | null;
    if (!glAccountId) continue;
    const debit = new Prisma.Decimal(debitRaw === "" ? 0 : debitRaw);
    const credit = new Prisma.Decimal(creditRaw === "" ? 0 : creditRaw);
    if (debit.eq(0) && credit.eq(0)) continue;
    lines.push({
      glAccountId,
      debit,
      credit,
      memo,
      accountingCategoryId: catId || null,
    });
  }
  return lines;
}

export async function createJournalEntry(formData: FormData): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const categories = await prisma.accountingCategory.findMany({
    where: { companyId },
    take: 1,
  });
  const entryDateRaw = String(formData.get("entryDate") ?? "");
  const description = String(formData.get("description") ?? "").trim() || null;
  const entryDate = entryDateRaw ? new Date(entryDateRaw) : new Date();
  if (Number.isNaN(entryDate.getTime())) return;

  const lines = parseJournalLines(formData, categories);
  if (lines.length < 2) return;

  let td = new Prisma.Decimal(0);
  let tc = new Prisma.Decimal(0);
  for (const l of lines) {
    if (!l.debit.eq(0) && !l.credit.eq(0)) return;
    td = td.add(l.debit);
    tc = tc.add(l.credit);
  }
  if (!td.eq(tc)) return;

  const entryNo = await nextJournalEntryNo(companyId);
  // 正式帳：新建憑證直接過帳，立即進入總帳明細
  await prisma.journalEntry.create({
    data: {
      companyId,
      entryNo,
      entryDate,
      description,
      status: "POSTED",
      lines: {
        create: lines.map((l) => ({
          glAccountId: l.glAccountId,
          debit: l.debit,
          credit: l.credit,
          memo: l.memo,
          accountingCategoryId: l.accountingCategoryId || null,
        })),
      },
    },
  });
  revalidateAccountingPaths();
  revalidatePath("/dashboard");
}

export async function postJournalEntry(id: string): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const entry = await prisma.journalEntry.findFirst({
    where: { id, companyId },
    include: { lines: true },
  });
  if (!entry) return;
  if (entry.status !== "DRAFT") return;
  let td = new Prisma.Decimal(0);
  let tc = new Prisma.Decimal(0);
  for (const l of entry.lines) {
    td = td.add(l.debit);
    tc = tc.add(l.credit);
  }
  if (!td.eq(tc)) return;
  await prisma.journalEntry.update({
    where: { id },
    data: { status: "POSTED" },
  });
  revalidateAccountingPaths();
  revalidatePath("/dashboard");
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const entry = await prisma.journalEntry.findFirst({
    where: { id, companyId, status: "DRAFT" },
  });
  if (!entry) return;
  await prisma.journalEntry.delete({ where: { id } });
  revalidatePath("/accounting/journals");
  revalidatePath("/dashboard");
}

export async function postJournalForm(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (id) await postJournalEntry(id);
}

export async function deleteJournalForm(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (id) await deleteJournalEntry(id);
}

export async function upsertBudgetLine(formData: FormData): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const year = Number.parseInt(String(formData.get("year") ?? ""), 10);
  const month = Number.parseInt(String(formData.get("month") ?? ""), 10);
  const glAccountId = String(formData.get("glAccountId") ?? "").trim();
  const budgetType = String(formData.get("budgetType") ?? "EXPENSE") as "REVENUE" | "EXPENSE";
  const amount = new Prisma.Decimal(String(formData.get("amount") ?? "0"));
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!year || month < 1 || month > 12 || !glAccountId) return;

  await prisma.budgetLine.upsert({
    where: {
      companyId_year_month_glAccountId_budgetType: {
        companyId,
        year,
        month,
        glAccountId,
        budgetType,
      },
    },
    create: {
      companyId,
      year,
      month,
      glAccountId,
      amount,
      budgetType,
      note,
    },
    update: { amount, note },
  });
  revalidatePath("/financial/budget");
  revalidatePath("/financial/analysis-reports");
  revalidatePath("/accounting/reports/pl");
  revalidatePath("/dashboard");
}

export async function createPaymentRequest(formData: FormData): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const title = String(formData.get("title") ?? "").trim();
  const amount = new Prisma.Decimal(String(formData.get("amount") ?? "0"));
  const purpose = String(formData.get("purpose") ?? "").trim() || null;
  const requestedBy = String(formData.get("requestedBy") ?? "").trim() || null;
  const department = String(formData.get("department") ?? "").trim() || null;
  const category = String(formData.get("category") ?? "").trim() || null;
  const approverRole = String(formData.get("approverRole") ?? "").trim() || null;
  const action = String(formData.get("action") ?? "submit");
  
  if (!title || amount.lte(0)) return;
  
  const status = action === "draft" ? "DRAFT" : "SUBMITTED";
  
  await prisma.paymentRequest.create({
    data: {
      companyId,
      title,
      amount,
      purpose,
      requestedBy,
      department,
      category,
      approverRole,
      status,
    },
  });
  revalidatePath("/financial/payment-requests");
  revalidatePath("/accounting/ap");
  revalidatePath("/dashboard");
}

export async function setPaymentRequestStatus(
  id: string,
  status: "APPROVED" | "REJECTED" | "PAID",
  approvedBy?: string,
): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const row = await prisma.paymentRequest.findFirst({ where: { id, companyId } });
  if (!row) return;
  await prisma.paymentRequest.update({
    where: { id },
    data: {
      status,
      approvedBy: approvedBy ?? "審批人",
      approvedAt:
        status === "APPROVED" || status === "REJECTED" || status === "PAID" ? new Date() : null,
    },
  });

  if (status === "PAID") {
    const sync = await syncPaidPaymentRequestToJournal(prisma, companyId, id);
    if (sync.ok && sync.created) revalidateAccountingPaths();
  }

  revalidatePath("/financial/payment-requests");
  revalidatePath("/accounting/ap");
  revalidatePath("/dashboard");
}

export async function paymentRequestDecisionForm(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "") as
    | "APPROVED"
    | "REJECTED"
    | "PAID";
  const by = String(formData.get("by") ?? "").trim() || "財務審批";
  if (!id || !["APPROVED", "REJECTED", "PAID"].includes(decision)) return;
  await setPaymentRequestStatus(id, decision, by);
}

export async function createPrepayment(formData: FormData): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const amount = new Prisma.Decimal(String(formData.get("amount") ?? "0"));
  const payerName = String(formData.get("payerName") ?? "").trim() || null;
  const customerId = String(formData.get("customerId") ?? "").trim() || null;
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const linkedDocumentType = String(formData.get("linkedDocumentType") ?? "").trim() || null;
  const linkedDocumentId = String(formData.get("linkedDocumentId") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const receivedRaw = String(formData.get("receivedAt") ?? "").trim();
  let receivedAt = new Date();
  if (receivedRaw) {
    const [y, m, d] = receivedRaw.split("-").map((x) => Number.parseInt(x, 10));
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      receivedAt = new Date(y, m - 1, d);
    }
  }
  if (amount.lte(0)) return;
  const created = await prisma.prepayment.create({
    data: {
      companyId,
      amount,
      payerName,
      customerId,
      reference,
      linkedDocumentType,
      linkedDocumentId,
      note,
      receivedAt,
    },
  });

  // 7 月中前收款，或已對接合同：直接視為已收並轉收入進損益表
  const shouldRecognize =
    created.receivedAt < PREPAYMENT_REVENUE_CUTOFF || Boolean(linkedDocumentId);
  if (shouldRecognize) {
    await recognizePrepaymentAsRevenue(prisma, companyId, created.id);
  } else {
    await syncPrepaymentToJournal(prisma, companyId, created.id);
  }
  revalidateAccountingPaths();
  revalidatePath("/financial/prepayments");
  revalidatePath("/financial/contract-invoice-prepay");
  revalidatePath("/accounting/ar");
  revalidatePath("/dashboard");
}

export async function createReceivable(formData: FormData): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const customerName = String(formData.get("customerName") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim() || null;
  const amount = new Prisma.Decimal(String(formData.get("amount") ?? "0"));
  const description = String(formData.get("description") ?? "").trim() || null;
  const invoiceNo = String(formData.get("invoiceNo") ?? "").trim() || null;
  const dueRaw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = dueRaw ? new Date(dueRaw) : null;
  if (!customerName || amount.lte(0)) return;
  const created = await prisma.accountsReceivable.create({
    data: {
      companyId,
      customerName,
      customerId,
      description,
      amount,
      invoiceNo,
      dueDate,
      status: "OPEN",
    },
  });
  const sync = await syncReceivableToJournal(prisma, companyId, created.id);
  if (sync.ok && sync.created) revalidateAccountingPaths();
  revalidatePath("/accounting/ar");
  revalidatePath("/financial/prepayments");
  revalidatePath("/financial/contract-invoice-prepay");
  revalidatePath("/dashboard");
}

export async function createPayable(formData: FormData): Promise<void> {
  const companyId = await getDefaultCompanyId();
  const vendorName = String(formData.get("vendorName") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim() || null;
  const amount = new Prisma.Decimal(String(formData.get("amount") ?? "0"));
  const description = String(formData.get("description") ?? "").trim() || null;
  const billNo = String(formData.get("billNo") ?? "").trim() || null;
  const dueRaw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = dueRaw ? new Date(dueRaw) : null;
  if (!vendorName || amount.lte(0)) return;
  const created = await prisma.accountsPayable.create({
    data: {
      companyId,
      vendorName,
      customerId,
      description,
      amount,
      billNo,
      dueDate,
      status: "OPEN",
    },
  });
  const sync = await syncPayableToJournal(prisma, companyId, created.id);
  if (sync.ok && sync.created) revalidateAccountingPaths();
  revalidatePath("/accounting/ap");
  revalidatePath("/dashboard");
}
