/**
 * 寫入 2026 年 3 月～6 月的出入庫流水（可重複執行：先沖銷同批 referenceId 再重建）。
 * 內容貼近日常：期初、採購收貨、銷售出庫、盤點/損耗手動調整；時間分佈在工作日不同時段。
 * 會一併清掉舊版前綴 NUT-MARAPR26-（該批曾寫 WH-MAIN），新數據統一走主倉 warehouseId=""（與採購收貨/銷售出庫一致）。
 * 目標公司：僅一家時用該家；多家時優先 CW（與介面預設一致），否則最早建立。
 * SKU：PROD-001 碧根果、PROD-002 開心果、PROD-003 無殼核桃仁、PROD-004 杏仁。
 */
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** 本批數據統一前綴，便於刪除重跑 */
const REF_PREFIX = "SEED-INV-BATCH-";
/** 舊腳本前綴（曾寫入 WH-MAIN） */
const LEGACY_PREFIX = "NUT-MARAPR26-";

/** 與 receivePurchaseOrderLine / issue 銷售出庫一致 */
const WAREHOUSE_ID = "";

type Sku = "PROD-001" | "PROD-002" | "PROD-003" | "PROD-004";

type Op = {
  at: Date;
  type: "IN" | "OUT";
  sku: Sku;
  qty: number;
  unitCost: string | null;
  referenceType: string;
  /** 唯一鍵，需以 REF_PREFIX 開頭 */
  referenceId: string;
};

