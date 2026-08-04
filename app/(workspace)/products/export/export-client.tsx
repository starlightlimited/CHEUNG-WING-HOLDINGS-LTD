"use client";

import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { registerCjkFont } from "@/lib/utils/pdf-export";

type Product = {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  description: string | null;
  price: any;
  cost: any;
  attributes: any;
  attachments: any;
  createdAt: Date;
};

type ParsedProduct = {
  id: string;
  sku: string;
  name: string;
  barcode: string;
  description: string;
  price: number;
  cost: number;
  category: string;
  subCategory: string;
  packaging: string;
  specs: string;
  customAttributes: string;
  bom: string;
  pricingTiers: string;
  attachments: string;
  createdAt: string;
};

export function ExportClient({ products: initialProducts }: { products: Product[] }) {
  // Parse and flatten product data
  const products: ParsedProduct[] = useMemo(() => {
    return initialProducts.map((p) => {
      let attr: any = {};
      if (p.attributes) {
        try {
          attr = typeof p.attributes === "string" ? JSON.parse(p.attributes) : p.attributes;
        } catch (e) {}
      }

      // Format specs
      const specsObj = attr.specs || {};
      const specsStr = Object.entries(specsObj).map(([k, v]) => `${k}: ${v}`).join("\n");

      // Format custom attributes
      const customObj = attr.customAttributes || {};
      const customStr = Object.entries(customObj).map(([k, v]) => `${k}: ${v}`).join("\n");

      // Format BOM
      const bomArr = Array.isArray(attr.bom) ? attr.bom : [];
      const bomStr = bomArr.map((b: any) => `${b.name} (${b.quantity}${b.unit})`).join("\n");

      // Format pricing tiers
      const tiersArr = Array.isArray(attr.pricingTiers) ? attr.pricingTiers : [];
      const tiersStr = tiersArr.map((t: any) => `${t.name}: $${t.price}`).join("\n");

      // Format attachments
      let attArr: any[] = [];
      if (p.attachments) {
        try {
          attArr = typeof p.attachments === "string" ? JSON.parse(p.attachments) : p.attachments;
          if (!Array.isArray(attArr)) attArr = [];
        } catch (e) {}
      }
      const attStr = attArr.map((a: any) => `[${a.type}] ${a.url}`).join("\n");

      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        barcode: p.barcode || "",
        description: p.description || "",
        price: Number(p.price || 0),
        cost: Number(p.cost || 0),
        category: attr.category || "",
        subCategory: attr.subCategory || "",
        packaging: attr.packaging || "",
        specs: specsStr,
        customAttributes: customStr,
        bom: bomStr,
        pricingTiers: tiersStr,
        attachments: attStr,
        createdAt: new Date(p.createdAt).toLocaleDateString(),
      };
    });
  }, [initialProducts]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [products, searchQuery]);

  // Handle selection
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedIds(new Set());
    } else {
      const newSelected = new Set(filteredProducts.map((p) => p.id));
      setSelectedIds(newSelected);
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // Get selected data
  const getSelectedData = () => {
    if (selectedIds.size === 0) {
      return filteredProducts; // Export all filtered if none selected
    }
    return filteredProducts.filter((p) => selectedIds.has(p.id));
  };

  // Export to Excel
  const exportToExcel = () => {
    const data = getSelectedData();
    if (data.length === 0) {
      alert("沒有可導出的數據");
      return;
    }

    const exportData = data.map((p) => ({
      "SKU": p.sku,
      "產品名稱": p.name,
      "條碼 (Barcode)": p.barcode,
      "分類 (Category)": p.category,
      "子分類 (Sub-Category)": p.subCategory,
      "包裝方式": p.packaging,
      "規格參數": p.specs,
      "自定義屬性": p.customAttributes,
      "配件與 BOM": p.bom,
      "自定義定價": p.pricingTiers,
      "多媒體資源": p.attachments,
      "標準成本": p.cost,
      "建議售價": p.price,
      "產品描述": p.description,
      "創建時間": p.createdAt,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "產品列表");

    // Auto-size columns
    const colWidths = [
      { wch: 15 }, // SKU
      { wch: 30 }, // Name
      { wch: 15 }, // Barcode
      { wch: 15 }, // Category
      { wch: 15 }, // Sub-Category
      { wch: 20 }, // Packaging
      { wch: 30 }, // Specs
      { wch: 30 }, // Custom Attributes
      { wch: 40 }, // BOM
      { wch: 30 }, // Pricing Tiers
      { wch: 50 }, // Attachments
      { wch: 12 }, // Cost
      { wch: 12 }, // Price
      { wch: 40 }, // Description
      { wch: 15 }, // Created At
    ];
    worksheet["!cols"] = colWidths;

    XLSX.writeFile(workbook, `產品列表_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Export to PDF
  const exportToPDF = async () => {
    const data = getSelectedData();
    if (data.length === 0) {
      alert("沒有可導出的數據");
      return;
    }

    const doc = new jsPDF("landscape");
    const font = await registerCjkFont(doc);
    
    // Add title
    doc.setFontSize(16);
    doc.text("產品列表 (Product List)", 14, 15);
    
    // Add date
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`導出日期: ${new Date().toLocaleDateString()}`, 14, 22);

    const tableData = data.map((p) => [
      p.sku,
      p.name,
      p.category,
      p.specs,
      p.bom,
      p.pricingTiers,
      `$${p.cost.toFixed(2)}`,
      `$${p.price.toFixed(2)}`,
    ]);

    autoTable(doc, {
      startY: 30,
      head: [["SKU", "產品名稱", "分類", "規格", "BOM", "定價", "成本", "售價"]],
      body: tableData,
      theme: "grid",
      styles: {
        font,
        fontSize: 7,
        cellPadding: 2,
      },
      columnStyles: {
        3: { cellWidth: 35 }, // Specs
        4: { cellWidth: 40 }, // BOM
        5: { cellWidth: 30 }, // Pricing
      },
      headStyles: {
        fillColor: [41, 41, 41],
        textColor: 255,
        font,
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
    });

    doc.save(`產品列表_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">產品導出</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            將產品數據導出為 Excel 或 PDF 格式，支持篩選和勾選導出。
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <path d="M8 13h2"></path>
              <path d="M8 17h2"></path>
              <path d="M14 13h2"></path>
              <path d="M14 17h2"></path>
            </svg>
            導出 Excel
          </button>
          <button
            onClick={exportToPDF}
            className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <path d="M9 15.5v-5.3a1.2 1.2 0 0 1 1.2-1.2h.8a1.2 1.2 0 0 1 1.2 1.2v5.3"></path>
              <path d="M14 15.5v-5.3a1.2 1.2 0 0 1 1.2-1.2h.8a1.2 1.2 0 0 1 1.2 1.2v5.3"></path>
            </svg>
            導出 PDF
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 max-w-md">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="搜索名稱、SKU 或分類..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-zinc-300 pl-9 pr-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </div>
        </div>
        <div className="text-sm text-zinc-500">
          已選擇 {selectedIds.size} 項 (共 {filteredProducts.length} 項)
          {selectedIds.size === 0 && <span className="ml-2 text-xs text-zinc-400">未選擇時將導出全部篩選結果</span>}
        </div>
      </div>

      {/* Data Table Preview */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 max-h-[600px]">
        <table className="min-w-full text-left text-sm relative">
          <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 w-12 text-center">
                <input
                  type="checkbox"
                  checked={
                    filteredProducts.length > 0 &&
                    selectedIds.size === filteredProducts.length
                  }
                  onChange={toggleSelectAll}
                  className="rounded border-zinc-300 dark:border-zinc-600"
                />
              </th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">產品名稱</th>
              <th className="px-4 py-3">分類</th>
              <th className="px-4 py-3">包裝方式</th>
              <th className="px-4 py-3">規格</th>
              <th className="px-4 py-3">BOM</th>
              <th className="px-4 py-3">定價階梯</th>
              <th className="px-4 py-3 text-right">成本</th>
              <th className="px-4 py-3 text-right">售價</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((p) => (
              <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    className="rounded border-zinc-300 dark:border-zinc-600"
                  />
                </td>
                <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{p.name}</td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                  {p.category} {p.subCategory && `> ${p.subCategory}`}
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{p.packaging || "—"}</td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 text-xs whitespace-pre-line max-w-[150px] truncate hover:whitespace-normal hover:overflow-visible">{p.specs || "—"}</td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 text-xs whitespace-pre-line max-w-[150px] truncate hover:whitespace-normal hover:overflow-visible">{p.bom || "—"}</td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 text-xs whitespace-pre-line max-w-[150px] truncate hover:whitespace-normal hover:overflow-visible">{p.pricingTiers || "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">${p.cost.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-zinc-900 dark:text-zinc-100">${p.price.toFixed(2)}</td>
              </tr>
            ))}
            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-zinc-500">
                  沒有找到匹配的產品
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
