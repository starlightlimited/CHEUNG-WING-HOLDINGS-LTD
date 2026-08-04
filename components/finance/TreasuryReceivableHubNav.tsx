import Link from "next/link";

export type TreasuryHubActive = "prepay" | "match" | "ar";

function itemClass(isActive: boolean) {
  const base =
    "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors";
  if (isActive) {
    return `${base} border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900`;
  }
  return `${base} border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900`;
}

export function TreasuryReceivableHubNav({
  active,
  customerId,
}: {
  active: TreasuryHubActive;
  customerId?: string | null;
}) {
  const q = customerId ? `?customer=${encodeURIComponent(customerId)}` : "";
  const mq = customerId
    ? `?customerId=${encodeURIComponent(customerId)}`
    : "";

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">客戶資金鏈</span>
        ：預收入帳 → 對接銷售合同 → 應收臺帳；建議同一客戶使用相同「客戶檔案 ID」關聯，必要時用下方連結帶入篩選。
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={customerId ? `/financial/prepayments${q}` : "/financial/prepayments"}
          className={itemClass(active === "prepay")}
        >
          預收款項管理
        </Link>
        <Link
          href={customerId ? `/financial/contract-invoice-prepay${mq}` : "/financial/contract-invoice-prepay"}
          className={itemClass(active === "match")}
        >
          預收款對接
        </Link>
        <Link
          href={customerId ? `/accounting/ar${q}` : "/accounting/ar"}
          className={itemClass(active === "ar")}
        >
          應收臺帳
        </Link>
        {customerId ? (
          <Link
            href="/financial/prepayments"
            className="rounded-md border border-dashed border-zinc-300 px-3 py-1.5 text-sm text-zinc-500 hover:bg-white dark:border-zinc-600 dark:hover:bg-zinc-950"
          >
            清除客戶篩選
          </Link>
        ) : null}
      </div>
    </div>
  );
}
