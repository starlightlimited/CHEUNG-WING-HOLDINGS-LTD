"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, FileText, ArrowRight, FileDown, Edit, Trash2 } from "lucide-react";

export default function QuotesPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales-documents?type=QUOTATION`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(
          [...data].sort(
            (a, b) =>
              new Date(b.date).getTime() - new Date(a.date).getTime() ||
              String(b.documentNo).localeCompare(String(a.documentNo)),
          ),
        );
      }
    } catch (error) {
      console.error("獲取報價單失敗:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleConvert = async (id: string) => {
    try {
      const res = await fetch(`/api/sales-documents/${id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "CONTRACT" }),
      });
      if (res.ok) {
        alert("已成功轉換為合同！");
        fetchDocuments();
        router.push("/sales/contracts");
      } else {
        const err = await res.json();
        alert(`轉換失敗: ${err.error}`);
      }
    } catch (error) {
      alert("轉換失敗");
    }
  };

  const handleExportPDF = async (id: string) => {
    try {
      const res = await fetch(`/api/sales-documents/${id}`);
      if (res.ok) {
        const data = await res.json();
        const { exportDocumentToPDF } = await import("@/lib/utils/pdf-export");
        await exportDocumentToPDF(data, "Quotation");
      }
    } catch (error) {
      console.error("導出 PDF 失敗:", error);
      alert("導出失敗");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定要刪除此報價單嗎？此操作不可恢復。")) return;
    
    try {
      const res = await fetch(`/api/sales-documents/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        alert("刪除成功");
        fetchDocuments();
      } else {
        const err = await res.json();
        alert(`刪除失敗: ${err.error}`);
      }
    } catch (error) {
      alert("刪除失敗");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">草稿</span>;
      case "PENDING":
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">待處理</span>;
      case "CONFIRMED":
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">已確認</span>;
      case "CANCELLED":
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">已取消</span>;
      case "COMPLETED":
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">已完成</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">報價單 (見積) 管理</h1>
          <p className="text-sm text-zinc-500 mt-1">管理客戶報價單，支持一鍵轉為銷售合同。</p>
        </div>
        <Button onClick={() => router.push("/sales/quotes/new")}>
          <Plus className="mr-2 h-4 w-4" />
          新增報價單
        </Button>
      </div>

      <div className="bg-white dark:bg-zinc-900 shadow-sm rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>單號</TableHead>
              <TableHead>客戶</TableHead>
              <TableHead>日期</TableHead>
              <TableHead>總金額</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-zinc-500">加載中...</TableCell>
              </TableRow>
            ) : documents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-zinc-500">暫無報價單數據</TableCell>
              </TableRow>
            ) : (
              documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">{doc.documentNo}</TableCell>
                  <TableCell>{doc.customer?.name || "-"}</TableCell>
                  <TableCell>{new Date(doc.date).toLocaleDateString()}</TableCell>
                  <TableCell>¥{Number(doc.totalAmount).toLocaleString()}</TableCell>
                  <TableCell>{getStatusBadge(doc.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {!doc.children?.some((c: { type: string }) => c.type === "CONTRACT") &&
                        doc.status !== "CONFIRMED" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleConvert(doc.id)}
                          className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                        >
                          <ArrowRight className="mr-1 h-3 w-3" />
                          轉合同
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportPDF(doc.id)}
                      >
                        <FileDown className="mr-1 h-3 w-3" />
                        導出 PDF
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/sales/quotes/${doc.id}`)}
                      >
                        <FileText className="mr-1 h-3 w-3" />
                        詳情
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/sales/quotes/${doc.id}/edit`)}
                      >
                        <Edit className="mr-1 h-3 w-3" />
                        編輯
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(doc.id)}
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        刪除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
