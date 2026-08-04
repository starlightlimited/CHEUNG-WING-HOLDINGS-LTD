"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Search, FileSpreadsheet } from "lucide-react";

export type InvoiceExportRow = {
  id: string;
  documentNo: string;
  customerName: string;
  date: string;
  amount: string;
  status: string;
};

function statusBadgeClass(status: string) {
  switch (status) {
    case "DRAFT":
      return "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200";
    case "PENDING":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
    case "CONFIRMED":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
    case "CANCELLED":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
    case "COMPLETED":
      return "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200";
    default:
      return "bg-zinc-100 text-zinc-800";
  }
}

function statusLabelZh(status: string) {
  switch (status) {
    case "DRAFT":
      return "草稿";
    case "PENDING":
      return "待處理";
    case "CONFIRMED":
      return "已確認";
    case "CANCELLED":
      return "已取消";
    case "COMPLETED":
      return "已完成";
    default:
      return status;
  }
}

export function InvoiceExportClient({ initialInvoices }: { initialInvoices: InvoiceExportRow[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("2026-03-01");
  const [dateTo, setDateTo] = useState("2026-08-04");
  const [isExporting, setIsExporting] = useState(false);

  const filteredInvoices = useMemo(() => {
    const from = dateFrom ? dateFrom : "0000-01-01";
    const to = dateTo ? dateTo : "9999-12-31";
    const q = searchTerm.trim().toLowerCase();
    return initialInvoices
      .filter((inv) => {
        const inRange = inv.date >= from && inv.date <= to;
        if (!inRange) return false;
        if (!q) return true;
        return (
          inv.customerName.toLowerCase().includes(q) ||
          inv.documentNo.toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) || b.documentNo.localeCompare(a.documentNo),
      );
  }, [initialInvoices, searchTerm, dateFrom, dateTo]);

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      alert(
        `將匯出 ${filteredInvoices.length} 筆預收發票（HKD）至 Excel 範本。\n實際檔案下載可後續對接後端導出 API。`,
      );
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">發票導出</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            列表資料來自銷售模塊「預收發票」主檔；可篩選後匯出。
          </p>
        </div>
        <Button onClick={handleExport} disabled={isExporting || filteredInvoices.length === 0} className="gap-2 shrink-0">
          {isExporting ? (
            <span className="animate-spin">⏳</span>
          ) : (
            <FileSpreadsheet className="h-4 w-4" />
          )}
          {isExporting ? "導出中..." : "導出為 Excel"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>預收發票列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索單號或客戶名稱…"
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="date" className="w-[160px]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <span className="text-sm text-muted-foreground">至</span>
              <Input type="date" className="w-[160px]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>發票編號</TableHead>
                  <TableHead>客戶名稱</TableHead>
                  <TableHead>開票日期</TableHead>
                  <TableHead className="text-right">金額 (HKD)</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead className="text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.length > 0 ? (
                  filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">{invoice.documentNo}</TableCell>
                      <TableCell>{invoice.customerName}</TableCell>
                      <TableCell>{invoice.date}</TableCell>
                      <TableCell className="text-right">
                        {Number(invoice.amount).toLocaleString("zh-HK", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(invoice.status)}`}>
                          {statusLabelZh(invoice.status)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="sm" className="gap-1" asChild>
                          <Link href={`/sales/proforma-invoices/${invoice.id}`}>
                            <Download className="h-4 w-4" />
                            查看／PDF
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      {initialInvoices.length === 0
                        ? "暫無預收發票；可在銷售模塊新增，或執行 npx prisma db seed 載入種子資料。"
                        : "沒有符合篩選條件的發票記錄"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
