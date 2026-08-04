import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/server";
import {
  loadSyncedCommissions,
  settleCommissionToPaymentRequest,
} from "@/lib/finance/sync-commissions";

/** GET：同步合同回款與請款狀態，回傳佣金臺賬 */
export async function GET(request: Request) {
  try {
    const { companyId } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");

    try {
      const result = await loadSyncedCommissions(prisma, companyId, month);
      return NextResponse.json(result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to sync commissions";
      if (message === "Invalid month format") {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      throw e;
    }
  } catch (error: unknown) {
    console.error("Failed to fetch commissions:", error);
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/** POST：申請結算 → 建立財務請款單（與請款模組同步） */
export async function POST(request: Request) {
  try {
    const { companyId, user } = await requireAuth();
    const body = await request.json().catch(() => ({}));
    const contractId = typeof body.contractId === "string" ? body.contractId.trim() : "";

    if (!contractId) {
      return NextResponse.json({ error: "缺少 contractId" }, { status: 400 });
    }

    const result = await settleCommissionToPaymentRequest(
      prisma,
      companyId,
      contractId,
      typeof body.requestedBy === "string" ? body.requestedBy : user?.name ?? null,
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    revalidatePath("/sales/finance-commission");
    revalidatePath("/financial/payment-requests");
    revalidatePath("/accounting/ap");
    revalidatePath("/dashboard");

    return NextResponse.json({
      ok: true,
      created: result.created,
      paymentRequestId: result.paymentRequestId,
      status: result.status,
      message: result.created
        ? "已提交財務結算申請，請款單已同步至財務模組"
        : "該合同已有結算請款單，已同步最新狀態",
    });
  } catch (error: unknown) {
    console.error("Failed to settle commission:", error);
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
