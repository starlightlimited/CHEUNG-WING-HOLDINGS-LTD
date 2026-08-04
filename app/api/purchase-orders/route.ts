import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: 獲取採購單列表
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
    }

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: { companyId },
      include: {
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: [{ date: "desc" }, { poNumber: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(purchaseOrders);
  } catch (error) {
    console.error("Failed to fetch purchase orders:", error);
    return NextResponse.json({ error: "Failed to fetch purchase orders" }, { status: 500 });
  }
}

// POST: 創建採購單
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { companyId, poNumber, vendorName, date, expectedDate, notes, items } = body;

    if (!companyId || !poNumber || !vendorName || !items || !items.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Check if PO number already exists for this company
    const existingPO = await prisma.purchaseOrder.findUnique({
      where: {
        companyId_poNumber: {
          companyId,
          poNumber,
        },
      },
    });

    if (existingPO) {
      return NextResponse.json({ error: "PO number already exists" }, { status: 400 });
    }

    // Calculate total
    const totalAmount = items.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0);

    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        companyId,
        poNumber,
        vendorName,
        date: date ? new Date(date) : new Date(),
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        totalAmount,
        notes,
        items: {
          create: items.map((item: any) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
          }))
        }
      },
      include: {
        items: true
      }
    });

    return NextResponse.json(purchaseOrder);
  } catch (error) {
    console.error("Failed to create purchase order:", error);
    return NextResponse.json({ error: "Failed to create purchase order" }, { status: 500 });
  }
}
