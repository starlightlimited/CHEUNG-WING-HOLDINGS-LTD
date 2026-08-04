/**
 * 依真實業務邏輯寫入預收款（Prepayment）示範數據：
 *
 * 規則（模擬貿易公司收款慣例）：
 * - COMPLETED 合同：款項已收齊，合計 = 合同總額，狀態 CLOSED
 *     · 簽約 7 天內的新合同 → 單筆 100% 全款
 *     · 其餘輪替三種模式：30% 訂金 + 尾款 / 單筆全款 / 50% + 50%
 * - CONFIRMED 合同：已收約 30% 訂金
 *     · 14 天內收的 → OPEN；更早 → PARTIALLY_APPLIED
 * - 另加 3 筆「待對接」預收（OPEN、無合同關聯），供預收款對接頁演示
 *
 * 細節：
 * - 訂金取整到百位，尾款 = 合同額 − 訂金（合計剛好等於合同總額）
 * - 收款日期 = 簽約日 + N 天，不早於簽約日、不晚於今天
 * - 個人客戶用 支付寶/微信支付/現金；公司客戶用 滙豐銀行/花旗銀行
 * - 安全檢查：若已有預收款資料則中止，避免覆蓋手動入賬
 *
 * 執行：npx tsx scripts/seed-prepayments-realistic.ts
 */
import { PrismaClient, PrepaymentStatus } from "@prisma/client";

const prisma = new PrismaClient();

const COMPANY_CODE = "CW";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const PERSONAL_KEYWORDS = ["蔡靜怡", "鄧子軒", "馮凱琳"];
const COMPANY_ACCOUNTS = ["滙豐銀行", "滙豐銀行", "滙豐銀行", "花旗銀行"];
const PERSONAL_ACCOUNTS = ["支付寶", "微信支付", "現金"];

function roundToHundred(n: number): number {
  return Math.round(n / 100) * 100;
}

function addDaysClamped(base: Date, days: number, today: Date): Date {
  const d = new Date(base.getTime() + days * MS_PER_DAY);
  const capped = d > today ? today : d;
  return new Date(capped.getFullYear(), capped.getMonth(), capped.getDate(), 12, 0, 0);
}

function pickAccount(customerName: string, index: number): string {
  const isPersonal = PERSONAL_KEYWORDS.some((k) => customerName.includes(k));
  const pool = isPersonal ? PERSONAL_ACCOUNTS : COMPANY_ACCOUNTS;
  return pool[index % pool.length];
}

type PrepayDraft = {
  amount: number;
  receivedAt: Date;
  reference: string;
  status: PrepaymentStatus;
  note: string;
};

function planForCompleted(total: number, contractDate: Date, index: number, today: Date): PrepayDraft[] {
  const daysSinceContract = Math.floor((today.getTime() - contractDate.getTime()) / MS_PER_DAY);

  // 簽約 7 天內：單筆全款
  if (daysSinceContract <= 7) {
    return [
      {
        amount: total,
        receivedAt: addDaysClamped(contractDate, 0, today),
        reference: "",
        status: "CLOSED",
        note: "合同全款",
      },
    ];
  }

  const pattern = index % 3;
  if (pattern === 0) {
    // 30% 訂金 + 尾款
    const deposit = Math.min(roundToHundred(total * 0.3), total - 1);
    return [
      {
        amount: deposit,
        receivedAt: addDaysClamped(contractDate, 5, today),
        reference: "",
        status: "CLOSED",
        note: "合同訂金（約 30%）",
      },
      {
        amount: total - deposit,
        receivedAt: addDaysClamped(contractDate, 25, today),
        reference: "",
        status: "CLOSED",
        note: "合同尾款",
      },
    ];
  }
  if (pattern === 1) {
    // 單筆全款
    return [
      {
        amount: total,
        receivedAt: addDaysClamped(contractDate, 7, today),
        reference: "",
        status: "CLOSED",
        note: "合同全款",
      },
    ];
  }
  // 50% + 50%
  const half = Math.min(roundToHundred(total * 0.5), total - 1);
  return [
    {
      amount: half,
      receivedAt: addDaysClamped(contractDate, 5, today),
      reference: "",
      status: "CLOSED",
      note: "合同首期（50%）",
    },
    {
      amount: total - half,
      receivedAt: addDaysClamped(contractDate, 30, today),
      reference: "",
      status: "CLOSED",
      note: "合同尾款",
    },
  ];
}

