"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function ProformaInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);

  const router = useRouter();
  const [document, setDocument] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDocument = async () => {
      try {
        const res = await fetch(`/api/sales-documents/${resolvedParams.id}`);
        if (res.ok) {
          const data = await res.json();
          setDocument(data);
        }
      } catch (error) {
        console.error("獲取預收發票失敗:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDocument();
  }, [resolvedParams.id]);

  const handleExportPDF = async () => {
    try {
      const { exportDocumentToPDF } = await import("@/lib/utils/pdf-export");
      await exportDocumentToPDF(document, "Proforma Invoice");
    } catch (error) {
      console.error("導出 PDF 失敗:", error);
      alert("導出失敗");
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-zinc-500">加載中...</div>;
  }

  if (!document) {
    return <div className="p-8 text-center text-red-500">未找到預收發票</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">預收發票詳情</h1>
            <p className="text-sm text-zinc-500 mt-1">{document.documentNo}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportPDF}>
            <FileDown className="mr-2 h-4 w-4" />
            導出 PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-sm text-zinc-500">單號</div>
              <div className="col-span-2 font-medium">{document.documentNo}</div>
              
              <div className="text-sm text-zinc-500">客戶</div>
              <div className="col-span-2">{document.customer?.name || "-"}</div>
              
              <div className="text-sm text-zinc-500">日期</div>
              <div className="col-span-2">{new Date(document.date).toLocaleDateString()}</div>
              
              <div className="text-sm text-zinc-500">有效期限</div>
              <div className="col-span-2">{document.dueDate ? new Date(document.dueDate).toLocaleDateString() : "-"}</div>
              
              <div className="text-sm text-zinc-500">狀態</div>
              <div className="col-span-2">
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                  {document.status}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>備註信息</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{document.notes || "無備註"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>產品明細</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>產品名稱</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">數量</TableHead>
                <TableHead className="text-right">單價</TableHead>
                <TableHead className="text-right">折扣(%)</TableHead>
                <TableHead className="text-right">稅率(%)</TableHead>
                <TableHead className="text-right">小計</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {document.items?.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.product?.name || "未知產品"}</TableCell>
                  <TableCell>{item.product?.sku || "-"}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">¥{Number(item.unitPrice).toLocaleString()}</TableCell>
                  <TableCell className="text-right">{Number(item.discount)}%</TableCell>
                  <TableCell className="text-right">{Number(item.taxRate)}%</TableCell>
                  <TableCell className="text-right font-medium">¥{Number(item.total).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          <div className="flex justify-end pt-6 mt-6 border-t">
            <div className="text-right">
              <p className="text-sm text-zinc-500 mb-1">總計金額</p>
              <p className="text-3xl font-bold text-zinc-900 dark:text-white">
                ¥{Number(document.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
