/**
 * 修復稽核發現：
 * 1) 孤兒合同 CT-1776766424111 重建報價並掛 parentId
 * 2) 明細 total 對齊 qty×unitPrice，單據頭對齊明細合計
 *
 * Usage: npx tsx scripts/fix-audit-findings.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function money(n: number): Prisma.Decimal {
  return new Prisma.Decimal(Math.round(n * 100) / 100);
}

async function main() {
  const company = await prisma.company.findFirst({ where: { code: "CW" } });
  if (!company) throw new Error("找不到 CW");
  const companyId = company.id;

  // —— 1) 孤兒合同 ——
  const orphan = await prisma.salesDocument.findFirst({
    where: { companyId, documentNo: "CT-1776766424111", type: "CONTRACT" },
    include: { items: true },
  });
  if (orphan) {
    let qt = await prisma.salesDocument.findFirst({
      where: { companyId, documentNo: "QT-1776766382309", type: "QUOTATION" },
    });
    if (!qt) {
      const qtDate = new Date(orphan.date.getTime() - 2 * 86400000);
      qt = await prisma.salesDocument.create({
        data: {
          companyId,
          type: "QUOTATION",
          documentNo: "QT-1776766382309",
          customerId: orphan.customerId,
          date: qtDate,
          totalAmount: orphan.totalAmount,
          status: "CONFIRMED",
          notes: "重建來源報價（稽核修復）",
          items: {
            create: orphan.items.map((item) => ({
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
      console.log("重建", qt.documentNo);
    }
    if (orphan.parentId !== qt.id) {
      await prisma.salesDocument.update({
        where: { id: orphan.id },
        data: { parentId: qt.id },
      });
      console.log("掛接 parentId", orphan.documentNo, "→", qt.documentNo);
    }
  }

  // —— 2) 所有銷售單據：行 total = qty×price；頭 = 行合計 ——
  const docs = await prisma.salesDocument.findMany({
    where: { companyId, status: { not: "CANCELLED" } },
    include: { items: true },
  });

  let fixedLines = 0;
  let fixedHeaders = 0;

  for (const doc of docs) {
    if (doc.items.length === 0) continue;

    let headerChanged = false;
    for (const item of doc.items) {
      const expected = money(Number(item.quantity) * Number(item.unitPrice));
      if (!expected.equals(item.total)) {
        await prisma.salesDocumentItem.update({
          where: { id: item.id },
          data: { total: expected },
        });
        fixedLines++;
        item.total = expected;
      }
    }

    const sum = doc.items.reduce((a, i) => a.add(i.total), new Prisma.Decimal(0));
    if (!sum.equals(doc.totalAmount)) {
      await prisma.salesDocument.update({
        where: { id: doc.id },
        data: { totalAmount: sum },
      });
      fixedHeaders++;
      headerChanged = true;
    }

    if (headerChanged && doc.type === "CONTRACT") {
      // 同步父報價與子 PI 頭金額＋行（已在各自迴圈修正行；此處確保父/子頭一致）
      if (doc.parentId) {
        const parentItems = await prisma.salesDocumentItem.findMany({
          where: { salesDocumentId: doc.parentId },
        });
        for (const pi of parentItems) {
          const expected = money(Number(pi.quantity) * Number(pi.unitPrice));
          if (!expected.equals(pi.total)) {
            await prisma.salesDocumentItem.update({
              where: { id: pi.id },
              data: { total: expected },
            });
          }
        }
        const pSum = (
          await prisma.salesDocumentItem.findMany({
            where: { salesDocumentId: doc.parentId },
          })
        ).reduce((a, i) => a.add(i.total), new Prisma.Decimal(0));
        await prisma.salesDocument.update({
          where: { id: doc.parentId },
          data: { totalAmount: pSum },
        });
      }
    }
  }

  console.log(`明細行修正: ${fixedLines}；單據頭修正: ${fixedHeaders}`);

  // 合同合計
  const cts = await prisma.salesDocument.findMany({
    where: { companyId, type: "CONTRACT", status: { not: "CANCELLED" } },
    select: { totalAmount: true, documentNo: true, parentId: true },
  });
  const sum = cts.reduce((s, c) => s + Number(c.totalAmount), 0);
  const orphanLeft = cts.filter((c) => !c.parentId);
  console.log("合同合計:", sum);
  console.log("無 parentId 合同:", orphanLeft.map((c) => c.documentNo));

  // 再驗殘差
  let residual = 0;
  const check = await prisma.salesDocument.findMany({
    where: { companyId, status: { not: "CANCELLED" } },
    include: { items: true },
  });
  for (const d of check) {
    for (const i of d.items) {
      const calc = Number(i.quantity) * Number(i.unitPrice);
      if (Math.abs(calc - Number(i.total)) > 0.02) residual++;
    }
    const s = d.items.reduce((a, i) => a + Number(i.total), 0);
    if (Math.abs(s - Number(d.totalAmount)) > 0.02) {
      console.log("頭仍不一致", d.documentNo, d.totalAmount, s);
    }
  }
  console.log("行殘差剩餘:", residual);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