function planForConfirmed(total: number, contractDate: Date, today: Date): PrepayDraft[] {
  const deposit = Math.min(roundToHundred(total * 0.3), total - 1);
  const receivedAt = addDaysClamped(contractDate, 5, today);
  const daysSinceReceived = Math.floor((today.getTime() - receivedAt.getTime()) / MS_PER_DAY);
  return [
    {
      amount: deposit,
      receivedAt,
      reference: "",
      status: daysSinceReceived <= 14 ? "OPEN" : "PARTIALLY_APPLIED",
      note: "合同訂金（約 30%）",
    },
  ];
}

async function main() {
  const company = await prisma.company.findFirst({ where: { code: COMPANY_CODE } });
  if (!company) throw new Error(`找不到公司代碼 ${COMPANY_CODE}`);

  const existing = await prisma.prepayment.count({ where: { companyId: company.id } });
  if (existing > 0) {
    console.log(`已存在 ${existing} 筆預收款，為避免覆蓋手動資料，中止執行。`);
    return;
  }

  const today = new Date();
  const contracts = await prisma.salesDocument.findMany({
    where: { companyId: company.id, type: "CONTRACT", status: { in: ["COMPLETED", "CONFIRMED"] } },
    orderBy: { date: "asc" },
    include: { customer: { select: { id: true, name: true } } },
  });
  console.log(`找到 ${contracts.length} 份合同，開始產生預收款…`);

  let created = 0;
  let accountIdx = 0;

  for (const c of contracts) {
    const total = Number(c.totalAmount);
    if (total <= 0) continue;

    const plans =
      c.status === "COMPLETED"
        ? planForCompleted(total, c.date, created, today)
        : planForConfirmed(total, c.date, today);

    for (const p of plans) {
      await prisma.prepayment.create({
        data: {
          companyId: company.id,
          customerId: c.customer.id,
          payerName: c.customer.name,
          amount: p.amount,
          receivedAt: p.receivedAt,
          reference: pickAccount(c.customer.name, accountIdx++),
          status: p.status,
          linkedDocumentType: "CONTRACT",
          linkedDocumentId: c.documentNo,
          note: p.note,
        },
      });
      created++;
    }
  }

  // 3 筆「待對接」預收：已收款但尚未指定合同
  const unmatchedTargets = [
    { keyword: "大昌行", amount: 3000, date: new Date(2026, 6, 30, 12), account: "滙豐銀行" },
    { keyword: "嘉頓", amount: 2500, date: new Date(2026, 7, 2, 12), account: "滙豐銀行" },
  ];
  for (const t of unmatchedTargets) {
    const cust = await prisma.customer.findFirst({
      where: { companyId: company.id, name: { contains: t.keyword } },
      select: { id: true, name: true },
    });
    if (!cust || t.date > today) continue;
    await prisma.prepayment.create({
      data: {
        companyId: company.id,
        customerId: cust.id,
        payerName: cust.name,
        amount: t.amount,
        receivedAt: t.date,
        reference: t.account,
        status: "OPEN",
        note: "預收貨款（待對接合同）",
      },
    });
    created++;
  }

  // 1 筆只填付款人名稱、無客戶檔案的現金預收
  const looseDate = new Date(2026, 6, 25, 12);
  if (looseDate <= today) {
    await prisma.prepayment.create({
      data: {
        companyId: company.id,
        payerName: "九龍城環球堅果批發有限公司",
        amount: 1800,
        receivedAt: looseDate,
        reference: "現金",
        status: "OPEN",
        note: "預收訂金（無客戶檔案 ID）",
      },
    });
    created++;
  }

  const sum = await prisma.prepayment.aggregate({
    where: { companyId: company.id },
    _sum: { amount: true },
    _count: true,
  });
  console.log(`完成：共寫入 ${created} 筆預收款，合計 $${Number(sum._sum.amount ?? 0).toFixed(2)}`);
}

main().finally(() => prisma.$disconnect());
