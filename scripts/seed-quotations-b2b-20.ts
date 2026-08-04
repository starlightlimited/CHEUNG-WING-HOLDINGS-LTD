/**
 * 在 預設公司寫入 20 筆 B2B 風格報價單（客戶為 seed 中的 CUST-SEED-101～120），
 * 單號以 QT-B2B-2026- 開頭；備註為常見採購／通路場景，非隨機測試字串。
 * 可重複執行：先刪除同前綴報價單及明細再建立。
 *
 * Usage: npx tsx scripts/seed-quotations-b2b-20.ts
 */
import { Prisma, PrismaClient, SalesDocumentStatus } from "@prisma/client";

const prisma = new PrismaClient();

const DOC_PREFIX = "QT-B2B-2026-";

type SkuKey = "PROD-001" | "PROD-002" | "PROD-003" | "PROD-004" | "MAC-B-INSHELL-KG";

type Line = { sku: SkuKey; qty: number; unitPrice: string };

type QuoteSeed = {
  suffix: string;
  date: Date;
  due: Date;
  customerCode: string;
  lines: Line[];
  notes: string;
  status: SalesDocumentStatus;
};

const QUOTES: QuoteSeed[] = [
  {
    suffix: "01",
    date: new Date("2026-01-08T10:30:00+08:00"),
    due: new Date("2026-01-22T18:00:00+08:00"),
    customerCode: "CUST-SEED-101",
    lines: [{ sku: "PROD-001", qty: 420, unitPrice: "116.50" }],
    notes: "春節禮盒混裝方案：碧根果為主，需貼中文標籤與產地聲明；深圳南山交貨。",
    status: "PENDING",
  },
  {
    suffix: "02",
    date: new Date("2026-01-14T14:00:00+08:00"),
    due: new Date("2026-01-28T18:00:00+08:00"),
    customerCode: "CUST-SEED-102",
    lines: [
      { sku: "PROD-002", qty: 380, unitPrice: "130.80" },
      { sku: "PROD-004", qty: 260, unitPrice: "107.20" },
    ],
    notes: "廠慶員工福利用料：開心果＋杏仁，要求批次檢驗報告隨貨。長安鎮廠區自提。",
    status: "CONFIRMED",
  },
  {
    suffix: "03",
    date: new Date("2026-01-21T09:15:00+08:00"),
    due: new Date("2026-02-04T18:00:00+08:00"),
    customerCode: "CUST-SEED-103",
    lines: [{ sku: "PROD-003", qty: 600, unitPrice: "96.00" }],
    notes: "出口東盟拼櫃試單：核桃仁，需英文箱嘜與裝櫃照片；廣州倉集貨。",
    status: "PENDING",
  },
  {
    suffix: "04",
    date: new Date("2026-02-03T11:20:00+08:00"),
    due: new Date("2026-02-17T18:00:00+08:00"),
    customerCode: "CUST-SEED-104",
    lines: [{ sku: "PROD-001", qty: 280, unitPrice: "115.80" }],
    notes: "批發市場二級通路：碧根果中粒規格，價格含佛山大瀝送貨一次。",
    status: "DRAFT",
  },
  {
    suffix: "05",
    date: new Date("2026-02-10T16:45:00+08:00"),
    due: new Date("2026-02-24T18:00:00+08:00"),
    customerCode: "CUST-SEED-105",
    lines: [{ sku: "PROD-004", qty: 520, unitPrice: "106.90" }],
    notes: "冷鏈倉配套年節備貨：杏仁，庫溫要求 0～4℃；海滄保稅港區交貨。",
    status: "PENDING",
  },
  {
    suffix: "06",
    date: new Date("2026-02-18T10:00:00+08:00"),
    due: new Date("2026-03-04T18:00:00+08:00"),
    customerCode: "CUST-SEED-106",
    lines: [{ sku: "PROD-002", qty: 310, unitPrice: "131.50" }],
    notes: "香港寫字樓茶水供應商年度詢價：開心果原味，需香港正式商業發票。",
    status: "PENDING",
  },
  {
    suffix: "07",
    date: new Date("2026-02-25T13:30:00+08:00"),
    due: new Date("2026-03-11T18:00:00+08:00"),
    customerCode: "CUST-SEED-107",
    lines: [{ sku: "PROD-003", qty: 240, unitPrice: "97.50" }],
    notes: "台灣線上通路試銷：核桃仁小包装原料，待確認 MOQ 與分裝廠地址。",
    status: "DRAFT",
  },
  {
    suffix: "08",
    date: new Date("2026-03-02T09:00:00+08:00"),
    due: new Date("2026-03-16T18:00:00+08:00"),
    customerCode: "CUST-SEED-108",
    lines: [
      { sku: "PROD-001", qty: 180, unitPrice: "117.20" },
      { sku: "MAC-B-INSHELL-KG", qty: 1200, unitPrice: "56.00" },
    ],
    notes: "新加坡轉口：店頭小包装碧根果＋帶殼夏威夷果 B 級，需符合進口標籤草稿審閱。",
    status: "PENDING",
  },
  {
    suffix: "09",
    date: new Date("2026-03-09T15:10:00+08:00"),
    due: new Date("2026-03-23T18:00:00+08:00"),
    customerCode: "CUST-SEED-109",
    lines: [{ sku: "MAC-B-INSHELL-KG", qty: 22000, unitPrice: "55.80" }],
    notes: "胡志明櫃貨詢價：帶殼夏威夷果 B 級，條款 FOB 香港；船期預留 3 月下半月。",
    status: "PENDING",
  },
  {
    suffix: "10",
    date: new Date("2026-03-16T11:00:00+08:00"),
    due: new Date("2026-03-30T18:00:00+08:00"),
    customerCode: "CUST-SEED-110",
    lines: [{ sku: "PROD-004", qty: 90, unitPrice: "108.00" }],
    notes: "照明廠尾牙禮品打樣：杏仁小罐裝標貼由客戶自供，僅報原料與代工分裝費另議。",
    status: "CANCELLED",
  },
  {
    suffix: "11",
    date: new Date("2026-03-23T10:40:00+08:00"),
    due: new Date("2026-04-06T18:00:00+08:00"),
    customerCode: "CUST-SEED-111",
    lines: [{ sku: "PROD-002", qty: 450, unitPrice: "129.90" }],
    notes: "包材廠配套堅果年貨：開心果用於禮盒內襯試装，惠陽秋長工業園送貨。",
    status: "PENDING",
  },
  {
    suffix: "12",
    date: new Date("2026-03-30T14:25:00+08:00"),
    due: new Date("2026-04-13T18:00:00+08:00"),
    customerCode: "CUST-SEED-112",
    lines: [{ sku: "PROD-003", qty: 360, unitPrice: "96.80" }],
    notes: "陳皮禮盒搭售：核桃仁作伴手禮組合之一，需與陳皮同櫃出貨時間協調。",
    status: "CONFIRMED",
  },
  {
    suffix: "13",
    date: new Date("2026-04-02T09:50:00+08:00"),
    due: new Date("2026-04-16T18:00:00+08:00"),
    customerCode: "CUST-SEED-113",
    lines: [
      { sku: "PROD-001", qty: 220, unitPrice: "116.00" },
      { sku: "PROD-002", qty: 220, unitPrice: "130.00" },
    ],
    notes: "橫琴跨境電商保稅備貨：兩 SKU 入區清單由客戶關務提供模板，報價含理貨。",
    status: "PENDING",
  },
  {
    suffix: "14",
    date: new Date("2026-04-07T16:00:00+08:00"),
    due: new Date("2026-04-21T18:00:00+08:00"),
    customerCode: "CUST-SEED-114",
    lines: [{ sku: "PROD-004", qty: 800, unitPrice: "105.50" }],
    notes: "南寧乾貨市場檔口補貨：杏仁大宗，需分批到貨（每週兩車）以減輕堆場壓力。",
    status: "PENDING",
  },
  {
    suffix: "15",
    date: new Date("2026-04-10T11:30:00+08:00"),
    due: new Date("2026-04-24T18:00:00+08:00"),
    customerCode: "CUST-SEED-115",
    lines: [{ sku: "PROD-003", qty: 500, unitPrice: "95.80" }],
    notes: "水產加工廠春節聯名禮盒：核桃仁作副品項，需與海產乾貨分倉貼標。",
    status: "DRAFT",
  },
  {
    suffix: "16",
    date: new Date("2026-04-12T10:05:00+08:00"),
    due: new Date("2026-04-26T18:00:00+08:00"),
    customerCode: "CUST-SEED-116",
    lines: [{ sku: "PROD-002", qty: 140, unitPrice: "132.50" }],
    notes: "澳門百貨年度標案補充報價：開心果小規格，標案主檔已鎖價，本單為追加量。",
    status: "PENDING",
  },
  {
    suffix: "17",
    date: new Date("2026-04-14T13:40:00+08:00"),
    due: new Date("2026-04-28T18:00:00+08:00"),
    customerCode: "CUST-SEED-117",
    lines: [{ sku: "PROD-001", qty: 300, unitPrice: "114.80" }],
    notes: "川味調料電商組合包：碧根果作「麻辣零食加購」試銷，需成都雙流倉到付。",
    status: "PENDING",
  },
  {
    suffix: "18",
    date: new Date("2026-04-16T09:20:00+08:00"),
    due: new Date("2026-04-30T18:00:00+08:00"),
    customerCode: "CUST-SEED-118",
    lines: [{ sku: "MAC-B-INSHELL-KG", qty: 8000, unitPrice: "56.20" }],
    notes: "寧波港中轉：帶殼夏威夷果 B 級，目的港歐洲，客戶指定驗貨機構 SGS。",
    status: "PENDING",
  },
  {
    suffix: "19",
    date: new Date("2026-04-18T15:00:00+08:00"),
    due: new Date("2026-05-02T18:00:00+08:00"),
    customerCode: "CUST-SEED-119",
    lines: [
      { sku: "PROD-003", qty: 640, unitPrice: "96.20" },
      { sku: "PROD-004", qty: 640, unitPrice: "106.00" },
    ],
    notes: "華北冷鏈集散：核桃仁＋杏仁入庫前測溫記錄需回傳，濱海新區 A 區卸貨。",
    status: "PENDING",
  },
  {
    suffix: "20",
    date: new Date("2026-04-20T10:50:00+08:00"),
    due: new Date("2026-05-04T18:00:00+08:00"),
    customerCode: "CUST-SEED-120",
    lines: [{ sku: "PROD-002", qty: 260, unitPrice: "131.00" }],
    notes: "上海進口食品貿易商春季選品會後續：開心果禮罐裝，待品牌方確認貼紙版式。",
    status: "DRAFT",
  },
];

