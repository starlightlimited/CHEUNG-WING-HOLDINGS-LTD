/**
 * 將合同金額重分配：
 * - 整體合計控制在約 20～30 萬（預設 26.5 萬）
 * - 各合同大致均勻分配（無「主力單」集中）
 * - 同步明細、來源報價、子預收發票；行合計 = qty × 單價
 *
 * Usage: npx tsx scripts/rescale-contract-amounts.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** 整體合同合計目標（落在 20～30 萬） */
const TARGET_TOTAL = 265_000;

function money(n: number): Prisma.Decimal {
  return new Prisma.Decimal(Math.round(n * 100) / 100);
}

/**
 * 依目標總額重算明細：調整數量、單價維持；total 始終 = qty × unitPrice。
 */
function rescaleItems(
  items: {
    id: string;
    productId: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    discount: Prisma.Decimal;
    taxRate: Prisma.Decimal;
    total: Prisma.Decimal;
  }[],
  targetTotal: number,
): {
  productId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  discount: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  total: Prisma.Decimal;
}[] {
  if (items.length === 0) {
    throw new Error("合同無明細，無法重算");
  }

  const currentSum = items.reduce((s, i) => s + Number(i.total), 0);
  const weights =
    currentSum > 0
      ? items.map((i) => Number(i.total) / currentSum)
      : items.map(() => 1 / items.length);

  const next = items.map((item, idx) => {
    const lineTarget = targetTotal * weights[idx];
    const unit = Number(item.unitPrice);
    let qty = unit > 0 ? Math.max(1, Math.round(lineTarget / unit)) : 1;
    if (unit * qty > targetTotal * 1.2 && items.length === 1) {
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
  const diff = Math.round((targetTotal - sum) * 100) / 100;
  if (Math.abs(diff) >= 0.01) {
    const last = next[next.length - 1];
    const unit = Number(last.unitPrice);
    if (unit > 0) {
      const desired = Math.max(unit, Number(last.total) + diff);
      last.quantity = Math.max(1, Math.round(desired / unit));
      last.total = money(last.quantity * unit);
    }
  }

  return next;
}

async function syncLinkedDocs(
  companyId: string,
  contractId: string,
  parentId: string | null,
  newItems: ReturnType<typeof rescaleItems>,
  totalAmount: Prisma.Decimal,
) {
  if (parentId) {
    await prisma.salesDocumentItem.deleteMany({ where: { salesDocumentId: parentId } });
    await prisma.salesDocument.update({
      where: { id: parentId },
      data: {
        totalAmount,
        items: { create: newItems },
      },
    });
  }

  const pis = await prisma.salesDocument.findMany({
    where: { companyId, type: "PROFORMA_INVOICE", parentId: contractId },
    select: { id: true },
  });
  for (const pi of pis) {
    await prisma.salesDocumentItem.deleteMany({ where: { salesDocumentId: pi.id } });
    await prisma.salesDocument.update({
      where: { id: pi.id },
      data: {
        totalAmount,
        items: { create: newItems },
      },
    });
  }
}

/** 均勻分配目標額，最後一筆吃餘數；略加 ±12% 波動使數字不至於完全相同 */
function buildEvenTargets(ids: string[], total: number): Map<string, number> {
  const n = ids.length;
  const base = Math.floor(total / n);
  const targets = new Map<string, number>();
  let acc = 0;

  ids.forEach((id, idx) => {
    if (idx === n - 1) {
      targets.set(id, Math.max(800, total - acc));
      return;
    }
    // 穩定偽隨機波動，避免每次大變
    const wave = 1 + (((idx * 37) % 25) - 12) / 100; // 約 0.88～1.12
    const t = Math.max(800, Math.round(base * wave));
    targets.set(id, t);
    acc += t;
  });

  // 波動後若偏離總額，等比縮放（最後一筆再對齊）
  let sum = [...targets.values()].reduce((a, b) => a + b, 0);
  if (sum !== total && n > 0) {
    const factor = total / sum;
    acc = 0;
    ids.forEach((id, idx) => {
      if (idx === n - 1) {
        targets.set(id, Math.max(800, total - acc));
      } else {
        const t = Math.max(800, Math.round((targets.get(id) || base) * factor));
        targets.set(id, t);
        acc += t;
      }
    });
  }

  return targets;
}

async function main() {
  const company = await prisma.company.findFirst({ where: { code: "CW" } });
  if (!company) throw new Error("找不到 CW 公司");
  const companyId = company.id;

  const contracts = await prisma.salesDocument.findMany({
    where: { companyId, type: "CONTRACT", status: { not: "CANCELLED" } },
    include: { items: true },
    orderBy: { date: "asc" },
  });

  if (contracts.length === 0) {
    console.log("無合同可調整");
    return;
  }

  const targets = buildEvenTargets(
    contracts.map((c) => c.documentNo),
    TARGET_TOTAL,
  );

  console.log(
    `整體合計目標 ${TARGET_TOTAL}（約 ${(TARGET_TOTAL / 10000).toFixed(1)} 萬）；${contracts.length} 筆大致均勻分配`,
  );

  for (const ct of contracts) {
    const target = targets.get(ct.documentNo) ?? 1000;
    const newItems = rescaleItems(ct.items, target);
    const headerTotal = money(newItems.reduce((s, i) => s + Number(i.total), 0));

    await prisma.salesDocumentItem.deleteMany({ where: { salesDocumentId: ct.id } });
    await prisma.salesDocument.update({
      where: { id: ct.id },
      data: {
        totalAmount: headerTotal,
        items: { create: newItems },
      },
    });

    await syncLinkedDocs(companyId, ct.id, ct.parentId, newItems, headerTotal);

    console.log(`  ${ct.documentNo}: ${Number(ct.totalAmount)} → ${Number(headerTotal)}`);
  }

  const after = await prisma.salesDocument.findMany({
    where: { companyId, type: "CONTRACT", status: { not: "CANCELLED" } },
    select: { documentNo: true, totalAmount: true, customer: { select: { name: true } } },
    orderBy: { totalAmount: "desc" },
  });
  const sum = after.reduce((s, c) => s + Number(c.totalAmount), 0);
  const amounts = after.map((c) => Number(c.totalAmount));
  console.log("\n調整後（金額高→低）:");
  for (const c of after) {
    console.log(`  ${c.documentNo}  ${Number(c.totalAmount)}  ${c.customer.name}`);
  }
  console.log(
    `合計: ${sum}（目標 ${TARGET_TOTAL}）；單筆約 ${Math.min(...amounts)}～${Math.max(...amounts)}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
