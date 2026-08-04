/**
 * 從預設公司同步系統主數據到其他公司，並補齊請款→憑證。
 *
 * 用法：
 *   npx tsx scripts/sync-system-master.ts           # 全部公司
 *   npx tsx scripts/sync-system-master.ts ACME      # 僅指定 company code
 */
import { PrismaClient } from "@prisma/client";
import { syncSystemMaster } from "@/lib/system/sync-system-master";
import { DEFAULT_COMPANY_CODE } from "@/lib/company-constants";

const prisma = new PrismaClient();

async function main() {
  const target = process.argv[2];
  const summary = await syncSystemMaster(prisma, {
    targetCompanyCode: target,
  });
  if (!summary.sourceFound) {
    console.error(`未找到代碼為 ${DEFAULT_COMPANY_CODE} 的公司，請先執行 npm run db:seed`);
    process.exit(1);
  }
  console.log("系統主數據同步（自預設公司）：");
  for (const t of summary.targets) {
    console.log(
      `  ${t.code}: chart=${t.chartCopied} rules=${t.rulesCopied} nut=${t.nutSynced}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
