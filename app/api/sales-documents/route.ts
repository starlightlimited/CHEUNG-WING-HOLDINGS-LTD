import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/server";

export async function GET(request: Request) {
  try {
    const { companyId } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as any;

    const documents = await prisma.salesDocument.findMany({
      where: {
        companyId,
        type: type || undefined,
      },
      include: {
        customer: true,
        _count: {
          select: { items: true },
        },
        children: {
          where: { status: { not: "CANCELLED" } },
          select: { id: true, type: true, documentNo: true, status: true },
        },
      },
      orderBy: [{ date: "desc" }, { documentNo: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(documents);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { companyId } = await requireAuth();
    const body = await request.json();

    // Generate Document Number based on type
    const prefix = body.type === "QUOTATION" ? "QT-" : body.type === "CONTRACT" ? "CT-" : "PI-";
    const documentNo = `${prefix}${Date.now()}`;

    const document = await prisma.salesDocument.create({
      data: {
        companyId,
        type: body.type,
        documentNo,
        customerId: body.customerId,
        date: new Date(body.date),
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        totalAmount: body.totalAmount,
        status: body.status || "DRAFT",
        notes: body.notes,
        parentId: body.parentId || null,
        items: {
          create: body.items.map((item: any) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount || 0,
            taxRate: item.taxRate || 0,
            total: item.total,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    return NextResponse.json(document);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
