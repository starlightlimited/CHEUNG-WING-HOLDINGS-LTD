"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calculator, DollarSign, FileText, RefreshCw, Search } from "lucide-react";

type CommissionItem = {
  id: string;
  documentNo: string;
  customerName: string;
  date: string;
  totalAmount: number;
  prepaidAmount: number;
  commissionRate: number;
  commissionAmount: number;
  status: string;
  salesperson: string;
  paymentRequestId: string | null;
  canSettle: boolean;
};

function statusClass(status: string): string {
  switch (status) {
    case "已結算":
      return "bg-green-100 text-green-800";
    case "已核准":
      return "bg-blue-100 text-blue-800";
    case "已申請":
      return "bg-indigo-100 text-indigo-800";
    case "已拒絕":
      return "bg-red-100 text-red-800";
    case "待結算":
      return "bg-yellow-100 text-yellow-800";
    default:
      return "bg-zinc-100 text-zinc-700";
  }
}

export default function FinanceCommissionPage() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [commissions, setCommissions] = useState<CommissionItem[]>([]);
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalCommission: 0,
    contractCount: 0,
    pendingSettleCount: 0,
    settledCount: 0,
  });
  const [month, setMonth] = useState(() => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value ?? "2026";
    const m = parts.find((p) => p.type === "month")?.value ?? "08";
    return `${y}-${m}`;
  });

  const fetchCommissions = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/commissions?month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setCommissions(data.data);
        setSummary(data.summary);
        if (opts?.silent) {
          setMessage("已同步合同回款與財務請款狀態");
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage(err.error || "同步失敗");
      }
    } catch (error) {
      console.error("獲取佣金數據失敗:", error);
      setMessage("同步失敗，請稍後再試");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [month]);

  useEffect(() => {
    fetchCommissions();
  }, [fetchCommissions]);

  const handleSettle = async (id: string) => {
    setSettlingId(id);
    setMessage(null);
    try {
      const res = await fetch("/api/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || "申請結算失敗");
        return;
      }
      setMessage(data.message || "已提交財務結算申請");
      await fetchCommissions({ silent: true });
    } catch (error) {
      console.error("申請結算失敗:", error);
      setMessage("申請結算失敗，請稍後再試");
    } finally {
      setSettlingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">財務與佣金整合</h1>
          <p className="text-sm text-zinc-500 mt-1">
            依銷售合同與對接回款計算佣金，申請結算後同步建立財務請款單。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-40"
          />
          <Button variant="outline" size="icon" onClick={() => fetchCommissions()} disabled={syncing} title="查詢">
            <Search className="h-4 w-4" />
          </Button>
          <Button
            variant="default"
            onClick={() => fetchCommissions({ silent: true })}
            disabled={syncing}
            className="gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            同步
          </Button>
        </div>
      </div>

      {message && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
          {message}
          {message.includes("請款") && (
            <>
              {" "}
              <Link href="/financial/payment-requests" className="text-blue-600 hover:underline">
                前往請款管理
              </Link>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">本月銷售總額 (已確認／已完成)</CardTitle>
            <DollarSign className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ¥{summary.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              基於 {summary.contractCount} 份已確認／已完成合同
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">預計佣金總額</CardTitle>
            <Calculator className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ¥{summary.totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              平均佣金率 5.0% · 已進財務 {summary.settledCount} 筆
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">待結算合同數</CardTitle>
            <FileText className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.pendingSettleCount}</div>
            <p className="text-xs text-zinc-500 mt-1">
              已有回款、待提交財務審核
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>佣金明細臺賬</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>合同單號</TableHead>
                <TableHead>客戶名稱</TableHead>
                <TableHead>銷售人員</TableHead>
                <TableHead>完成日期</TableHead>
                <TableHead className="text-right">合同金額</TableHead>
                <TableHead className="text-right">已回款</TableHead>
                <TableHead className="text-right">佣金率</TableHead>
                <TableHead className="text-right">應發佣金</TableHead>
                <TableHead className="text-center">狀態</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-zinc-500">
                    加載中...
                  </TableCell>
                </TableRow>
              ) : commissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-zinc-500">
                    該月暫無已確認／已完成的銷售合同
                  </TableCell>
                </TableRow>
              ) : (
                commissions.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.documentNo}</TableCell>
                    <TableCell>{item.customerName}</TableCell>
                    <TableCell>{item.salesperson}</TableCell>
                    <TableCell>{new Date(item.date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      ¥{item.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      ¥{(item.prepaidAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">{item.commissionRate}%</TableCell>
                    <TableCell className="text-right font-medium text-green-600">
                      ¥{item.commissionAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusClass(item.status)}`}>
                        {item.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {item.canSettle ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={settlingId === item.id}
                          onClick={() => handleSettle(item.id)}
                        >
                          {settlingId === item.id ? "提交中…" : "申請結算"}
                        </Button>
                      ) : item.paymentRequestId ? (
                        <Link
                          href="/financial/payment-requests"
                          className="text-sm text-blue-600 hover:underline"
                        >
                          查看請款
                        </Link>
                      ) : (
                        <span className="text-xs text-zinc-400">待回款</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
