/**
 * 修復報價↔合同一致性：
 * 1) 凡有非取消 CONTRACT 子單的報價 → CONFIRMED
 * 2) 刪除同一報價下多餘的 DRAFT 合同（保留最早一張非 DRAFT，否則保留最早一張）
 * 3) 修正合同頭金額 ≠ 明細合計
 * 4) 補幾張「未轉合同」的最新待處理報價（供列表展示）
 *
 * Usage: npx tsx scripts/fix-quote-contract-consistency.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BATCH_TAG = "[SEED-QT-PENDING-OPEN]";

async function main() {
  const company = await prisma.company.findFirst({ where: { code: "CW" } });
  if (!company) throw new Error("找不到 CW 公司");
  const companyId = company.id;

  // —— 1) 有 CONTRACT 子單的報價 → CONFIRMED ——
  const quotesWithCt = await prisma.salesDocument.findMany({
    where: {
      companyId,
      type: "QUOTATION",
      children: { some: { type: "CONTRACT", status: { not: "CANCELLED" } } },
    },
    select: { id: true, documentNo: true, status: true },
  });
  const toConfirm = quotesWithCt.filter((q) => q.status !== "CONFIRMED");
  if (toConfirm.length) {
    await prisma.salesDocument.updateMany({
      where: { id: { in: toConfirm.map((q) => q.id) } },
      data: { status: "CONFIRMED" },
    });
  }
  console.log(`報價→CONFIRMED（已有合同）: ${toConfirm.length} 筆`, toConfirm.map((q) => q.documentNo));

  // —— 2) 清理同一報價多餘 DRAFT 合同 ——
  const converted = await prisma.salesDocument.findMany({
    where: {
      companyId,
      type: "QUOTATION",
      children: { some: { type: "CONTRACT" } },
    },
    include: {
      children: {
        where: { type: "CONTRACT" },
        orderBy: { createdAt: "asc" },
        select: { id: true, documentNo: true, status: true, createdAt: true },
      },
    },
  });

  let deletedDrafts = 0;
  for (const q of converted) {
    if (q.children.length <= 1) continue;
    const keep =
      q.children.find((c) => c.status !== "DRAFT" && c.status !== "CANCELLED") ?? q.children[0];
    const extras = q.children.filter((c) => c.id !== keep.id && c.status === "DRAFT");
    for (const ex of extras) {
      await prisma.salesDocumentItem.deleteMany({ where: { salesDocumentId: ex.id } });
      await prisma.salesDocument.delete({ where: { id: ex.id } });
      deletedDrafts++;
      console.log(`  刪除重複 DRAFT 合同 ${ex.documentNo}（父報價 ${q.documentNo}，保留 ${keep.documentNo}）`);
    }
  }
  console.log(`已刪重複 DRAFT 合同: ${deletedDrafts} 筆`);

  // —— 3) 合同頭金額對齊明細 ——
  const contracts = await prisma.salesDocument.findMany({
    where: { companyId, type: "CONTRACT" },
    include: { items: { select: { total: true } } },
  });
  let amountFixed = 0;
  for (const c of contracts) {
    const sum = c.items.reduce((a, i) => a.add(i.total), new Prisma.Decimal(0));
    if (!sum.equals(c.totalAmount)) {
      await prisma.salesDocument.update({
        where: { id: c.id },
        data: { totalAmount: sum },
      });
      amountFixed++;
      console.log(`  修正金額 ${c.documentNo}: ${c.totalAmount} → ${sum}`);
    }
  }
  console.log(`金額修正: ${amountFixed} 筆`);

  // —— 4) 補未轉合同的待處理報價 ——
  const skus = ["PROD-001", "PROD-002", "PROD-003", "PROD-004"] as const;
  const skuToId: Record<string, string> = {};
  for (const sku of skus) {
    const p = await prisma.product.findUnique({
      where: { companyId_sku: { companyId, sku } },
      select: { id: true },
    });
    if (!p) throw new Error(`缺少產品 ${sku}`);
    skuToId[sku] = p.id;
  }

  const customerCodes = [
    "CUST-INV-202500059", // 華園
    "CUST-INV-202500053", // 新華
    "HK-NUT-020", // 許嘉怡
    "CUST-INV-202500088", // 九龍城批發
  ];
  const customers = await prisma.customer.findMany({
    where: { companyId, code: { in: customerCodes } },
    select: { id: true, code: true },
  });
  const byCode = new Map(customers.map((c) => [c.code, c.id]));

  type OpenQuote = {
    ts: number;
    date: Date;
    customerCode: string;
    lines: { sku: (typeof skus)[number]; qty: number; unitPrice: string }[];
    notes: string;
  };

  const openQuotes: OpenQuote[] = [
    {
      ts: 1785600000101,
      date: new Date("2026-07-31T10:20:00+08:00"),
      customerCode: "CUST-INV-202500059",
      lines: [{ sku: "PROD-002", qty: 450, unitPrice: "132" }],
      notes: `中秋檔期開心果詢價；待確認門店分貨表。 ${BATCH_TAG}`,
    },
    {
      ts: 1785686400202,
      date: new Date("2026-08-01T15:10:00+08:00"),
      customerCode: "CUST-INV-202500053",
      lines: [
        { sku: "PROD-001", qty: 600, unitPrice: "118" },
        { sku: "PROD-004", qty: 300, unitPrice: "108" },
      ],
      notes: `新華渠道碧根果＋杏仁組合報價；待採購覆核單價。 ${BATCH_TAG}`,
    },
    {
      ts: 1785772800303,
      date: new Date("2026-08-02T11:40:00+08:00"),
      customerCode: "HK-NUT-020",
      lines: [{ sku: "PROD-003", qty: 80, unitPrice: "98" }],
      notes: `零售客戶核桃仁小批；待確認自提時段。 ${BATCH_TAG}`,
    },
    {
      ts: 1785859200404,
      date: new Date("2026-08-03T09:55:00+08:00"),
      customerCode: "CUST-INV-202500088",
      lines: [
        { sku: "PROD-002", qty: 200, unitPrice: "132" },
        { sku: "PROD-003", qty: 150, unitPrice: "98" },
      ],
      notes: `批發檔口八月補貨報價；待確認到倉日。 ${BATCH_TAG}`,
    },
  ];

  // 冪等：清舊批次再開
  const oldOpen = await prisma.salesDocument.findMany({
    where: { companyId, type: "QUOTATION", notes: { contains: BATCH_TAG } },
    select: { id: true },
  });
  for (const d of oldOpen) {
    await prisma.salesDocumentItem.deleteMany({ where: { salesDocumentId: d.id } });
    await prisma.salesDocument.delete({ where: { id: d.id } });
  }

  for (const q of openQuotes) {
    const customerId = byCode.get(q.customerCode);
    if (!customerId) {
      console.warn(`跳過：缺少客戶 ${q.customerCode}`);
      continue;
    }
    const total = q.lines.reduce(
      (a, l) => a.add(new Prisma.Decimal(l.unitPrice).mul(l.qty)),
      new Prisma.Decimal(0),
    );
    await prisma.salesDocument.create({
      data: {
        companyId,
        type: "QUOTATION",
        documentNo: `QT-${q.ts}`,
        customerId,
        date: q.date,
        totalAmount: total,
        status: "PENDING",
        notes: q.notes,
        items: {
          create: q.lines.map((l) => ({
            productId: skuToId[l.sku],
            quantity: l.qty,
            unitPrice: new Prisma.Decimal(l.unitPrice),
            discount: new Prisma.Decimal(0),
            taxRate: new Prisma.Decimal(0),
            total: new Prisma.Decimal(l.unitPrice).mul(l.qty),
          })),
        },
      },
    });
    console.log(`  新增待處理報價 QT-${q.ts} ${q.date.toISOString().slice(0, 10)}`);
  }

  // —— 摘要 ——
  const qt = await prisma.salesDocument.groupBy({
    by: ["status"],
    where: { companyId, type: "QUOTATION" },
    _count: true,
  });
  const ct = await prisma.salesDocument.groupBy({
    by: ["status"],
    where: { companyId, type: "CONTRACT" },
    _count: true,
  });
  console.log("報價狀態:", qt);
  console.log("合同狀態:", ct);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
