import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/server";
import { syncContractAndLinkedPrepaymentsToRevenue } from "@/lib/finance/sync-business-journals";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireAuth();

    const document = await prisma.salesDocument.findFirst({
      where: {
        id: (await params).id,
        companyId,
      },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
        parent: true,
        children: true,
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json(document);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireAuth();
    const body = await request.json();

    // Verify ownership
    const existing = await prisma.salesDocument.findFirst({
      where: { id: (await params).id, companyId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const document = await prisma.salesDocument.update({
      where: { id: (await params).id },
      data: {
        customerId: body.customerId,
        date: new Date(body.date),
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        totalAmount: body.totalAmount,
        status: body.status,
        notes: body.notes,
        // For items, we delete existing and recreate them for simplicity
        items: {
          deleteMany: {},
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

    if (
      document.type === "CONTRACT" &&
      (document.status === "CONFIRMED" || document.status === "COMPLETED")
    ) {
      await syncContractAndLinkedPrepaymentsToRevenue(prisma, companyId, document.id);
      revalidatePath("/accounting/journals");
      revalidatePath("/accounting/ledger");
      revalidatePath("/accounting/reports/pl");
      revalidatePath("/accounting/ar");
    }

    return NextResponse.json(document);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireAuth();

    const existing = await prisma.salesDocument.findFirst({
      where: { id: (await params).id, companyId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    await prisma.salesDocument.delete({
      where: { id: (await params).id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
