import type { PrismaClient } from "@prisma/client";

/** 舊種子憑證摘要慣用標記（全公司刪除，不動請款來源憑證）。 */
const LEGACY_MARKER = "（演示）";

/**
 * 刪除摘要中含舊標記的憑證及其分錄（級聯）。
 * 保留對歷史資料的清理能力；新種子不再寫入此標記。
 */
export async function purgeLegacyMarkedJournalEntries(db: PrismaClient): Promise<number> {
  const result = await db.journalEntry.deleteMany({
    where: {
      description: { contains: LEGACY_MARKER },
    },
  });
  return result.count;
}
