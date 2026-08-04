/**
 * 寫入應付帳款（供應商帳單）真實風格示範數據：
 * - 日期：2026-01～2026-07（八月前）
 * - 金額：小額營運／服務／短結貨款（數百～約 1.8 萬）
 * - 狀態：OPEN / PARTIAL / CLOSED 混搭
 * - 冪等：以 billNo 前綴 BILL-SEED- 刪除後重建
 * - 同步刷新標題含「請款種子」的 5 筆請款（應付臺帳來源之一）
 *
 * 執行：npx tsx scripts/seed-accounts-payable-realistic.ts
 */
import {
  ArApStatus,
  PrismaClient,
  type PaymentRequestStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

const BILL_PREFIX = "BILL-SEED-";

type ApRow = {
  billNo: string;
  vendorName: string;
  description: string;
  amount: number;
  paidAmount: number;
  status: ArApStatus;
  issueDate: string;
  dueDate: string | null;
};

const ROWS: ApRow[] = [
  {
    billNo: `${BILL_PREFIX}2601-01`,
    vendorName: "港燈電力有限公司",
    description: "葵青倉 1 月電費（低壓商用）",
    amount: 3_860,
    paidAmount: 3_860,
    status: "CLOSED",
    issueDate: "2026-01-18",
    dueDate: "2026-02-08",
  },
  {
    billNo: `${BILL_PREFIX}2601-02`,
    vendorName: "中原物業管理有限公司",
    description: "中環寫字樓 1 月管理費分攤",
    amount: 7_420,
    paidAmount: 7_420,
    status: "CLOSED",
    issueDate: "2026-01-22",
    dueDate: "2026-02-05",
  },
  {
    billNo: `${BILL_PREFIX}2602-01`,
    vendorName: "順成拖車運輸有限公司",
    description: "貨櫃拖運 2 櫃（葵涌 → 倉庫）",
    amount: 4_200,
    paidAmount: 4_200,
    status: "CLOSED",
    issueDate: "2026-02-11",
    dueDate: "2026-02-25",
  },
  {
    billNo: `${BILL_PREFIX}2602-02`,
    vendorName: "華達包裝材料行",
    description: "食品級 PE 袋及紙箱（小批補貨）",
    amount: 2_180,
    paidAmount: 2_180,
    status: "CLOSED",
    issueDate: "2026-02-26",
    dueDate: "2026-03-12",
  },
  {
    billNo: `${BILL_PREFIX}2603-01`,
    vendorName: "SGS 香港有限公司",
    description: "開心果農殘／黃曲霉毒素檢測一批",
    amount: 5_600,
    paidAmount: 5_600,
    status: "CLOSED",
    issueDate: "2026-03-09",
    dueDate: "2026-03-30",
  },
  {
    billNo: `${BILL_PREFIX}2603-02`,
    vendorName: "龍盛環球有限公司",
    description: "碧根果樣品及空運附加費短結",
    amount: 3_450,
    paidAmount: 1_500,
    status: "PARTIAL",
    issueDate: "2026-03-24",
    dueDate: "2026-04-14",
  },
  {
    billNo: `${BILL_PREFIX}2604-01`,
    vendorName: "恆昌冷凍物流有限公司",
    description: "冷鏈暫存 12 天（4 月到貨）",
    amount: 6_800,
    paidAmount: 6_800,
    status: "CLOSED",
    issueDate: "2026-04-10",
    dueDate: "2026-04-24",
  },
  {
    billNo: `${BILL_PREFIX}2604-02`,
    vendorName: "訊通系統有限公司",
    description: "倉庫條碼掃描槍保養及耗材",
    amount: 1_280,
    paidAmount: 0,
    status: "OPEN",
    issueDate: "2026-04-27",
    dueDate: "2026-05-18",
  },
  {
    billNo: `${BILL_PREFIX}2605-01`,
    vendorName: "亞洲保險顧問有限公司",
    description: "貨物運輸險（單票 CIF 香港）",
    amount: 2_960,
    paidAmount: 2_960,
    status: "CLOSED",
    issueDate: "2026-05-07",
    dueDate: "2026-05-21",
  },
  {
    billNo: `${BILL_PREFIX}2605-02`,
    vendorName: "明輝印刷有限公司",
    description: "產品標籤及多語言說明卡（小批量）",
    amount: 1_540,
    paidAmount: 0,
    status: "OPEN",
    issueDate: "2026-05-19",
    dueDate: "2026-06-09",
  },
  {
    billNo: `${BILL_PREFIX}2606-01`,
    vendorName: "龍盛環球有限公司",
    description: "開心果到單後 T/T 尾款（短結部分）",
    amount: 16_800,
    paidAmount: 8_000,
    status: "PARTIAL",
    issueDate: "2026-06-06",
    dueDate: "2026-06-20",
  },
  {
    billNo: `${BILL_PREFIX}2606-02`,
    vendorName: "香港品質保證局",
    description: "ISO 文件覆核顧問半天",
    amount: 4_500,
    paidAmount: 0,
    status: "OPEN",
    issueDate: "2026-06-18",
    dueDate: "2026-07-09",
  },
  {
    billNo: `${BILL_PREFIX}2607-01`,
    vendorName: "港燈電力有限公司",
    description: "葵青倉 7 月電費",
    amount: 4_520,
    paidAmount: 0,
    status: "OPEN",
    issueDate: "2026-07-16",
    dueDate: "2026-08-06",
  },
  {
    billNo: `${BILL_PREFIX}2607-02`,
    vendorName: "粵港報關代理行",
    description: "進口報關及植檢證代辦（7 月兩票）",
    amount: 3_280,
    paidAmount: 0,
    status: "OPEN",
    issueDate: "2026-07-24",
    dueDate: "2026-08-07",
  },
  {
    billNo: `${BILL_PREFIX}2607-03`,
    vendorName: "華達包裝材料行",
    description: "真空袋補貨（7 月底出貨用）",
    amount: 980,
    paidAmount: 0,
    status: "OPEN",
    issueDate: "2026-07-29",
    dueDate: "2026-08-12",
  },
];

function atNoon(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00.000Z`);
}

async function main() {
  const company = await prisma.company.findFirst({ where: { code: "CW" } });
  if (!company) {
    console.error("找不到 code=CW 的公司，請先執行 npm run db:seed");
    process.exit(1);
  }

  const del = await prisma.accountsPayable.deleteMany({
    where: {
      companyId: company.id,
      billNo: { startsWith: BILL_PREFIX },
    },
  });
  console.log("已刪除舊 BILL-SEED 筆數:", del.count);

  for (const r of ROWS) {
    await prisma.accountsPayable.create({
      data: {
        companyId: company.id,
        vendorName: r.vendorName,
        description: r.description,
        amount: r.amount,
        paidAmount: r.paidAmount,
        status: r.status,
        billNo: r.billNo,
        issueDate: atNoon(r.issueDate),
        dueDate: r.dueDate ? atNoon(r.dueDate) : null,
      },
    });
  }

  const open = ROWS.filter((r) => r.status === "OPEN" || r.status === "PARTIAL");
  const openSum = open.reduce((s, r) => s + (r.amount - r.paidAmount), 0);
  console.log(
    `已寫入應付帳單 ${ROWS.length} 筆（2026-01～07）；未結餘額約 ${openSum.toFixed(0)}`
  );

  // 與 prisma/seed.ts 請款種子對齊（小額、八月前）
  const prSeedMarker = "請款種子";
  await prisma.paymentRequest.deleteMany({
    where: { companyId: company.id, title: { contains: prSeedMarker } },
  });
  const prSeeds: {
    title: string;
    amount: number;
    purpose: string;
    status: PaymentRequestStatus;
    department: string;
    category: string;
    createdAt: string;
  }[] = [
    {
      title: `快遞與同城送貨（${prSeedMarker}）`,
      amount: 980,
      purpose: "月結運費",
      status: "SUBMITTED",
      department: "行政部",
      category: "物流",
      createdAt: "2026-07-20T09:00:00.000Z",
    },
    {
      title: `辦公軟體年度續費（${prSeedMarker}）`,
      amount: 4_200,
      purpose: "協作與郵箱套件（小團隊）",
      status: "APPROVED",
      department: "財務部",
      category: "其他",
      createdAt: "2026-05-15T10:00:00.000Z",
    },
    {
      title: `冷庫溫度記錄服務（${prSeedMarker}）`,
      amount: 1_800,
      purpose: "月度訂閱",
      status: "PAID",
      department: "品質與合規部",
      category: "其他",
      createdAt: "2026-04-08T11:00:00.000Z",
    },
    {
      title: `展會交通與住宿（${prSeedMarker}）`,
      amount: 2_600,
      purpose: "實報實銷",
      status: "DRAFT",
      department: "市場部",
      category: "差旅",
      createdAt: "2026-06-22T14:00:00.000Z",
    },
    {
      title: `臨時裝卸外包（${prSeedMarker}）`,
      amount: 1_500,
      purpose: "夜間到櫃",
      status: "REJECTED",
      department: "物流倉儲部",
      category: "物流",
      createdAt: "2026-03-16T16:00:00.000Z",
    },
  ];
  for (const r of prSeeds) {
    const needApproval =
      r.status === "APPROVED" || r.status === "REJECTED" || r.status === "PAID";
    const createdAt = new Date(r.createdAt);
    await prisma.paymentRequest.create({
      data: {
        companyId: company.id,
        title: r.title,
        amount: r.amount,
        purpose: r.purpose,
        status: r.status,
        department: r.department,
        category: r.category,
        approverRole: "finance_manager",
        approvedBy: needApproval ? "財務審批" : null,
        approvedAt: needApproval
          ? new Date(createdAt.getTime() + 5 * 3_600_000)
          : null,
        createdAt,
      },
    });
  }
  console.log("已刷新請款種子", prSeeds.length, "筆");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
