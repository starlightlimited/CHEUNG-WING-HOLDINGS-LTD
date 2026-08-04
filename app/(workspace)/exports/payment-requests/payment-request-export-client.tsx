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
import { Download, Search, FileSpreadsheet, CreditCard } from "lucide-react";
import { exportPaymentRequestIdsExcel } from "@/lib/server/exports-catalog";

export type PaymentRequestExportRow = {
  id: string;
  title: string;
  category: string | null;
  department: string | null;
  applicant: string;
  date: string;
  amount: string;
  status: string;
};

function statusBadgeClass(status: string) {
  switch (status) {
    case "DRAFT":
      return "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200";
    case "SUBMITTED":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
    case "APPROVED":
      return "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200";
    case "REJECTED":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
    case "PAID":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
    default:
      return "bg-zinc-100 text-zinc-800";
  }
}

function statusLabelZh(status: string) {
  switch (status) {
    case "DRAFT":
      return "草稿";
    case "SUBMITTED":
      return "待審批";
    case "APPROVED":
      return "已通過";
    case "REJECTED":
      return "已駁回";
    case "PAID":
      return "已支付";
    default:
      return status;
  }
}

function downloadBase64Xlsx(base64: string, filename: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function PaymentRequestExportClient({
  initialRows,
}: {
  initialRows: PaymentRequestExportRow[];
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const filteredRows = useMemo(() => {
    const from = dateFrom || "0000-01-01";
    const to = dateTo || "9999-12-31";
    const q = searchTerm.trim().toLowerCase();
    return initialRows.filter((row) => {
      const inRange = row.date >= from && row.date <= to;
      if (!inRange) return false;
      if (!q) return true;
      return (
        row.title.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q) ||
        row.applicant.toLowerCase().includes(q) ||
        (row.department ?? "").toLowerCase().includes(q) ||
        (row.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [initialRows, searchTerm, dateFrom, dateTo]);

  const handleExport = async () => {
    if (filteredRows.length === 0) return;
    setIsExporting(true);
    try {
      const result = await exportPaymentRequestIdsExcel(filteredRows.map((r) => r.id));
      if (!result.ok) {
        alert(result.error);
        return;
      }
      downloadBase64Xlsx(result.base64, result.filename);
    } catch (e) {
      alert(e instanceof Error ? e.message : "導出失敗");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">付款請求導出</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            資料來自「請款單管理」主檔；可依日期與關鍵字篩選後匯出為 Excel（需具備導出權限）。
          </p>
        </div>
        <Button
          onClick={() => void handleExport()}
          disabled={isExporting || filteredRows.length === 0}
          className="shrink-0 gap-2"
        >
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
          <CardTitle>請款單列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索標題、部門、申請人、類別或內部 ID…"
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                className="w-[160px]"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                title="申請日期起"
              />
              <span className="text-sm text-muted-foreground">至</span>
              <Input
                type="date"
                className="w-[160px]"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                title="申請日期止"
              />
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>內部 ID</TableHead>
                  <TableHead>標題</TableHead>
                  <TableHead>部門</TableHead>
                  <TableHead>費用類別</TableHead>
                  <TableHead>申請人</TableHead>
                  <TableHead>申請日期</TableHead>
                  <TableHead className="text-right">金額 (HKD)</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead className="text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length > 0 ? (
                  filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[120px] truncate font-medium" title={row.id}>
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{row.id}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate" title={row.title}>
                        {row.title}
                      </TableCell>
                      <TableCell>{row.department ?? "—"}</TableCell>
                      <TableCell>{row.category ?? "—"}</TableCell>
                      <TableCell>{row.applicant}</TableCell>
                      <TableCell>{row.date}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(row.amount).toLocaleString("zh-HK", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(row.status)}`}
                        >
                          {statusLabelZh(row.status)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="sm" className="gap-1" asChild>
                          <Link href="/financial/payment-requests">
                            <Download className="h-4 w-4" />
                            前往請款管理
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      {initialRows.length === 0
                        ? "暫無請款記錄；可在「請款單管理」新增或執行 prisma seed 載入種子資料。"
                        : "沒有符合篩選條件的記錄"}
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
