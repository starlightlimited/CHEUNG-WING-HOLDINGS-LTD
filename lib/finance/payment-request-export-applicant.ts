import { STAFF_ENGLISH_NAMES } from "@/lib/staff-display-names";

/** 付款請求導出專用：依請款單 id 穩定分配申請人顯示名。 */
const EXPORT_APPLICANT_POOL = STAFF_ENGLISH_NAMES;

export function pickPaymentRequestExportApplicant(paymentRequestId: string): string {
  let h = 0;
  for (let i = 0; i < paymentRequestId.length; i++) {
    h = (h * 31 + paymentRequestId.charCodeAt(i)) >>> 0;
  }
  return EXPORT_APPLICANT_POOL[h % EXPORT_APPLICANT_POOL.length];
}
