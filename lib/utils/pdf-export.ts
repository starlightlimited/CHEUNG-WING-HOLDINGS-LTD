import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// jsPDF 內建字體不支援中文，需嵌入 Noto Sans TC 才能正常顯示
const CJK_FONT_NAME = "NotoSansTC";
const CJK_FONT_FILE = "NotoSansTC-Regular.ttf";
const CJK_FONT_URL = `/fonts/${CJK_FONT_FILE}`;

let cjkFontBase64Promise: Promise<string> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function loadCjkFontBase64(): Promise<string> {
  if (!cjkFontBase64Promise) {
    cjkFontBase64Promise = fetch(CJK_FONT_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error(`下載中文字體失敗: ${res.status}`);
        return arrayBufferToBase64(await res.arrayBuffer());
      })
      .catch((err) => {
        cjkFontBase64Promise = null;
        throw err;
      });
  }
  return cjkFontBase64Promise;
}

// 每個 jsPDF 實例都要註冊一次字體，回傳字體名稱供 autoTable styles 使用
export async function registerCjkFont(doc: jsPDF): Promise<string> {
  const base64 = await loadCjkFontBase64();
  doc.addFileToVFS(CJK_FONT_FILE, base64);
  doc.addFont(CJK_FONT_FILE, CJK_FONT_NAME, "normal");
  doc.setFont(CJK_FONT_NAME, "normal");
  return CJK_FONT_NAME;
}

export async function exportDocumentToPDF(document: any, typeLabel: string) {
  const doc = new jsPDF();
  const font = await registerCjkFont(doc);

  // Add Company Header
  doc.setFontSize(20);
  doc.text("Cheung Wing Holdings Limited", 14, 22);

  doc.setFontSize(12);
  doc.text(`${typeLabel}`, 14, 32);

  // Document Info
  doc.setFontSize(10);
  doc.text(`Document No: ${document.documentNo}`, 14, 45);
  doc.text(`Date: ${new Date(document.date).toLocaleDateString()}`, 14, 52);
  if (document.dueDate) {
    doc.text(`Due Date: ${new Date(document.dueDate).toLocaleDateString()}`, 14, 59);
  }

  // Customer Info
  doc.text(`Customer: ${document.customer?.name || "N/A"}`, 120, 45);
  doc.text(`Contact: ${document.customer?.contactPerson || "N/A"}`, 120, 52);
  doc.text(`Phone: ${document.customer?.phone || "N/A"}`, 120, 59);

  // Table Data
  const tableColumn = ["Product", "Quantity", "Unit Price", "Discount", "Total"];
  const tableRows: any[] = [];

  document.items?.forEach((item: any) => {
    const rowData = [
      item.product?.name || item.productId,
      item.quantity,
      `$${item.unitPrice}`,
      `$${item.discount}`,
      `$${item.total}`,
    ];
    tableRows.push(rowData);
  });

  // @ts-ignore
  autoTable(doc, {
    startY: 70,
    head: [tableColumn],
    body: tableRows,
    theme: "striped",
    styles: { font },
    headStyles: { fillColor: [39, 39, 42], font }, // zinc-900
  });

  // Total Amount
  // @ts-ignore
  const finalY = doc.lastAutoTable.finalY || 70;
  doc.setFontSize(12);
  doc.text(`Total Amount: $${document.totalAmount}`, 140, finalY + 15);

  // Notes
  if (document.notes) {
    doc.setFontSize(10);
    doc.text("Notes:", 14, finalY + 15);
    doc.text(document.notes, 14, finalY + 22);
  }

  // Save the PDF
  doc.save(`${document.documentNo}.pdf`);
}
