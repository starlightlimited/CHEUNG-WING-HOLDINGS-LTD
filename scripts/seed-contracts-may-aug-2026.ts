/**
 * 補齊銷售合同：接續現有資料（止於 2026-04-22），每月 2～3 筆至 2026-08-04。
 * 風格對齊線上單據（CT-{timestamp}、Converted from QT-*、港幣 kg 單價）。
 * 可重複執行：先刪除同批標記 notes 前綴之合同再建立。
 *
 * Usage: npx tsx scripts/seed-contracts-may-aug-2026.ts
 */
import { Prisma, PrismaClient, SalesDocumentStatus } from "@prisma/client";

const prisma = new PrismaClient();

const BATCH_TAG = "[SEED-CT-2026-05-08]";

type SkuKey = "PROD-001" | "PROD-002" | "PROD-003" | "PROD-004";

type Line = { sku: SkuKey; qty: number; unitPrice: string };

type ContractSeed = {
  /** 用於產生穩定單號後綴（毫秒時間戳風格） */
  ts: number;
  date: Date;
  customerCode: string;
  lines: Line[];
  status: SalesDocumentStatus;
  /** 合同業務備註（會附在 Converted from 之後） */
  bizNote?: string;
};

/** 單價與既有合同口徑一致 */
const UNIT: Record<SkuKey, string> = {
  "PROD-001": "118",
  "PROD-002": "132",
  "PROD-003": "98",
  "PROD-004": "108",
};

/**
 * 2026-05 ～ 2026-08-04，每月 2～3 筆（8 月至 4 日共 2 筆）。
 * ts 落在各合同日附近，避免與既有 CT-17768… 衝突。
 */
const CONTRACTS: ContractSeed[] = [
  // —— 5 月（3）——
  {
    ts: 1778006400120,
    date: new Date("2026-05-06T10:15:00+08:00"),
    customerCode: "CUST-INV-202500051",
    lines: [
      { sku: "PROD-002", qty: 900, unitPrice: UNIT["PROD-002"] },
      { sku: "PROD-004", qty: 600, unitPrice: UNIT["PROD-004"] },
    ],
    status: "COMPLETED",
    bizNote: "惠康門店五一後補貨；分兩批入冷鏈倉，附批次 COA。",
  },
  {
    ts: 1778784000455,
    date: new Date("2026-05-15T14:40:00+08:00"),
    customerCode: "CUST-INV-202500057",
    lines: [{ sku: "PROD-003", qty: 2200, unitPrice: UNIT["PROD-003"] }],
    status: "COMPLETED",
    bizNote: "嘉頓烘焙餡料核桃仁；水分與過篩規格按年度框架附錄 B。",
  },
  {
    ts: 1779820800788,
    date: new Date("2026-05-27T09:30:00+08:00"),
    customerCode: "CUST-INV-202500041",
    lines: [
      { sku: "PROD-001", qty: 1100, unitPrice: UNIT["PROD-001"] },
      { sku: "PROD-002", qty: 700, unitPrice: UNIT["PROD-002"] },
    ],
    status: "PENDING",
    bizNote: "華潤萬家禮盒原料；待採購章回傳後排倉。",
  },
  // —— 6 月（2）——
  {
    ts: 1780867200233,
    date: new Date("2026-06-08T11:05:00+08:00"),
    customerCode: "CUST-INV-202500091",
    lines: [{ sku: "PROD-004", qty: 1800, unitPrice: UNIT["PROD-004"] }],
    status: "COMPLETED",
    bizNote: "大昌行渠道杏仁；屯門倉過磅結算，磅差 ±0.3%。",
  },
  {
    ts: 1782076800561,
    date: new Date("2026-06-22T16:20:00+08:00"),
    customerCode: "CUST-INV-202500093",
    lines: [
      { sku: "PROD-002", qty: 1500, unitPrice: UNIT["PROD-002"] },
      { sku: "PROD-003", qty: 800, unitPrice: UNIT["PROD-003"] },
    ],
    status: "COMPLETED",
    bizNote: "四洲零食線夏採前補單；需中英雙語箱嘜。",
  },
  // —— 7 月（3）——
  {
    ts: 1783027200890,
    date: new Date("2026-07-03T10:00:00+08:00"),
    customerCode: "CUST-INV-202500096",
    lines: [{ sku: "PROD-001", qty: 960, unitPrice: UNIT["PROD-001"] }],
    status: "COMPLETED",
    bizNote: "一田百貨中元檔期碧根果；分裝貼紙由買方提供。",
  },
  {
    ts: 1784150400342,
    date: new Date("2026-07-16T13:25:00+08:00"),
    customerCode: "HK-NUT-018",
    lines: [
      { sku: "PROD-003", qty: 120, unitPrice: UNIT["PROD-003"] },
      { sku: "PROD-004", qty: 80, unitPrice: UNIT["PROD-004"] },
    ],
    status: "COMPLETED",
    bizNote: "零售客戶小批複購；自提九龍灣倉。",
  },
  {
    ts: 1785187200617,
    date: new Date("2026-07-28T15:50:00+08:00"),
    customerCode: "CUST-INV-202500054",
    lines: [
      { sku: "PROD-002", qty: 2000, unitPrice: UNIT["PROD-002"] },
      { sku: "PROD-001", qty: 500, unitPrice: UNIT["PROD-001"] },
    ],
    status: "PENDING",
    bizNote: "AEON 暑假檔開心果主推；待門店上架表確認後出貨。",
  },
  // —— 8 月（至 8/4，2 筆）——
  {
    ts: 1785532800199,
    date: new Date("2026-08-01T09:45:00+08:00"),
    customerCode: "CUST-INV-202500095",
    lines: [{ sku: "PROD-004", qty: 1400, unitPrice: UNIT["PROD-004"] }],
    status: "COMPLETED",
    bizNote: "百佳八月常規補貨杏仁；月結 30 天。",
  },
  {
    ts: 1785792000476,
    date: new Date("2026-08-04T11:30:00+08:00"),
    customerCode: "CUST-INV-202500055",
    lines: [
      { sku: "PROD-003", qty: 1600, unitPrice: UNIT["PROD-003"] },
      { sku: "PROD-002", qty: 400, unitPrice: UNIT["PROD-002"] },
    ],
    status: "COMPLETED",
    bizNote: "美心中秋前核桃仁＋開心果預留；分三次交貨。",
  },
];