const OPERATIONS: Op[] = [
  // --- 期初（3/1）---
  {
    at: new Date("2026-03-01T08:05:00+08:00"),
    type: "IN",
    sku: "PROD-001",
    qty: 1880,
    unitCost: "116.20",
    referenceType: "INITIAL",
    referenceId: `${REF_PREFIX}20260301-INIT-001`,
  },
  {
    at: new Date("2026-03-01T08:12:00+08:00"),
    type: "IN",
    sku: "PROD-002",
    qty: 3200,
    unitCost: "131.00",
    referenceType: "INITIAL",
    referenceId: `${REF_PREFIX}20260301-INIT-002`,
  },
  {
    at: new Date("2026-03-01T08:18:00+08:00"),
    type: "IN",
    sku: "PROD-003",
    qty: 4520,
    unitCost: "96.40",
    referenceType: "INITIAL",
    referenceId: `${REF_PREFIX}20260301-INIT-003`,
  },
  {
    at: new Date("2026-03-01T08:24:00+08:00"),
    type: "IN",
    sku: "PROD-004",
    qty: 2860,
    unitCost: "107.80",
    referenceType: "INITIAL",
    referenceId: `${REF_PREFIX}20260301-INIT-004`,
  },
  // --- 3 月 ---
  {
    at: new Date("2026-03-03T10:40:00+08:00"),
    type: "IN",
    sku: "PROD-001",
    qty: 620,
    unitCost: "116.90",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260303-POI-001`,
  },
  {
    at: new Date("2026-03-04T14:15:00+08:00"),
    type: "OUT",
    sku: "PROD-002",
    qty: 240,
    unitCost: "130.80",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260304-SOI-001`,
  },
  {
    at: new Date("2026-03-06T09:30:00+08:00"),
    type: "IN",
    sku: "PROD-003",
    qty: 1180,
    unitCost: "96.50",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260306-POI-002`,
  },
  {
    at: new Date("2026-03-07T11:20:00+08:00"),
    type: "OUT",
    sku: "PROD-001",
    qty: 180,
    unitCost: "116.50",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260307-SOI-002`,
  },
  {
    at: new Date("2026-03-10T16:45:00+08:00"),
    type: "OUT",
    sku: "PROD-004",
    qty: 60,
    unitCost: "107.80",
    referenceType: "MANUAL",
    referenceId: `${REF_PREFIX}20260310-MAN-抽樣`,
  },
  {
    at: new Date("2026-03-11T10:05:00+08:00"),
    type: "OUT",
    sku: "PROD-003",
    qty: 520,
    unitCost: "96.40",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260311-SOI-003`,
  },
  {
    at: new Date("2026-03-13T13:50:00+08:00"),
    type: "IN",
    sku: "PROD-002",
    qty: 900,
    unitCost: "131.40",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260313-POI-003`,
  },
  {
    at: new Date("2026-03-14T15:30:00+08:00"),
    type: "OUT",
    sku: "PROD-004",
    qty: 310,
    unitCost: "107.60",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260314-SOI-004`,
  },
  {
    at: new Date("2026-03-17T09:10:00+08:00"),
    type: "IN",
    sku: "PROD-001",
    qty: 720,
    unitCost: "117.10",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260317-POI-004`,
  },
  {
    at: new Date("2026-03-19T14:40:00+08:00"),
    type: "OUT",
    sku: "PROD-002",
    qty: 400,
    unitCost: "131.00",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260319-SOI-005`,
  },
  {
    at: new Date("2026-03-21T08:55:00+08:00"),
    type: "IN",
    sku: "PROD-003",
    qty: 24,
    unitCost: "96.40",
    referenceType: "MANUAL",
    referenceId: `${REF_PREFIX}20260321-MAN-盤盈`,
  },
  {
    at: new Date("2026-03-24T10:25:00+08:00"),
    type: "IN",
    sku: "PROD-004",
    qty: 1500,
    unitCost: "108.20",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260324-POI-005`,
  },
  {
    at: new Date("2026-03-26T11:10:00+08:00"),
    type: "OUT",
    sku: "PROD-001",
    qty: 420,
    unitCost: "116.80",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260326-SOI-006`,
  },
  {
    at: new Date("2026-03-27T16:20:00+08:00"),
    type: "OUT",
    sku: "PROD-003",
    qty: 200,
    unitCost: "96.45",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260327-SOI-007`,
  },
  {
    at: new Date("2026-03-31T09:00:00+08:00"),
    type: "IN",
    sku: "PROD-002",
    qty: 1100,
    unitCost: "131.60",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260331-POI-006`,
  },
  // --- 4 月 ---
  {
    at: new Date("2026-04-02T14:35:00+08:00"),
    type: "OUT",
    sku: "PROD-004",
    qty: 280,
    unitCost: "108.00",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260402-SOI-008`,
  },
  {
    at: new Date("2026-04-04T10:15:00+08:00"),
    type: "IN",
    sku: "PROD-003",
    qty: 800,
    unitCost: "96.80",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260404-POI-007`,
  },
  {
    at: new Date("2026-04-08T13:05:00+08:00"),
    type: "OUT",
    sku: "PROD-002",
    qty: 360,
    unitCost: "131.20",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260408-SOI-009`,
  },
  {
    at: new Date("2026-04-09T09:45:00+08:00"),
    type: "IN",
    sku: "PROD-001",
    qty: 550,
    unitCost: "117.30",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260409-POI-008`,
  },
  {
    at: new Date("2026-04-11T15:50:00+08:00"),
    type: "OUT",
    sku: "PROD-004",
    qty: 190,
    unitCost: "107.90",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260411-SOI-010`,
  },
  {
    at: new Date("2026-04-14T10:30:00+08:00"),
    type: "OUT",
    sku: "PROD-001",
    qty: 300,
    unitCost: "117.00",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260414-SOI-011`,
  },
  {
    at: new Date("2026-04-16T11:40:00+08:00"),
    type: "IN",
    sku: "PROD-002",
    qty: 950,
    unitCost: "131.80",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260416-POI-009`,
  },
  {
    at: new Date("2026-04-18T08:30:00+08:00"),
    type: "OUT",
    sku: "PROD-001",
    qty: 12,
    unitCost: "117.30",
    referenceType: "MANUAL",
    referenceId: `${REF_PREFIX}20260418-MAN-破損`,
  },
  {
    at: new Date("2026-04-21T14:00:00+08:00"),
    type: "OUT",
    sku: "PROD-003",
    qty: 640,
    unitCost: "96.70",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260421-SOI-012`,
  },
  {
    at: new Date("2026-04-23T09:20:00+08:00"),
    type: "IN",
    sku: "PROD-004",
    qty: 1300,
    unitCost: "108.40",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260423-POI-010`,
  },
  {
    at: new Date("2026-04-25T16:10:00+08:00"),
    type: "OUT",
    sku: "PROD-002",
    qty: 220,
    unitCost: "131.50",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260425-SOI-013`,
  },
  {
    at: new Date("2026-04-28T10:50:00+08:00"),
    type: "IN",
    sku: "PROD-003",
    qty: 1100,
    unitCost: "97.00",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260428-POI-011`,
  },
  {
    at: new Date("2026-04-30T11:25:00+08:00"),
    type: "OUT",
    sku: "PROD-001",
    qty: 150,
    unitCost: "117.20",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260430-SOI-014`,
  },
  // --- 5 月（含勞動節後到貨）---
  {
    at: new Date("2026-05-06T09:15:00+08:00"),
    type: "IN",
    sku: "PROD-001",
    qty: 480,
    unitCost: "117.50",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260506-POI-012`,
  },
  {
    at: new Date("2026-05-07T14:45:00+08:00"),
    type: "OUT",
    sku: "PROD-004",
    qty: 400,
    unitCost: "108.10",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260507-SOI-015`,
  },
  {
    at: new Date("2026-05-09T10:00:00+08:00"),
    type: "OUT",
    sku: "PROD-003",
    qty: 310,
    unitCost: "96.90",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260509-SOI-016`,
  },
  {
    at: new Date("2026-05-12T13:30:00+08:00"),
    type: "IN",
    sku: "PROD-002",
    qty: 700,
    unitCost: "132.00",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260512-POI-013`,
  },
  {
    at: new Date("2026-05-14T11:05:00+08:00"),
    type: "OUT",
    sku: "PROD-001",
    qty: 260,
    unitCost: "117.40",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260514-SOI-017`,
  },
  {
    at: new Date("2026-05-16T09:50:00+08:00"),
    type: "IN",
    sku: "PROD-004",
    qty: 900,
    unitCost: "108.60",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260516-POI-014`,
  },
  {
    at: new Date("2026-05-19T15:20:00+08:00"),
    type: "OUT",
    sku: "PROD-002",
    qty: 500,
    unitCost: "131.90",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260519-SOI-018`,
  },
  {
    at: new Date("2026-05-21T08:40:00+08:00"),
    type: "OUT",
    sku: "PROD-004",
    qty: 8,
    unitCost: "108.50",
    referenceType: "MANUAL",
    referenceId: `${REF_PREFIX}20260521-MAN-包裝損耗`,
  },
  {
    at: new Date("2026-05-23T10:55:00+08:00"),
    type: "IN",
    sku: "PROD-003",
    qty: 600,
    unitCost: "97.20",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260523-POI-015`,
  },
  {
    at: new Date("2026-05-26T14:25:00+08:00"),
    type: "OUT",
    sku: "PROD-004",
    qty: 220,
    unitCost: "108.30",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260526-SOI-019`,
  },
  {
    at: new Date("2026-05-28T11:15:00+08:00"),
    type: "OUT",
    sku: "PROD-003",
    qty: 180,
    unitCost: "97.00",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260528-SOI-020`,
  },
  {
    at: new Date("2026-05-30T09:30:00+08:00"),
    type: "IN",
    sku: "PROD-001",
    qty: 620,
    unitCost: "117.80",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260530-POI-016`,
  },
  // --- 6 月 ---
  {
    at: new Date("2026-06-02T13:40:00+08:00"),
    type: "OUT",
    sku: "PROD-002",
    qty: 340,
    unitCost: "132.00",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260602-SOI-021`,
  },
  {
    at: new Date("2026-06-04T10:10:00+08:00"),
    type: "IN",
    sku: "PROD-002",
    qty: 850,
    unitCost: "132.20",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260604-POI-017`,
  },
  {
    at: new Date("2026-06-06T15:05:00+08:00"),
    type: "OUT",
    sku: "PROD-001",
    qty: 210,
    unitCost: "117.60",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260606-SOI-022`,
  },
  {
    at: new Date("2026-06-09T09:25:00+08:00"),
    type: "IN",
    sku: "PROD-003",
    qty: 720,
    unitCost: "97.40",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260609-POI-018`,
  },
  {
    at: new Date("2026-06-11T14:50:00+08:00"),
    type: "OUT",
    sku: "PROD-004",
    qty: 290,
    unitCost: "108.50",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260611-SOI-023`,
  },
  {
    at: new Date("2026-06-13T08:45:00+08:00"),
    type: "IN",
    sku: "PROD-004",
    qty: 1000,
    unitCost: "108.80",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260613-POI-019`,
  },
  {
    at: new Date("2026-06-16T11:30:00+08:00"),
    type: "OUT",
    sku: "PROD-003",
    qty: 450,
    unitCost: "97.30",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260616-SOI-024`,
  },
  {
    at: new Date("2026-06-18T10:20:00+08:00"),
    type: "IN",
    sku: "PROD-001",
    qty: 400,
    unitCost: "118.00",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260618-POI-020`,
  },
  {
    at: new Date("2026-06-20T16:15:00+08:00"),
    type: "OUT",
    sku: "PROD-002",
    qty: 380,
    unitCost: "132.10",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260620-SOI-025`,
  },
  {
    at: new Date("2026-06-23T09:05:00+08:00"),
    type: "OUT",
    sku: "PROD-003",
    qty: 15,
    unitCost: "97.40",
    referenceType: "MANUAL",
    referenceId: `${REF_PREFIX}20260623-MAN-品檢剔除`,
  },
  {
    at: new Date("2026-06-25T13:55:00+08:00"),
    type: "OUT",
    sku: "PROD-004",
    qty: 260,
    unitCost: "108.70",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260625-SOI-026`,
  },
  {
    at: new Date("2026-06-27T10:40:00+08:00"),
    type: "IN",
    sku: "PROD-002",
    qty: 500,
    unitCost: "132.40",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260627-POI-021`,
  },
  {
    at: new Date("2026-06-28T15:10:00+08:00"),
    type: "OUT",
    sku: "PROD-001",
    qty: 175,
    unitCost: "117.90",
    referenceType: "SO_SHIP",
    referenceId: `${REF_PREFIX}20260628-SOI-027`,
  },
  {
    at: new Date("2026-06-30T09:00:00+08:00"),
    type: "IN",
    sku: "PROD-003",
    qty: 480,
    unitCost: "97.60",
    referenceType: "PO_RECEIVE",
    referenceId: `${REF_PREFIX}20260630-POI-022`,
  },
];

async function reverseBalancesForTransactions(
  tx: Prisma.TransactionClient,
  companyId: string,
  rows: { productId: string; type: "IN" | "OUT"; quantity: number }[],
  warehouseId: string
) {
  for (const t of rows) {
    const rev = t.type === "IN" ? -t.quantity : t.quantity;
    await tx.inventoryBalance.updateMany({
      where: {
        companyId,
        productId: t.productId,
        warehouseId,
      },
      data: { quantity: { increment: rev } },
    });
  }
}

/**
 * 與網頁 getDefaultCompanyId（無 Cookie）一致：僅一家用該家；多家時優先 CW，否則最早建立。
 */
async function resolveTargetCompany() {
  const ordered = await prisma.company.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, code: true, name: true },
  });
  if (ordered.length === 0) {
    return null;
  }
  if (ordered.length === 1) {
    return ordered[0]!;
  }
  const companyRow = ordered.find((c) => c.code === "CW");
  return companyRow ?? ordered[0]!;
}

async function main() {
  const company = await resolveTargetCompany();
  if (!company) {
    console.error("資料庫中沒有公司記錄，請先建立公司並執行 prisma db seed。");
    process.exit(1);
  }

  const skuIds: Record<Sku, string> = {} as Record<Sku, string>;
  for (const sku of ["PROD-001", "PROD-002", "PROD-003", "PROD-004"] as const) {
    const p = await prisma.product.findUnique({
      where: { companyId_sku: { companyId: company.id, sku } },
      select: { id: true },
    });
    if (!p) {
      console.error(`缺少產品 ${sku}，請先執行 prisma db seed（會同步堅果目錄）。`);
      process.exit(1);
    }
    skuIds[sku] = p.id;
  }

  for (const op of OPERATIONS) {
    if (!op.referenceId.startsWith(REF_PREFIX)) {
      console.error("內部錯誤：referenceId 必須以 REF_PREFIX 開頭");
      process.exit(1);
    }
  }

  await prisma.$transaction(
    async (tx) => {
      const legacy = await tx.inventoryTransaction.findMany({
        where: {
          companyId: company.id,
          referenceId: { startsWith: LEGACY_PREFIX },
        },
        select: { productId: true, type: true, quantity: true },
      });
      await reverseBalancesForTransactions(tx, company.id, legacy, "WH-MAIN");
      await tx.inventoryTransaction.deleteMany({
        where: {
          companyId: company.id,
          referenceId: { startsWith: LEGACY_PREFIX },
        },
      });

      const existingNew = await tx.inventoryTransaction.findMany({
        where: {
          companyId: company.id,
          referenceId: { startsWith: REF_PREFIX },
        },
        select: { productId: true, type: true, quantity: true },
      });
      await reverseBalancesForTransactions(tx, company.id, existingNew, WAREHOUSE_ID);
      await tx.inventoryTransaction.deleteMany({
        where: {
          companyId: company.id,
          referenceId: { startsWith: REF_PREFIX },
        },
      });

      for (const op of OPERATIONS) {
        const productId = skuIds[op.sku];
        const unitCost = op.unitCost != null ? new Prisma.Decimal(op.unitCost) : null;

        await tx.inventoryTransaction.create({
          data: {
            companyId: company.id,
            productId,
            type: op.type,
            quantity: op.qty,
            unitCost,
            referenceType: op.referenceType,
            referenceId: op.referenceId,
            createdAt: op.at,
          },
        });

        const delta = op.type === "IN" ? op.qty : -op.qty;
        await tx.inventoryBalance.upsert({
          where: {
            companyId_productId_warehouseId: {
              companyId: company.id,
              productId,
              warehouseId: WAREHOUSE_ID,
            },
          },
          create: {
            companyId: company.id,
            productId,
            warehouseId: WAREHOUSE_ID,
            quantity: delta,
          },
          update: {
            quantity: { increment: delta },
          },
        });
      }
    },
    { maxWait: 60_000, timeout: 120_000 }
  );

  console.log(
    `已寫入 ${OPERATIONS.length} 條流水（referenceId: ${REF_PREFIX}*），公司 ${company.code}（${company.name}）/ 主倉 warehouseId=''。已嘗試移除舊種子 ${LEGACY_PREFIX}*（原 WH-MAIN）。`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
