import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

function dec(n: Prisma.Decimal | null | undefined): number {
  if (n == null) return 0;
  return Number(n);
}

/** 香港日曆年邊界（避免 UTC 年切導致漏月） */
function yearBoundsHk(year: number): { start: Date; end: Date } {
  return {
    start: new Date(`${year}-01-01T00:00:00+08:00`),
    end: new Date(`${year}-12-31T23:59:59.999+08:00`),
  };
}

/** 香港日曆月份 1–12 */
function hkMonthIndex(d: Date): number {
  const m = Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Hong_Kong",
      month: "numeric",
    }).format(d),
  );
  return m;
}

const notCancelled: Prisma.SalesDocumentWhereInput = {
  status: { not: "CANCELLED" },
};

/**
 * 銷售分析（與合同模組對齊）：
 * - 業績／月度／產品排行：以已確認／已完成合同為準
 * - 在途報價：未轉合同之報價（另欄，不併入業績總額）
 * - 獨立預收：未掛合同之 PI（另欄）
 */
export async function getSalesYearAnalytics(companyId: string, year: number) {
  const { start, end } = yearBoundsHk(year);

  const [contracts, openQuotes, orphanPis] = await Promise.all([
    prisma.salesDocument.findMany({
      where: {
        companyId,
        type: "CONTRACT",
        status: { in: ["CONFIRMED", "COMPLETED"] },
        date: { gte: start, lte: end },
      },
      select: {
        id: true,
        date: true,
        totalAmount: true,
        status: true,
        items: { select: { productId: true, quantity: true, total: true } },
      },
    }),
    prisma.salesDocument.findMany({
      where: {
        companyId,
        type: "QUOTATION",
        ...notCancelled,
        date: { gte: start, lte: end },
        children: { none: { type: "CONTRACT", status: { not: "CANCELLED" } } },
      },
      select: { id: true, totalAmount: true },
    }),
    prisma.salesDocument.findMany({
      where: {
        companyId,
        type: "PROFORMA_INVOICE",
        ...notCancelled,
        date: { gte: start, lte: end },
        OR: [{ parentId: null }, { parent: { is: { type: { not: "CONTRACT" } } } }],
      },
      select: { id: true, totalAmount: true },
    }),
  ]);

  const monthly = Array.from({ length: 12 }, (_, i) => ({
    month: `${i + 1}月`,
    monthIndex: i + 1,
    revenue: 0,
  }));

  let contractWon = 0;
  for (const c of contracts) {
    const amt = dec(c.totalAmount);
    contractWon += amt;
    const month = hkMonthIndex(c.date);
    if (month >= 1 && month <= 12) monthly[month - 1].revenue += amt;
  }

  const pipelineQuoteAmount = openQuotes.reduce((s, q) => s + dec(q.totalAmount), 0);
  const orphanPiAmount = orphanPis.reduce((s, q) => s + dec(q.totalAmount), 0);
  const docCount = contracts.length;
  const avgTicket = docCount > 0 ? contractWon / docCount : 0;
  const maxMonthRev = Math.max(...monthly.map((x) => x.revenue), 0);

  // 產品排行：僅合同明細
  const productMap = new Map<string, { quantity: number; revenue: number }>();
  for (const c of contracts) {
    for (const item of c.items) {
      const cur = productMap.get(item.productId) ?? { quantity: 0, revenue: 0 };
      cur.quantity += item.quantity;
      cur.revenue += dec(item.total);
      productMap.set(item.productId, cur);
    }
  }
  const topEntries = [...productMap.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5);
  const products = await prisma.product.findMany({
    where: { id: { in: topEntries.map(([id]) => id) } },
    select: { id: true, name: true, sku: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const topProducts = topEntries.map(([productId, v]) => {
    const p = byId.get(productId);
    const name = p ? `${p.name}${p.sku ? ` (${p.sku})` : ""}` : productId;
    return { name, sales: v.quantity, revenue: v.revenue };
  });

  return {
    year,
    /** 與合同成交額相同：分析主指標對齊合同 */
    totalDocAmount: contractWon,
    contractWon,
    docCount,
    avgTicket,
    pipelineQuoteAmount,
    pipelineQuoteCount: openQuotes.length,
    orphanPiAmount,
    orphanPiCount: orphanPis.length,
    // 月份由新到舊（12月 → 1月）
    monthly: monthly
      .map(({ month, revenue }) => ({
        month,
        revenue,
        barPct: maxMonthRev > 0 ? Math.min((revenue / maxMonthRev) * 100, 100) : 0,
      }))
      .reverse(),
    topProducts,
  };
}

/** 客戶來源分佈 + 簡單漏斗（客戶去重計數） */
export async function getCustomerAnalytics(companyId: string) {
  const sourceRows = await prisma.customer.findMany({
    where: { companyId },
    select: { source: true },
  });

  const sourceMap = new Map<string, number>();
  for (const c of sourceRows) {
    const key = (c.source && c.source.trim()) || "未填寫";
    sourceMap.set(key, (sourceMap.get(key) ?? 0) + 1);
  }
  const total = sourceRows.length;
  const customerSources = [...sourceMap.entries()]
    .map(([source, count]) => ({
      source,
      count,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const base = { companyId };
  const [withFollow, withQuote, withWonContract] = await Promise.all([
    prisma.customer.count({
      where: { ...base, followUps: { some: {} } },
    }),
    prisma.customer.count({
      where: {
        ...base,
        salesDocuments: {
          some: { type: "QUOTATION", status: { not: "CANCELLED" } },
        },
      },
    }),
    prisma.customer.count({
      where: {
        ...base,
        salesDocuments: {
          some: {
            type: "CONTRACT",
            status: { in: ["CONFIRMED", "COMPLETED"] },
          },
        },
      },
    }),
  ]);

  const pct = (n: number) =>
    total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "0%";

  const conversionRates = [
    {
      stage: "客戶檔案 (總數)",
      count: total,
      rate: total > 0 ? "100%" : "—",
    },
    { stage: "有跟進記錄", count: withFollow, rate: pct(withFollow) },
    { stage: "有報價單", count: withQuote, rate: pct(withQuote) },
    {
      stage: "有成交合同",
      count: withWonContract,
      rate: pct(withWonContract),
    },
  ];

  return { customerSources, conversionRates, totalCustomers: total };
}