function lineTotal(qty: number, unitPrice: string): Prisma.Decimal {
  return new Prisma.Decimal(unitPrice).mul(qty);
}

function sumLines(lines: Line[]): Prisma.Decimal {
  return lines.reduce((acc, l) => acc.add(lineTotal(l.qty, l.unitPrice)), new Prisma.Decimal(0));
}

async function main() {
  const companyRow = await prisma.company.findFirst({ where: { code: "CW" } });
  if (!companyRow) {
    console.error("找不到 code=CW 的公司，請先執行 npm run db:seed");
    process.exit(1);
  }

  const customerCodes = [...new Set(QUOTES.map((q) => q.customerCode))];
  const customers = await prisma.customer.findMany({
    where: { companyId: companyRow.id, code: { in: customerCodes } },
    select: { id: true, code: true, name: true },
  });
  const byCode = new Map(customers.map((c) => [c.code, c]));
  for (const code of customerCodes) {
    if (!byCode.has(code)) {
      console.error(`缺少客戶 ${code}，請先執行 prisma db seed。`);
      process.exit(1);
    }
  }

  const skus: SkuKey[] = ["PROD-001", "PROD-002", "PROD-003", "PROD-004", "MAC-B-INSHELL-KG"];
  const skuToId: Record<string, string> = {};
  for (const sku of skus) {
    const p = await prisma.product.findUnique({
      where: { companyId_sku: { companyId: companyRow.id, sku } },
      select: { id: true },
    });
    if (!p) {
      console.error(`缺少產品 ${sku}，請先執行 prisma db seed。`);
      process.exit(1);
    }
    skuToId[sku] = p.id;
  }

  await prisma.$transaction(
    async (tx) => {
      const existing = await tx.salesDocument.findMany({
        where: {
          companyId: companyRow.id,
          type: "QUOTATION",
          documentNo: { startsWith: DOC_PREFIX },
        },
        select: { id: true },
      });
      for (const d of existing) {
        await tx.salesDocumentItem.deleteMany({ where: { salesDocumentId: d.id } });
        await tx.salesDocument.delete({ where: { id: d.id } });
      }

      for (const q of QUOTES) {
        const customer = byCode.get(q.customerCode)!;
        const documentNo = `${DOC_PREFIX}${q.suffix}`;
        const totalAmount = sumLines(q.lines);

        await tx.salesDocument.create({
          data: {
            companyId: companyRow.id,
            type: "QUOTATION",
            documentNo,
            customerId: customer.id,
            date: q.date,
            dueDate: q.due,
            totalAmount,
            status: q.status,
            notes: q.notes,
            items: {
              create: q.lines.map((l) => ({
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
    `已在預設公司 寫入 ${QUOTES.length} 筆 B2B 報價單（單號 ${DOC_PREFIX}01～20），客戶 CUST-SEED-101～120。`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
