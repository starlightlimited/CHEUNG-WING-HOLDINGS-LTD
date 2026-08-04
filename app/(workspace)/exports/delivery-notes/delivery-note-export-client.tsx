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
import { Download, Search, FileSpreadsheet, Truck } from "lucide-react";

export type DeliveryNoteExportRow = {
  id: string;
  deliveryNoteNo: string;
  relatedOrderNo: string;
  customerName: string;
  deliveryDate: string;
  address: string;
  deliveryStatus: string;
};

function deliveryStatusBadgeClass(status: string) {
  switch (status) {
    case "已送達":
      return "bg-green-100 text-green-800 dark:bg-emerald-900/40 dark:text-emerald-200";
    case "配送中":
      return "bg-blue-100 text-blue-800 dark:bg-sky-900/40 dark:text-sky-200";
    case "待發貨":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
    case "待排期":
      return "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-100";
    case "已取消":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
    default:
      return "bg-zinc-100 text-zinc-800";
  }
}

export function DeliveryNotesExportClient({ initialRows }: { initialRows: DeliveryNoteExportRow[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("2026-03-01");
  const [dateTo, setDateTo] = useState("2026-08-04");
  const [isExporting, setIsExporting] = useState(false);

  const filtered = useMemo(() => {
    const from = dateFrom ? dateFrom : "0000-01-01";
    const to = dateTo ? dateTo : "9999-12-31";
    const q = searchTerm.trim().toLowerCase();
    return initialRows
      .filter((row) => {
        const inRange = row.deliveryDate >= from && row.deliveryDate <= to;
        if (!inRange) return false;
        if (!q) return true;
        return (
          row.customerName.toLowerCase().includes(q) ||
          row.deliveryNoteNo.toLowerCase().includes(q) ||
          row.relatedOrderNo.toLowerCase().includes(q) ||
          row.address.toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          b.deliveryDate.localeCompare(a.deliveryDate) ||
          b.deliveryNoteNo.localeCompare(a.deliveryNoteNo),
      );
  }, [initialRows, searchTerm, dateFrom, dateTo]);

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      alert(
        `將匯出 ${filtered.length} 筆送貨單（與預收發票主檔對應）至 Excel 範本。\n實際檔案下載可後續對接後端導出 API。`,
      );
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">送貨單導出</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            列表由預收發票主檔與客戶送貨地址衍生（單號規則：PI-… → DN-…／SO-…）；預設 2026 年 3–8
            月與種子數據一致。
          </p>
        </div>
        <Button onClick={handleExport} disabled={isExporting || filtered.length === 0} className="gap-2 shrink-0">
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
          <CardTitle>送貨單列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索送貨單號、訂單號、客戶或地址…"
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
                  <TableHead>送貨單編號</TableHead>
                  <TableHead>關聯訂單號</TableHead>
                  <TableHead>客戶名稱</TableHead>
                  <TableHead>送貨日期</TableHead>
                  <TableHead>送貨地址</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead className="text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length > 0 ? (
                  filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 shrink-0 text-muted-foreground" />
                          {row.deliveryNoteNo}
                        </div>
                      </TableCell>
                      <TableCell>{row.relatedOrderNo}</TableCell>
                      <TableCell>{row.customerName}</TableCell>
                      <TableCell>{row.deliveryDate}</TableCell>
                      <TableCell className="max-w-[220px] truncate" title={row.address}>
                        {row.address}
                      </TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${deliveryStatusBadgeClass(row.deliveryStatus)}`}>
                          {row.deliveryStatus}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="sm" className="gap-1" asChild>
                          <Link href={`/sales/proforma-invoices/${row.id}`}>
                            <Download className="h-4 w-4" />
                            查看／PDF
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      {initialRows.length === 0
                        ? "暫無送貨單來源單據；請執行 npx prisma db seed 載入種子資料。"
                        : "沒有符合篩選條件的送貨單記錄"}
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
