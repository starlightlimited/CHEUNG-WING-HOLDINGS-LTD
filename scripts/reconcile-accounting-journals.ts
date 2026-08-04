/**
 * 依「實際業務」整理會計憑證並同步總帳／損益：
 * 1) 移除摘要含舊標記的歷史憑證
 * 2) 草稿憑證一律過帳
 * 3) 請款／預收／應收／應付冪等入帳
 * 4) 7 月中前預收款全部調整為已收並轉收入（2100→4000）
 * 5) 已確認／已完成合同：對接預收轉收入＋未預收餘額認列收入
 *
 * Usage: npm run db:sync:journals
 */
import { PrismaClient } from "@prisma/client";
import { purgeLegacyMarkedJournalEntries } from "@/lib/finance/purge-legacy-journal-entries";
import { syncPaidPaymentRequestToJournal } from "@/lib/finance/sync-payment-request-journal";
import {
  PREPAYMENT_REVENUE_CUTOFF,
  postAllDraftJournals,
  recognizePrepaymentAsRevenue,
  syncContractAndLinkedPrepaymentsToRevenue,
  syncPayablePaymentToJournal,
  syncPayableToJournal,
  syncPrepaymentToJournal,
  syncReceivableReceiptToJournal,
  syncReceivableToJournal,
} from "@/lib/finance/sync-business-journals";

const prisma = new PrismaClient();

type SyncOk = { ok: true; created: boolean; entryId: string };
type SyncFail = { ok: false; reason: string };

async function tally(
  label: string,
  rows: { id: string; companyId: string }[],
  run: (companyId: string, id: string) => Promise<SyncOk | SyncFail>,
  opts?: { ignoreReasons?: string[] },
) {
  let created = 0;
  let skipped = 0;
  let failed = 0;
  const ignore = new Set(opts?.ignoreReasons ?? []);
  for (const row of rows) {
    const r = await run(row.companyId, row.id);
    if (!r.ok) {
      if (ignore.has(r.reason)) skipped += 1;
      else failed += 1;
    } else if (r.created) created += 1;
    else skipped += 1;
  }
  console.log(
    `${label}: created=${created}, skipped=${skipped}, failed=${failed}, total=${rows.length}`,
  );
}

async function main() {
  const purged = await purgeLegacyMarkedJournalEntries(prisma);
  console.log(`已刪除舊標記憑證: ${purged} 筆`);

  const drafts = await postAllDraftJournals(prisma);
  console.log(`草稿過帳: posted=${drafts.posted}, skipped_unbalanced=${drafts.skipped}`);

  const paid = await prisma.paymentRequest.findMany({
    where: { status: "PAID" },
    select: { id: true, companyId: true },
  });
  await tally("請款已支付", paid, (companyId, id) =>
    syncPaidPaymentRequestToJournal(prisma, companyId, id),
  );

  const prepayments = await prisma.prepayment.findMany({
    select: { id: true, companyId: true, receivedAt: true },
  });
  await tally("預收款現金入帳", prepayments, (companyId, id) =>
    syncPrepaymentToJournal(prisma, companyId, id),
  );

  const beforeMidJuly = prepayments.filter((p) => p.receivedAt < PREPAYMENT_REVENUE_CUTOFF);
  await tally("7月中前預收→已收轉收入", beforeMidJuly, (companyId, id) =>
    recognizePrepaymentAsRevenue(prisma, companyId, id),
  );
  console.log(
    `截止日: ${PREPAYMENT_REVENUE_CUTOFF.toISOString()}（本地 2026-07-15），符合 ${beforeMidJuly.length} / ${prepayments.length} 筆`,
  );

  const receivables = await prisma.accountsReceivable.findMany({
    select: { id: true, companyId: true },
  });
  await tally("應收認列", receivables, (companyId, id) =>
    syncReceivableToJournal(prisma, companyId, id),
  );
  await tally(
    "應收回款",
    receivables,
    (companyId, id) => syncReceivableReceiptToJournal(prisma, companyId, id),
    { ignoreReasons: ["zero_amount"] },
  );

  const payables = await prisma.accountsPayable.findMany({
    select: { id: true, companyId: true },
  });
  await tally("應付認列", payables, (companyId, id) =>
    syncPayableToJournal(prisma, companyId, id),
  );
  await tally(
    "應付付款",
    payables,
    (companyId, id) => syncPayablePaymentToJournal(prisma, companyId, id),
    { ignoreReasons: ["zero_amount"] },
  );

  const contracts = await prisma.salesDocument.findMany({
    where: { type: "CONTRACT", status: { in: ["CONFIRMED", "COMPLETED"] } },
    select: { id: true, companyId: true, documentNo: true },
  });
  let contractRevCreated = 0;
  let contractRevSkipped = 0;
  let prepayFromContracts = 0;
  for (const c of contracts) {
    const r = await syncContractAndLinkedPrepaymentsToRevenue(prisma, c.companyId, c.id);
    prepayFromContracts += r.prepayRecognized;
    if (r.contractRev.ok && r.contractRev.created) contractRevCreated += 1;
    else contractRevSkipped += 1;
  }
  console.log(
    `合同收入認列: contracts=${contracts.length}, remaining_rev_created=${contractRevCreated}, skipped=${contractRevSkipped}, linked_prepay_recognized=${prepayFromContracts}`,
  );

  console.log("完成。預收／合同已接到損益表（4000 營業收入）。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
