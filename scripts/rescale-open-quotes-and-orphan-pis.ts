/**
 * 將「未轉合同報價」與「獨立預收發票」縮放到與合同相近的單筆價位（約 0.8～1.3 萬），
 * 避免銷售分析／列表金額與合同脫節。
 *
 * Usage: npx tsx scripts/rescale-open-quotes-and-orphan-pis.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const OPEN_QUOTE_TOTAL = 100_000;
const ORPHAN_PI_TOTAL = 40_000;

function money(n: number): Prisma.Decimal {
  return new Prisma.Decimal(Math.round(n * 100) / 100);
}

function rescaleItems(
  items: {
    productId: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    discount: Prisma.Decimal;
    taxRate: Prisma.Decimal;
    total: Prisma.Decimal;
  }[],
  targetTotal: number,
) {
  if (items.length === 0) throw new Error("無明細");
  const currentSum = items.reduce((s, i) => s + Number(i.total), 0);
  const weights =
    currentSum > 0
      ? items.map((i) => Number(i.total) / currentSum)
      : items.map(() => 1 / items.length);

  const next = items.map((item, idx) => {
    const lineTarget = targetTotal * weights[idx];
    const unit = Number(item.unitPrice);
    let qty = unit > 0 ? Math.max(1, Math.round(lineTarget / unit)) : 1;
    if (items.length === 1 && unit > 0) {
      qty = Math.max(1, Math.round(targetTotal / unit));
    }
    return {
      productId: item.productId,
      quantity: qty,
      unitPrice: item.unitPrice,
      discount: item.discount,
      taxRate: item.taxRate,
      total: money(unit * qty),
    };
  });

  let sum = next.reduce((s, i) => s + Number(i.total), 0);
  const diff = targetTotal - sum;
  if (Math.abs(diff) >= 1) {
    const last = next[next.length - 1];
    const unit = Number(last.unitPrice);
    if (unit > 0) {
      last.quantity = Math.max(1, Math.round((Number(last.total) + diff) / unit));
      last.total = money(last.quantity * unit);
    }
  }
  return next;
}

function evenTargets(ids: string[], total: number): Map<string, number> {
  const n = ids.length;
  const base = Math.floor(total / n);
  const map = new Map<string, number>();
  let acc = 0;
  ids.forEach((id, idx) => {
    if (idx === n - 1) {
      map.set(id, Math.max(800, total - acc));
      return;
    }
    const wave = 1 + (((idx * 41) % 25) - 12) / 100;
    const t = Math.max(800, Math.round(base * wave));
    map.set(id, t);
    acc += t;
  });
  return map;
}

async function applyTargets(
  docs: {
    id: string;
    documentNo: string;
    totalAmount: Prisma.Decimal;
    items: {
      productId: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      discount: Prisma.Decimal;
      taxRate: Prisma.Decimal;
      total: Prisma.Decimal;
    }[];
  }[],
  targets: Map<string, number>,
) {
  for (const doc of docs) {
    const target = targets.get(doc.documentNo) ?? 1000;
    if (doc.items.length === 0) {
      await prisma.salesDocument.update({
        where: { id: doc.id },
        data: { totalAmount: money(target) },
      });
      console.log(`  ${doc.documentNo}: ${Number(doc.totalAmount)} → ${target}（無明細，僅頭）`);
      continue;
    }
    const newItems = rescaleItems(doc.items, target);
    const header = money(newItems.reduce((s, i) => s + Number(i.total), 0));
    await prisma.salesDocumentItem.deleteMany({ where: { salesDocumentId: doc.id } });
    await prisma.salesDocument.update({
      where: { id: doc.id },
      data: { totalAmount: header, items: { create: newItems } },
    });
    console.log(`  ${doc.documentNo}: ${Number(doc.totalAmount)} → ${Number(header)}`);
  }
}

async function main() {
  const company = await prisma.company.findFirst({ where: { code: "CW" } });
  if (!company) throw new Error("找不到 CW");
  const companyId = company.id;

  const openQuotes = await prisma.salesDocument.findMany({
    where: {
      companyId,
      type: "QUOTATION",
      status: { not: "CANCELLED" },
      children: { none: { type: "CONTRACT", status: { not: "CANCELLED" } } },
    },
    include: { items: true },
    orderBy: { date: "asc" },
  });

  console.log(`未轉合同報價 ${openQuotes.length} 筆 → 合計目標 ${OPEN_QUOTE_TOTAL}`);
  if (openQuotes.length) {
    await applyTargets(
      openQuotes,
      evenTargets(
        openQuotes.map((q) => q.documentNo),
        OPEN_QUOTE_TOTAL,
      ),
    );
  }

  const orphanPis = await prisma.salesDocument.findMany({
    where: {
      companyId,
      type: "PROFORMA_INVOICE",
      status: { not: "CANCELLED" },
      OR: [{ parentId: null }, { parent: { is: { type: { not: "CONTRACT" } } } }],
    },
    include: { items: true },
    orderBy: { date: "asc" },
  });

  console.log(`獨立預收 ${orphanPis.length} 筆 → 合計目標 ${ORPHAN_PI_TOTAL}`);
  if (orphanPis.length) {
    await applyTargets(
      orphanPis,
      evenTargets(
        orphanPis.map((q) => q.documentNo),
        ORPHAN_PI_TOTAL,
      ),
    );
  }

  const { getSalesYearAnalytics } = await import("../lib/server/sales-customer-analytics");
  const a = await getSalesYearAnalytics(companyId, 2026);
  console.log("\n分析驗證:", {
    contractWon: a.contractWon,
    pipelineQuoteAmount: a.pipelineQuoteAmount,
    orphanPiAmount: a.orphanPiAmount,
    docCount: a.docCount,
    monthly: a.monthly.filter((m) => m.revenue > 0),
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
