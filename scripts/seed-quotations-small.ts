/**
 * 在 預設公司寫入 20 筆小批量報價單（2026-03～06），關聯 HK-NUT-* 客戶與堅果 SKU。
 * 可重複執行：先刪除 documentNo 以 QT-CW-2026SM- 開頭的報價單（含明細）。
 */
import { Prisma, PrismaClient, SalesDocumentStatus } from "@prisma/client";

const prisma = new PrismaClient();

const DOC_PREFIX = "QT-CW-2026SM-";

type Line = { sku: "PROD-001" | "PROD-002" | "PROD-003" | "PROD-004"; qty: number; unitPrice: string };

type QuoteSeed = {
  documentSuffix: string;
  date: Date;
  due: Date;
  customerIndex: number;
  lines: Line[];
  notes: string | null;
  status: SalesDocumentStatus;
};

const QUOTES: QuoteSeed[] = [
  {
    documentSuffix: "001",
    date: new Date("2026-03-04T10:00:00+08:00"),
    due: new Date("2026-03-18T23:59:59+08:00"),
    customerIndex: 0,
    lines: [{ sku: "PROD-001", qty: 48, unitPrice: "117.50" }],
    notes: "碧根果散裝；屯門自提；家庭／小批發通路",
    status: "PENDING",
  },
  {
    documentSuffix: "002",
    date: new Date("2026-03-08T14:30:00+08:00"),
    due: new Date("2026-03-22T23:59:59+08:00"),
    customerIndex: 1,
    lines: [{ sku: "PROD-002", qty: 36, unitPrice: "131.20" }],
    notes: "開心果原味；無鹽偏好；沙田第一城",
    status: "PENDING",
  },
  {
    documentSuffix: "003",
    date: new Date("2026-03-12T09:20:00+08:00"),
    due: new Date("2026-03-26T23:59:59+08:00"),
    customerIndex: 2,
    lines: [
      { sku: "PROD-003", qty: 42, unitPrice: "96.80" },
      { sku: "PROD-004", qty: 28, unitPrice: "108.00" },
    ],
    notes: "核桃仁＋杏仁；中環辦公室茶點小批量",
    status: "PENDING",
  },
  {
    documentSuffix: "004",
    date: new Date("2026-03-18T11:00:00+08:00"),
    due: new Date("2026-04-01T23:59:59+08:00"),
    customerIndex: 3,
    lines: [{ sku: "PROD-001", qty: 55, unitPrice: "116.90" }],
    notes: "將軍澳；烘焙用碧根果碎需求待確認",
    status: "DRAFT",
  },
  {
    documentSuffix: "005",
    date: new Date("2026-03-24T16:45:00+08:00"),
    due: new Date("2026-04-07T23:59:59+08:00"),
    customerIndex: 4,
    lines: [{ sku: "PROD-004", qty: 40, unitPrice: "107.60" }],
    notes: "元朗；燕麥奶昔用杏仁",
    status: "PENDING",
  },
  {
    documentSuffix: "006",
    date: new Date("2026-03-28T10:10:00+08:00"),
    due: new Date("2026-04-11T23:59:59+08:00"),
    customerIndex: 5,
    lines: [{ sku: "PROD-002", qty: 52, unitPrice: "132.00" }],
    notes: "銅鑼灣送禮季小禮袋試單",
    status: "PENDING",
  },
  {
    documentSuffix: "007",
    date: new Date("2026-04-02T13:00:00+08:00"),
    due: new Date("2026-04-16T23:59:59+08:00"),
    customerIndex: 6,
    lines: [{ sku: "PROD-001", qty: 38, unitPrice: "117.20" }],
    notes: "荃灣；健身加餐小包裝原料",
    status: "PENDING",
  },
  {
    documentSuffix: "008",
    date: new Date("2026-04-09T09:30:00+08:00"),
    due: new Date("2026-04-23T23:59:59+08:00"),
    customerIndex: 7,
    lines: [{ sku: "PROD-003", qty: 65, unitPrice: "97.10" }],
    notes: "大埔；學童餐盒用小包核桃仁",
    status: "PENDING",
  },
  {
    documentSuffix: "009",
    date: new Date("2026-04-14T15:20:00+08:00"),
    due: new Date("2026-04-28T23:59:59+08:00"),
    customerIndex: 8,
    lines: [
      { sku: "PROD-002", qty: 30, unitPrice: "131.50" },
      { sku: "PROD-001", qty: 25, unitPrice: "117.00" },
    ],
    notes: "觀塘公司茶水間試用組合",
    status: "PENDING",
  },
  {
    documentSuffix: "010",
    date: new Date("2026-04-21T11:40:00+08:00"),
    due: new Date("2026-05-05T23:59:59+08:00"),
    customerIndex: 9,
    lines: [{ sku: "PROD-004", qty: 44, unitPrice: "108.20" }],
    notes: "尖沙咀派對小食；杏仁為主",
    status: "PENDING",
  },
  {
    documentSuffix: "011",
    date: new Date("2026-04-26T10:05:00+08:00"),
    due: new Date("2026-05-10T23:59:59+08:00"),
    customerIndex: 10,
    lines: [{ sku: "PROD-001", qty: 72, unitPrice: "116.80" }],
    notes: "屯門長輩送禮；中規格碧根果",
    status: "DRAFT",
  },
  {
    documentSuffix: "012",
    date: new Date("2026-05-05T14:50:00+08:00"),
    due: new Date("2026-05-19T23:59:59+08:00"),
    customerIndex: 11,
    lines: [{ sku: "PROD-003", qty: 58, unitPrice: "96.50" }],
    notes: "北角烘焙曲奇；半片仁",
    status: "PENDING",
  },
  {
    documentSuffix: "013",
    date: new Date("2026-05-09T09:00:00+08:00"),
    due: new Date("2026-05-23T23:59:59+08:00"),
    customerIndex: 12,
    lines: [{ sku: "PROD-002", qty: 44, unitPrice: "131.80" }],
    notes: "紅磡電商組合；小包分裝前原料",
    status: "PENDING",
  },
  {
    documentSuffix: "014",
    date: new Date("2026-05-14T16:30:00+08:00"),
    due: new Date("2026-05-28T23:59:59+08:00"),
    customerIndex: 13,
    lines: [
      { sku: "PROD-004", qty: 35, unitPrice: "107.90" },
      { sku: "PROD-003", qty: 32, unitPrice: "97.00" },
    ],
    notes: "馬鞍山低鹽款；杏仁＋核桃仁",
    status: "PENDING",
  },
  {
    documentSuffix: "015",
    date: new Date("2026-05-20T10:25:00+08:00"),
    due: new Date("2026-06-03T23:59:59+08:00"),
    customerIndex: 14,
    lines: [{ sku: "PROD-001", qty: 60, unitPrice: "117.30" }],
    notes: "深水埗家庭裝補貨",
    status: "PENDING",
  },
  {
    documentSuffix: "016",
    date: new Date("2026-05-26T13:15:00+08:00"),
    due: new Date("2026-06-09T23:59:59+08:00"),
    customerIndex: 15,
    lines: [{ sku: "PROD-002", qty: 50, unitPrice: "132.10" }],
    notes: "金鐘寫字樓禮盒分格樣品價",
    status: "DRAFT",
  },
  {
    documentSuffix: "017",
    date: new Date("2026-06-02T09:40:00+08:00"),
    due: new Date("2026-06-16T23:59:59+08:00"),
    customerIndex: 16,
    lines: [{ sku: "PROD-004", qty: 33, unitPrice: "108.00" }],
    notes: "西貢露營小袋裝；杏仁",
    status: "PENDING",
  },
  {
    documentSuffix: "018",
    date: new Date("2026-06-06T15:00:00+08:00"),
    due: new Date("2026-06-20T23:59:59+08:00"),
    customerIndex: 17,
    lines: [{ sku: "PROD-003", qty: 48, unitPrice: "98.20" }],
    notes: "柴灣素食通路；核桃仁",
    status: "PENDING",
  },
  {
    documentSuffix: "019",
    date: new Date("2026-06-12T11:10:00+08:00"),
    due: new Date("2026-06-26T23:59:59+08:00"),
    customerIndex: 18,
    lines: [
      { sku: "PROD-001", qty: 42, unitPrice: "117.00" },
      { sku: "PROD-002", qty: 38, unitPrice: "131.00" },
    ],
    notes: "東涌大宗拆小單；碧根果＋開心果",
    status: "PENDING",
  },
  {
    documentSuffix: "020",
    date: new Date("2026-06-18T14:00:00+08:00"),
    due: new Date("2026-07-02T23:59:59+08:00"),
    customerIndex: 19,
    lines: [{ sku: "PROD-004", qty: 26, unitPrice: "108.50" }],
    notes: "灣仔咖啡店試用；小批量樣品價可抵扣大貨",
    status: "PENDING",
  },
];

