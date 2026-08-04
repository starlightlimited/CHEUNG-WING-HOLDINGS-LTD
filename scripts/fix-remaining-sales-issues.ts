/**
 * 修復剩餘銷售資料問題：
 * 1) 孤兒合同 CT-1776766424111：重建來源報價並掛 parentId
 * 2) 合同日早於報價日：將報價日調至合同日前
 * 3) 5–8 月合同補掛預收發票
 * 4) DRAFT／長期 PENDING 合同升為 CONFIRMED／COMPLETED（供佣金與成交口徑）
 *
 * Usage: npx tsx scripts/fix-remaining-sales-issues.ts
 */
import { PrismaClient, SalesDocumentStatus } from "@prisma/client";

const prisma = new PrismaClient();
const PI_BATCH = "[SEED-PI-2026-05-08]";

async function main() {
  const company = await prisma.company.findFirst({ where: { code: "CW" } });
  if (!company) throw new Error("找不到 CW 公司");
  const companyId = company.id;

  // —— 1) 孤兒合同：重建 QT-1776766382309 ——
  const orphanCt = await prisma.salesDocument.findFirst({
    where: { companyId, documentNo: "CT-1776766424111", type: "CONTRACT" },
    include: { items: true },
  });
  if (!orphanCt) {
    console.warn("找不到 CT-1776766424111，跳過孤兒修復");
  } else {
    let parentQt = await prisma.salesDocument.findFirst({
      where: { companyId, documentNo: "QT-1776766382309", type: "QUOTATION" },
    });

    if (!parentQt) {
      const qtDate = new Date(orphanCt.date.getTime() - 2 * 86400000);
      parentQt = await prisma.salesDocument.create({
        data: {
          companyId,
          type: "QUOTATION",
          documentNo: "QT-1776766382309",
          customerId: orphanCt.customerId,
          date: qtDate,
          totalAmount: orphanCt.totalAmount,
          status: "CONFIRMED",
          notes: "重建來源報價（原單缺失，依合同明細還原）",
          items: {
            create: orphanCt.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount,
              taxRate: item.taxRate,
              total: item.total,
            })),
          },
        },
      });
      console.log(`已重建報價 ${parentQt.documentNo} date=${qtDate.toISOString()}`);
    } else if (parentQt.status !== "CONFIRMED") {
      await prisma.salesDocument.update({
        where: { id: parentQt.id },
        data: { status: "CONFIRMED" },
      });
    }

    if (orphanCt.parentId !== parentQt.id) {
      await prisma.salesDocument.update({
        where: { id: orphanCt.id },
        data: { parentId: parentQt.id },
      });
      console.log(`已掛接 CT-1776766424111.parentId → ${parentQt.documentNo}`);
    } else {
      console.log("CT-1776766424111 已有正確 parentId");
    }
  }

  // —— 2) 合同日早於報價日：報價日改為合同日前 3 天 ——
  const datePairs = [
    { ctNo: "CT-1776827065448", qtNo: "QT-1776825556963" },
    { ctNo: "CT-1776827087113", qtNo: "QT-1776825049490" },
  ];
  for (const { ctNo, qtNo } of datePairs) {
    const ct = await prisma.salesDocument.findFirst({
      where: { companyId, documentNo: ctNo, type: "CONTRACT" },
      select: { id: true, date: true },
    });
    const qt = await prisma.salesDocument.findFirst({
      where: { companyId, documentNo: qtNo, type: "QUOTATION" },
      select: { id: true, date: true },
    });
    if (!ct || !qt) {
      console.warn(`跳過日期修復：${ctNo}/${qtNo}`);
      continue;
    }
    if (ct.date < qt.date) {
      const newQtDate = new Date(ct.date.getTime() - 3 * 86400000);
      await prisma.salesDocument.update({
        where: { id: qt.id },
        data: { date: newQtDate },
      });
      console.log(
        `報價日修正 ${qtNo}: ${qt.date.toISOString().slice(0, 10)} → ${newQtDate.toISOString().slice(0, 10)}（合同 ${ctNo} ${ct.date.toISOString().slice(0, 10)}）`,
      );
    }
  }

  // —— 3) DRAFT／PENDING 合同狀態對齊 ——
  // DRAFT（已轉自報價）→ CONFIRMED；較早 PENDING → COMPLETED；近期 PENDING → CONFIRMED
  const draftCt = await prisma.salesDocument.updateMany({
    where: { companyId, type: "CONTRACT", status: "DRAFT" },
    data: { status: "CONFIRMED" },
  });
  console.log(`DRAFT→CONFIRMED 合同: ${draftCt.count}`);

  const pendingOlder = await prisma.salesDocument.updateMany({
    where: {
      companyId,
      type: "CONTRACT",
      status: "PENDING",
      date: { lt: new Date("2026-07-01T00:00:00+08:00") },
    },
    data: { status: "COMPLETED" },
  });
  console.log(`PENDING(<7月)→COMPLETED 合同: ${pendingOlder.count}`);

  const pendingRecent = await prisma.salesDocument.updateMany({
    where: {
      companyId,
      type: "CONTRACT",
      status: "PENDING",
      date: { gte: new Date("2026-07-01T00:00:00+08:00") },
    },
    data: { status: "CONFIRMED" },
  });
  console.log(`PENDING(≥7月)→CONFIRMED 合同: ${pendingRecent.count}`);

  // —— 4) 5–8 月合同補 PI（冪等：依批次標籤清理後重建；已有其他 PI 則跳過）——
  const oldBatch = await prisma.salesDocument.findMany({
    where: { companyId, type: "PROFORMA_INVOICE", notes: { contains: PI_BATCH } },
    select: { id: true },
  });
  for (const d of oldBatch) {
    await prisma.salesDocumentItem.deleteMany({ where: { salesDocumentId: d.id } });
    await prisma.salesDocument.delete({ where: { id: d.id } });
  }
  if (oldBatch.length) console.log(`清除舊批次 PI: ${oldBatch.length}`);

  const mayAugContracts = await prisma.salesDocument.findMany({
    where: {
      companyId,
      type: "CONTRACT",
      date: { gte: new Date("2026-05-01T00:00:00+08:00") },
      status: { not: "CANCELLED" },
    },
    include: {
      items: true,
      children: {
        where: { type: "PROFORMA_INVOICE", status: { not: "CANCELLED" } },
        select: { id: true },
      },
    },
    orderBy: { date: "asc" },
  });

  let piCreated = 0;
  for (const ct of mayAugContracts) {
    if (ct.children.length > 0) {
      console.log(`跳過（已有 PI）: ${ct.documentNo}`);
      continue;
    }

    const piDate = new Date(ct.date.getTime() + 2 * 3600000); // 合同後約 2 小時
    const piStatus: SalesDocumentStatus =
      ct.status === "COMPLETED" ? "CONFIRMED" : ct.status === "CONFIRMED" ? "PENDING" : "DRAFT";
    // 穩定單號：PI-{ct.ts 風格}+1，避免撞號
    const tsMatch = ct.documentNo.match(/CT-(\d+)/);
    const piNo = tsMatch
      ? `PI-${(Number(tsMatch[1]) + 9001).toString()}`
      : `PI-${Date.now()}`;

    await prisma.salesDocument.create({
      data: {
        companyId,
        type: "PROFORMA_INVOICE",
        documentNo: piNo,
        customerId: ct.customerId,
        date: piDate,
        totalAmount: ct.totalAmount,
        status: piStatus,
        notes: `Converted from ${ct.documentNo} ${PI_BATCH} 依合同開立預收發票`,
        parentId: ct.id,
        items: {
          create: ct.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            taxRate: item.taxRate,
            total: item.total,
          })),
        },
      },
    });
    piCreated++;
    console.log(`  PI ${piNo} ← ${ct.documentNo} [${piStatus}]`);
  }
  console.log(`新建預收發票: ${piCreated} 筆`);

  // —— 摘要 ——
  const ctByStatus = await prisma.salesDocument.groupBy({
    by: ["status"],
    where: { companyId, type: "CONTRACT" },
    _count: true,
  });
  const piCount = await prisma.salesDocument.count({
    where: { companyId, type: "PROFORMA_INVOICE" },
  });
  const linked = await prisma.salesDocument.count({
    where: {
      companyId,
      type: "CONTRACT",
      date: { gte: new Date("2026-05-01T00:00:00+08:00") },
      children: { some: { type: "PROFORMA_INVOICE", status: { not: "CANCELLED" } } },
    },
  });
  const mayAugTotal = mayAugContracts.length;
  console.log("合同狀態:", ctByStatus);
  console.log(`預收發票總數: ${piCount}；5–8 月合同已掛 PI: ${linked}/${mayAugTotal}`);

  // 驗證孤兒與日期
  const check = await prisma.salesDocument.findFirst({
    where: { documentNo: "CT-1776766424111" },
    include: { parent: { select: { documentNo: true, date: true, status: true } } },
  });
  console.log("孤兒合同驗證:", {
    documentNo: check?.documentNo,
    parentId: check?.parentId,
    parent: check?.parent,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
