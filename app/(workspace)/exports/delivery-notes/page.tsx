import { prisma } from "@/lib/prisma";
import { getDefaultCompanyId } from "@/lib/company";
import { DeliveryNotesExportClient, type DeliveryNoteExportRow } from "./delivery-note-export-client";

export const dynamic = "force-dynamic";

function hkCalendarDate(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
}

function deliveryNoteNoFromPi(documentNo: string) {
  return documentNo.startsWith("PI-") ? documentNo.replace(/^PI/, "DN") : `DN-${documentNo}`;
}

function salesOrderNoFromPi(documentNo: string) {
  return documentNo.startsWith("PI-") ? documentNo.replace(/^PI/, "SO") : `SO-${documentNo}`;
}

function mapDocStatusToDelivery(status: string): DeliveryNoteExportRow["deliveryStatus"] {
  switch (status) {
    case "COMPLETED":
      return "已送達";
    case "CONFIRMED":
      return "配送中";
    case "PENDING":
      return "待發貨";
    case "DRAFT":
      return "待排期";
    case "CANCELLED":
      return "已取消";
    default:
      return "待排期";
  }
}

export default async function DeliveryNotesExportPage() {
  const companyId = await getDefaultCompanyId();
  const rangeStart = new Date("2026-03-01T00:00:00+08:00");
  const rangeEnd = new Date("2026-08-04T23:59:59.999+08:00");

  const rows = await prisma.salesDocument.findMany({
    where: {
      companyId,
      type: "PROFORMA_INVOICE",
      date: { gte: rangeStart, lte: rangeEnd },
    },
    include: { customer: { select: { name: true, address: true } } },
    orderBy: [{ date: "desc" }, { documentNo: "desc" }],
  });

  const initialRows: DeliveryNoteExportRow[] = rows.map((r) => ({
    id: r.id,
    deliveryNoteNo: deliveryNoteNoFromPi(r.documentNo),
    relatedOrderNo: salesOrderNoFromPi(r.documentNo),
    customerName: r.customer.name,
    deliveryDate: hkCalendarDate(r.date),
    address:
      (r.customer.address && r.customer.address.trim()) ||
      "（客戶主檔未填送貨地址；以銷售／倉務約定為準）",
    deliveryStatus: mapDocStatusToDelivery(r.status),
  }));

  return <DeliveryNotesExportClient initialRows={initialRows} />;
}