function lineTotal(qty: number, unitPrice: string): Prisma.Decimal {
  const u = new Prisma.Decimal(unitPrice);
  return u.mul(qty);
}

function sumLines(lines: Line[]): Prisma.Decimal {
  return lines.reduce((acc, l) => acc.add(lineTotal(l.qty, l.unitPrice)), new Prisma.Decimal(0));
}

async function main() {
  const companyRow = await prisma.company.findFirst({ where: { code: "CW" } });
  if (!companyRow) {
    console.error("找不到 code=CW 的公司。");
    process.exit(1);
  }

  const customers = await prisma.customer.findMany({
    where: { companyId: companyRow.id, code: { startsWith: "HK-NUT-" } },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  if (customers.length < 20) {
    console.error(`預設公司下 HK-NUT 客戶不足 20 筆（目前 ${customers.length}），請先 prisma db seed。`);
    process.exit(1);
  }

  const skuToId: Record<string, string> = {};
  for (const sku of ["PROD-001", "PROD-002", "PROD-003", "PROD-004"] as const) {
    const p = await prisma.product.findUnique({
      where: { companyId_sku: { companyId: companyRow.id, sku } },
      select: { id: true },
    });
    if (!p) {
      console.error(`缺少產品 ${sku}，請先 prisma db seed。`);
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
        const customer = customers[q.customerIndex];
        if (!customer) continue;

        const totalAmount = sumLines(q.lines);
        const documentNo = `${DOC_PREFIX}${q.documentSuffix}`;

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
    { maxWait: 60_000, timeout: 120_000 }
  );

  console.log(`已在預設公司 寫入 ${QUOTES.length} 筆報價單（${DOC_PREFIX}*），客戶 HK-NUT-001～020，數量為小批量（公斤級）。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
