/**
 * 補 2026 年 1–2 月銷售合同（各 2～3 筆）；1 月日期須在 1/8 之後。
 * 含來源報價＋預收發票；寫入後可再跑 db:rescale:contracts 維持整體約 20～30 萬。
 *
 * Usage: npx tsx scripts/seed-contracts-jan-feb-2026.ts
 */
import { Prisma, PrismaClient, SalesDocumentStatus } from "@prisma/client";

const prisma = new PrismaClient();
const BATCH = "[SEED-CT-2026-01-02]";

type Sku = "PROD-001" | "PROD-002" | "PROD-003" | "PROD-004";

type Seed = {
  ts: number;
  date: Date;
  customerCode: string;
  lines: { sku: Sku; qty: number; unitPrice: string }[];
  status: SalesDocumentStatus;
  note: string;
};

const UNIT: Record<Sku, string> = {
  "PROD-001": "118",
  "PROD-002": "132",
  "PROD-003": "98",
  "PROD-004": "108",
};

/** 1 月：1/8 之後 3 筆；2 月：3 筆 */
const SEEDS: Seed[] = [
  {
    ts: 1768204800101,
    date: new Date("2026-01-12T10:20:00+08:00"),
    customerCode: "CUST-INV-202500095",
    lines: [{ sku: "PROD-002", qty: 80, unitPrice: UNIT["PROD-002"] }],
    status: "COMPLETED",
    note: "百佳新年檔前補貨開心果。",
  },
  {
    ts: 1768723200202,
    date: new Date("2026-01-18T14:05:00+08:00"),
    customerCode: "CUST-INV-202500055",
    lines: [
      { sku: "PROD-001", qty: 50, unitPrice: UNIT["PROD-001"] },
      { sku: "PROD-004", qty: 40, unitPrice: UNIT["PROD-004"] },
    ],
    status: "COMPLETED",
    note: "美心春節禮盒原料：碧根果＋杏仁。",
  },
  {
    ts: 1769328000303,
    date: new Date("2026-01-25T11:40:00+08:00"),
    customerCode: "CUST-INV-202500051",
    lines: [{ sku: "PROD-003", qty: 90, unitPrice: UNIT["PROD-003"] }],
    status: "CONFIRMED",
    note: "惠康一月核桃仁常規採購。",
  },
  {
    ts: 1770004800404,
    date: new Date("2026-02-05T09:30:00+08:00"),
    customerCode: "CUST-INV-202500056",
    lines: [{ sku: "PROD-004", qty: 70, unitPrice: UNIT["PROD-004"] }],
    status: "COMPLETED",
    note: "優品360 情人節檔杏仁。",
  },
  {
    ts: 1770610000505,
    date: new Date("2026-02-12T15:15:00+08:00"),
    customerCode: "CUST-INV-202500054",
    lines: [
      { sku: "PROD-002", qty: 60, unitPrice: UNIT["PROD-002"] },
      { sku: "PROD-003", qty: 45, unitPrice: UNIT["PROD-003"] },
    ],
    status: "COMPLETED",
    note: "AEON 春節後補貨開心果＋核桃仁。",
  },
  {
    ts: 1771300000606,
    date: new Date("2026-02-22T10:50:00+08:00"),
    customerCode: "CUST-INV-202500093",
    lines: [{ sku: "PROD-001", qty: 75, unitPrice: UNIT["PROD-001"] }],
    status: "CONFIRMED",
    note: "四洲二月碧根果批發單。",
  },
];

function lineTotal(qty: number, unitPrice: string) {
  return new Prisma.Decimal(unitPrice).mul(qty);
}

function sumLines(lines: Seed["lines"]) {
  return lines.reduce((a, l) => a.add(lineTotal(l.qty, l.unitPrice)), new Prisma.Decimal(0));
}