function lineTotal(qty: number, unitPrice: string): Prisma.Decimal {
  return new Prisma.Decimal(unitPrice).mul(qty);
}

function sumLines(lines: Line[]): Prisma.Decimal {
  return lines.reduce((acc, l) => acc.add(lineTotal(l.qty, l.unitPrice)), new Prisma.Decimal(0));
}

async function main() {
  const company = await prisma.company.findFirst({ where: { code: "CW" } });
  if (!company) {
    console.error("找不到 code=CW 的公司，請先執行 npm run db:seed");
    process.exit(1);
  }

  const codes = [...new Set(CONTRACTS.map((c) => c.customerCode))];
  const customers = await prisma.customer.findMany({
    where: { companyId: company.id, code: { in: codes } },
    select: { id: true, code: true, name: true },
  });
  const byCode = new Map(customers.map((c) => [c.code, c]));
  for (const code of codes) {
    if (!byCode.has(code)) {
      console.error(`缺少客戶 ${code}`);
      process.exit(1);
    }
  }

  const skus: SkuKey[] = ["PROD-001", "PROD-002", "PROD-003", "PROD-004"];
  const skuToId: Record<string, string> = {};
  for (const sku of skus) {
    const p = await prisma.product.findUnique({
      where: { companyId_sku: { companyId: company.id, sku } },
      select: { id: true },
    });
    if (!p) {
      console.error(`缺少產品 ${sku}`);
      process.exit(1);
    }
    skuToId[sku] = p.id;
  }

  await prisma.$transaction(
    async (tx) => {
      const existing = await tx.salesDocument.findMany({
        where: {
          companyId: company.id,
          type: "CONTRACT",
          notes: { contains: BATCH_TAG },
        },
        select: { id: true, parentId: true },
      });

      const parentIds = existing.map((e) => e.parentId).filter((id): id is string => !!id);
      for (const d of existing) {
        await tx.salesDocumentItem.deleteMany({ where: { salesDocumentId: d.id } });
        await tx.salesDocument.delete({ where: { id: d.id } });
      }
      if (parentIds.length) {
        for (const pid of parentIds) {
          await tx.salesDocumentItem.deleteMany({ where: { salesDocumentId: pid } });
          await tx.salesDocument.delete({ where: { id: pid } }).catch(() => undefined);
        }
      }

      for (const c of CONTRACTS) {
        const customer = byCode.get(c.customerCode)!;
        const qtNo = `QT-${c.ts - 12000}`;
        const ctNo = `CT-${c.ts}`;
        const totalAmount = sumLines(c.lines);
        const notes = `Converted from ${qtNo} ${BATCH_TAG}${c.bizNote ? ` ${c.bizNote}` : ""}`;

        const quote = await tx.salesDocument.create({
          data: {
            companyId: company.id,
            type: "QUOTATION",
            documentNo: qtNo,
            customerId: customer.id,
            date: new Date(c.date.getTime() - 2 * 86400000),
            totalAmount,
            status: "CONFIRMED",
            notes: `報價轉合同來源 ${BATCH_TAG}`,
            items: {
              create: c.lines.map((l) => ({
                productId: skuToId[l.sku],
                quantity: l.qty,
                unitPrice: new Prisma.Decimal(l.unitPrice),
                discount: new Prisma.Decimal(0),
                taxRate: new Prisma.Decimal(0),
                total: lineTotal(l.qty, l.unitPrice),
              })),
            },
          },
        });

        await tx.salesDocument.create({
          data: {
            companyId: company.id,
            type: "CONTRACT",
            documentNo: ctNo,
            customerId: customer.id,
            date: c.date,
            totalAmount,
            status: c.status,
            notes,
            parentId: quote.id,
            items: {
              create: c.lines.map((l) => ({
                productId: skuToId[l.sku],
                quantity: l.qty,
                unitPrice: new Prisma.Decimal(l.unitPrice),
                discount: new Prisma.Decimal(0),
                taxRate: new Prisma.Decimal(0),
                total: lineTotal(l.qty, l.unitPrice),
              })),
            },
          },
        });
      }
    },
    { maxWait: 60_000, timeout: 120_000 },
  );

  console.log(
    `已寫入 ${CONTRACTS.length} 筆銷售合同（2026-05-06～2026-08-04），單號 CT-${CONTRACTS[0].ts} 起；標籤 ${BATCH_TAG}`,
  );
  for (const c of CONTRACTS) {
    const cust = byCode.get(c.customerCode)!;
    console.log(
      `  CT-${c.ts}  ${c.date.toISOString().slice(0, 10)}  ${c.status.padEnd(10)}  ${cust.name}  HKD ${sumLines(c.lines)}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