async function main() {
  const company = await prisma.company.findFirst({ where: { code: "CW" } });
  if (!company) throw new Error("找不到 CW");
  const companyId = company.id;

  // 冪等清理本批次
  const old = await prisma.salesDocument.findMany({
    where: { companyId, notes: { contains: BATCH } },
    select: { id: true, type: true, parentId: true },
  });
  // 先刪 PI／CT，再刪 QT
  const byType = (t: string) => old.filter((d) => d.type === t);
  for (const d of [...byType("PROFORMA_INVOICE"), ...byType("CONTRACT"), ...byType("QUOTATION")]) {
    await prisma.salesDocumentItem.deleteMany({ where: { salesDocumentId: d.id } });
    await prisma.salesDocument.delete({ where: { id: d.id } }).catch(() => undefined);
  }

  const codes = [...new Set(SEEDS.map((s) => s.customerCode))];
  const customers = await prisma.customer.findMany({
    where: { companyId, code: { in: codes } },
    select: { id: true, code: true, name: true },
  });
  const byCode = new Map(customers.map((c) => [c.code, c]));
  for (const code of codes) {
    if (!byCode.has(code)) throw new Error(`缺少客戶 ${code}`);
  }

  const skus: Sku[] = ["PROD-001", "PROD-002", "PROD-003", "PROD-004"];
  const skuToId: Record<string, string> = {};
  for (const sku of skus) {
    const pr = await prisma.product.findUnique({
      where: { companyId_sku: { companyId, sku } },
      select: { id: true },
    });
    if (!pr) throw new Error(`缺少產品 ${sku}`);
    skuToId[sku] = pr.id;
  }

  for (const s of SEEDS) {
    const hkDay = s.date.toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
    if (hkDay.startsWith("2026-01") && hkDay < "2026-01-08") {
      throw new Error(`1 月合同不可早於 1/8: ${hkDay}`);
    }

    const customer = byCode.get(s.customerCode)!;
    const total = sumLines(s.lines);
    const qtNo = `QT-${s.ts - 15000}`;
    const ctNo = `CT-${s.ts}`;
    const piNo = `PI-${s.ts + 8001}`;
    const itemCreate = s.lines.map((l) => ({
      productId: skuToId[l.sku],
      quantity: l.qty,
      unitPrice: new Prisma.Decimal(l.unitPrice),
      discount: new Prisma.Decimal(0),
      taxRate: new Prisma.Decimal(0),
      total: lineTotal(l.qty, l.unitPrice),
    }));

    const qt = await prisma.salesDocument.create({
      data: {
        companyId,
        type: "QUOTATION",
        documentNo: qtNo,
        customerId: customer.id,
        date: new Date(s.date.getTime() - 2 * 86400000),
        totalAmount: total,
        status: "CONFIRMED",
        notes: `報價轉合同來源 ${BATCH}`,
        items: { create: itemCreate },
      },
    });

    const ct = await prisma.salesDocument.create({
      data: {
        companyId,
        type: "CONTRACT",
        documentNo: ctNo,
        customerId: customer.id,
        date: s.date,
        totalAmount: total,
        status: s.status,
        notes: `Converted from ${qtNo} ${BATCH} ${s.note}`,
        parentId: qt.id,
        items: { create: itemCreate },
      },
    });

    await prisma.salesDocument.create({
      data: {
        companyId,
        type: "PROFORMA_INVOICE",
        documentNo: piNo,
        customerId: customer.id,
        date: new Date(s.date.getTime() + 2 * 3600000),
        totalAmount: total,
        status: s.status === "COMPLETED" ? "CONFIRMED" : "PENDING",
        notes: `Converted from ${ctNo} ${BATCH}`,
        parentId: ct.id,
        items: { create: itemCreate },
      },
    });

    console.log(
      `${s.date.toISOString().slice(0, 10)} ${ctNo} ${s.status} ${customer.name} HKD ${total}`,
    );
  }

  console.log(`已寫入 ${SEEDS.length} 筆 1–2 月合同（標籤 ${BATCH}）`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
