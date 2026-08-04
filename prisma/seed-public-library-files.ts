import { copyFile, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { fileDocumentDiskPath } from "../lib/files/storage";

const PUBLIC_LIB_CAT_DESC = "__SEED_PUBLIC_LIBRARY_CATEGORY__";
const LEGACY_NAME_MARKER = "（公共庫種子）";

type PublicCatKey = "policy" | "warehouse" | "product";

const CATEGORY_DEFS: { key: PublicCatKey; name: string }[] = [
  { key: "policy", name: "制度與合規" },
  { key: "warehouse", name: "倉儲與冷鏈" },
  { key: "product", name: "產品與銷售附件" },
];

/** 先佔好三個頂層分類 id，避免「先刪公共檔再 create 分類」在 @@unique(公司,父級,名稱) 衝突時整段失敗、公共庫被清空。 */
async function ensurePublicLibrarySeedCategoryIds(
  prisma: PrismaClient,
  companyId: string,
): Promise<Record<PublicCatKey, string>> {
  const catIdByKey = {} as Record<PublicCatKey, string>;
  const defNames = CATEGORY_DEFS.map((c) => c.name);

  for (const c of CATEGORY_DEFS) {
    let hit = await prisma.fileCategory.findFirst({
      where: {
        companyId,
        parentId: null,
        name: c.name,
        description: PUBLIC_LIB_CAT_DESC,
      },
      select: { id: true },
    });
    if (!hit) {
      hit = await prisma.fileCategory.findFirst({
        where: { companyId, parentId: null, name: c.name },
        select: { id: true },
      });
    }
    const row =
      hit != null
        ? await prisma.fileCategory.update({
            where: { id: hit.id },
            data: {
              description: PUBLIC_LIB_CAT_DESC,
              isPublic: true,
              ownerId: null,
            },
            select: { id: true },
          })
        : await prisma.fileCategory.create({
            data: {
              companyId,
              name: c.name,
              description: PUBLIC_LIB_CAT_DESC,
              parentId: null,
              ownerId: null,
              isPublic: true,
            },
            select: { id: true },
          });
    catIdByKey[c.key] = row.id;
  }

  await prisma.fileCategory.deleteMany({
    where: {
      companyId,
      description: PUBLIC_LIB_CAT_DESC,
      parentId: null,
      name: { notIn: defNames },
    },
  });

  return catIdByKey;
}

export async function seedPublicLibraryDocuments(
  prisma: PrismaClient,
  companyId: string,
  ownerIds: string[],
): Promise<void> {
  if (ownerIds.length === 0) return;

  const catIdByKey = {} as Record<PublicCatKey, string>;

  type Row = {
    at: string;
    key: PublicCatKey;
    baseName: string;
    mime: string;
    body: Buffer;
  };

  const rows: Row[] = [
    {
      at: "2026-03-05T09:10:00+08:00",
      key: "warehouse",
      baseName: "WH-COLD_開門前檢查表_20260305.txt",
      mime: "text/plain; charset=utf-8",
      body: Buffer.from(
          "冷鏈倉（WH-COLD）開門前檢查 — 2026/03/05\n" +
            "溫度儀表：正常；門封：完好；地面無積水。\n" +
            "異常處置：若溫度＞6°C，立即通知當值主管並暫停入庫。\n",
          "utf-8",
        ),
    },
    {
      at: "2026-03-12T14:25:00+08:00",
      key: "policy",
      baseName: "主倉蟲害風險自查清單_202603.txt",
      mime: "text/plain; charset=utf-8",
      body: Buffer.from(
        [
          "祥榮控股 · 主倉（WH-MAIN）蟲害風險自查",
          "日期：2026-03-12  填寫：倉儲當班",
          "檢查項：門封、捕鼠器、乾貨垛距離牆≥15cm、廢棄包材日清。",
          "備註：本週無異常；發現包材潮濕 1 處已更換。",
        ].join("\n"),
        "utf-8",
      ),
    },
    {
      at: "2026-03-18T11:40:00+08:00",
      key: "product",
      baseName: "報價QT-202603-001_碧根果規格備註.txt",
      mime: "text/plain; charset=utf-8",
      body: Buffer.from(
          "附件說明：PROD-001 碧根果，報價單 QT-202603-001 客戶「宏遠食品」版本。\n" +
            "交期：現貨為主；若需分裝請預留 3 個工作日。\n" +
            "結算：月結 30 天（以合同為準）。\n",
          "utf-8",
        ),
    },
    {
      at: "2026-03-24T16:05:00+08:00",
      key: "warehouse",
      baseName: "入庫關聯_SEED-PO-202603-006_開心果到貨備忘.txt",
      mime: "text/plain; charset=utf-8",
      body: Buffer.from(
          "採購參考：SEED-PO-202603-006（開心果 PROD-002）\n" +
            "到貨窗口：2026-03-06 08:20 冷鏈入庫；請品質課留存溫度打印條。\n" +
            "與庫存流水 referenceType=PO_RECEIVE 一致。\n",
          "utf-8",
        ),
    },
    {
      at: "2026-04-02T10:15:00+08:00",
      key: "policy",
      baseName: "行政課_辦公軟體續費對賬截圖索引_202604.csv",
      mime: "text/csv; charset=utf-8",
      body: Buffer.from(
          "月份,項目,金額HKD,對應請款備註\n" +
            "2026-04,協作套件續費,9600,辦公軟體年度續費（請款種子）\n",
          "utf-8",
        ),
    },
    {
      at: "2026-04-09T13:50:00+08:00",
      key: "warehouse",
      baseName: "帶殼夏威夷果_MAC-B-INSHELL_到櫃拍照留存規範.txt",
      mime: "text/plain; charset=utf-8",
      body: Buffer.from(
          "大宗到櫃拍照留存（MAC-B-INSHELL-KG）\n" +
            "必拍：車牌正面、貨櫃號、封條號、卸貨全景各 1 張。\n" +
            "命名規則：YYYYMMDD_櫃號_序號.jpg，當日上傳至公共庫備份。\n",
          "utf-8",
        ),
    },
    {
      at: "2026-04-17T09:00:00+08:00",
      key: "product",
      baseName: "PROD-003核桃仁_標籤過敏原字句_202604.txt",
      mime: "text/plain; charset=utf-8",
      body: Buffer.from(
          "過敏原提示（草擬）：含有堅果（核桃）。生產線可能接觸其他堅果。\n" +
            "請法務／品質課確認後再定稿印刷。\n",
          "utf-8",
        ),
    },
    {
      at: "2026-04-25T15:30:00+08:00",
      key: "policy",
      baseName: "品質與合規_冷庫溫度記錄服務對賬說明_202604.txt",
      mime: "text/plain; charset=utf-8",
      body: Buffer.from(
          "供應商服務：冷庫溫度記錄（季度訂閱）\n" +
            "內部請款參考標題含「請款種子」；實際付款以審批單為準。\n",
          "utf-8",
        ),
    },
    {
      at: "2026-05-06T08:35:00+08:00",
      key: "warehouse",
      baseName: "WH-COLD_溫度異常處置流程_202605.txt",
      mime: "text/plain; charset=utf-8",
      body: Buffer.from(
          "冷鏈溫度異常處置（簡版）\n" +
            "1) 隔離可疑批次並貼「待檢」標；2) 通報品質課 + 倉儲主管；\n" +
            "3) 補登溫度記錄與事件說明；4) 客戶通知由銷售接口人執行。\n",
          "utf-8",
        ),
    },
    {
      at: "2026-05-14T12:10:00+08:00",
      key: "product",
      baseName: "杏仁PROD-004_夏季促銷陳列建議_202605.txt",
      mime: "text/plain; charset=utf-8",
      body: Buffer.from(
          "渠道：華南商超試點；建議與開心果 PROD-002 組合堆頭。\n" +
            "庫存提示：留意 2026-05 出庫高峰與補貨節奏（見庫存流水 SO_SHIP）。\n",
          "utf-8",
        ),
    },
    {
      at: "2026-05-21T10:45:00+08:00",
      key: "policy",
      baseName: "財務課_進項稅抵扣檢核表_202605.csv",
      mime: "text/csv; charset=utf-8",
      body: Buffer.from(
          "發票類型,稅率,備註\n" +
            "進口增值税專用,0.13,大宗堅果到櫃單據齊套後抵扣\n" +
            "服務費普票,—,僅作費用不抵扣\n",
          "utf-8",
        ),
    },
    {
      at: "2026-05-28T17:20:00+08:00",
      key: "warehouse",
      baseName: "物流課_同城與快遞月結對賬索引_202605.txt",
      mime: "text/plain; charset=utf-8",
      body: Buffer.from(
          "月結運費：請款「快遞與同城送貨（請款種子）」HKD 1,280。\n" +
            "附件：承運商月結單 PDF 存於財務共享夾（此處僅索引）。\n",
          "utf-8",
        ),
    },
    {
      at: "2026-06-03T09:55:00+08:00",
      key: "policy",
      baseName: "ISO內審_倉儲條款對照表_202606.csv",
      mime: "text/csv; charset=utf-8",
      body: Buffer.from(
          "條款,現場狀態,證據編號\n" +
            "7.1.3 倉儲環境,合格,WH-202606-照片批次A\n" +
            "8.5.1 生產服務放行,待補,補登 SEED-PO-202606-018 卸貨記錄\n",
          "utf-8",
        ),
    },
    {
      at: "2026-06-11T14:05:00+08:00",
      key: "warehouse",
      baseName: "卸貨窗口申請_SEED-PO-202606-018_備忘.txt",
      mime: "text/plain; charset=utf-8",
      body: Buffer.from(
          "大宗到港：SEED-PO-202606-018（帶殼夏威夷果 MAC-B-INSHELL-KG）\n" +
            "建議卸貨窗口：06:00–08:00；需提前 24h 向港區預約。\n" +
            "與 2026-06-18 入庫流水 referenceId 一致。\n",
          "utf-8",
        ),
    },
    {
      at: "2026-06-19T11:30:00+08:00",
      key: "product",
      baseName: "客戶跟進_港島堅果行_拜訪紀要_202606.txt",
      mime: "text/plain; charset=utf-8",
      body: Buffer.from(
          "客戶：港島堅果行（客戶群組之一）\n" +
            "議題：Q2 價格、冷鏈配送、帶殼夏威夷果大宗交期。\n" +
            "下一步：發送更新報價與合規證照掃描件。\n",
          "utf-8",
        ),
    },
    {
      at: "2026-06-26T16:40:00+08:00",
      key: "warehouse",
      baseName: "半年度盤點計劃_Q2_主倉與冷鏈_202606.txt",
      mime: "text/plain; charset=utf-8",
      body: Buffer.from(
          "2026 Q2 盤點計劃（WH-MAIN / WH-COLD）\n" +
            "建議窗口：2026-06-28 夜間停發貨時段；抽盤 SKU 含 PROD-001～004 及 MAC-B-INSHELL-KG。\n" +
            "盤點表：由倉儲課列印，財務監盤。\n",
          "utf-8",
        ),
    },
    {
      at: "2026-03-08T10:20:00+08:00",
      key: "product",
      baseName: "PROD-002開心果_夏季冷鏈運輸注意.txt",
      mime: "text/plain; charset=utf-8",
      body: Buffer.from(
          "運輸：全程冷鏈 0–4°C；車廂預冷 ≥30 分鐘。\n" +
            "交接：收貨方簽字 + 溫度記錄儀編號回填至 CRM 跟進。\n",
          "utf-8",
        ),
    },
    {
      at: "2026-04-14T08:50:00+08:00",
      key: "warehouse",
      baseName: "庫存流水索引_MAC-B-INSHELL_202604出庫摘要.csv",
      mime: "text/csv; charset=utf-8",
      body: Buffer.from(
          "日期,referenceId,數量KG,說明\n" +
            "2026-04-02,SEED-SO-202604-018,3200,出庫\n" +
            "2026-04-20,SEED-SO-202604-422,4100,出庫\n",
          "utf-8",
        ),
    },
    {
      at: "2026-05-19T13:15:00+08:00",
      key: "policy",
      baseName: "市場部_展會交通住宿預算備忘_202605.txt",
      mime: "text/plain; charset=utf-8",
      body: Buffer.from(
          "請款草稿：展會交通與住宿（請款種子）HKD 5,600。\n" +
            "提醒：發票抬頭須與「祥榮控股有限公司」一致。\n",
          "utf-8",
        ),
    },
    {
      at: "2026-06-08T09:25:00+08:00",
      key: "product",
      baseName: "帶殼夏威夷果_發票202500062_單價備註摘錄.txt",
      mime: "text/plain; charset=utf-8",
      body: Buffer.from(
          "來源敘述（產品主數據）：單價 HKD 56.00/KGS，數量 36,340 KGS。\n" +
            "僅供內部培訓與對外報價口徑對齊，不作為法律承諾。\n",
          "utf-8",
        ),
    },
  ];

  const seedFileNames = rows.map((r) => r.baseName);

  Object.assign(catIdByKey, await ensurePublicLibrarySeedCategoryIds(prisma, companyId));

  await prisma.fileDocument.deleteMany({
    where: {
      companyId,
      isPublic: true,
      OR: [{ name: { in: seedFileNames } }, { name: { contains: LEGACY_NAME_MARKER } }],
    },
  });

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const id = randomUUID();
    const diskPath = fileDocumentDiskPath(companyId, id);
    await mkdir(path.dirname(diskPath), { recursive: true });
    await writeFile(diskPath, r.body);

    const ownerId = ownerIds[i % ownerIds.length]!;

    await prisma.fileDocument.create({
      data: {
        id,
        companyId,
        categoryId: catIdByKey[r.key],
        name: r.baseName,
        size: r.body.length,
        url: `${companyId}/${id}`,
        mimeType: r.mime,
        ownerId,
        isPublic: true,
        createdAt: new Date(r.at),
        updatedAt: new Date(r.at),
      },
    });
  }
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

/**
 * 將當前公司一部分公共檔隨機複製到指定用戶的個人網盤（帶 copiedFromPublicFileId，公共列表可顯示「已在個人網盤」）。
 * 每次執行會先刪除該用戶此前所有「從公共庫複製」的個人檔（含磁碟），再重新隨機抽取。
 */
export async function seedPersonalCopiesFromPublicLibrary(
  prisma: PrismaClient,
  companyId: string,
  userId: string,
): Promise<void> {
  const prev = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "FileDocument"
    WHERE "companyId" = ${companyId}
      AND "ownerId" = ${userId}
      AND "copiedFromPublicFileId" IS NOT NULL
  `;
  for (const p of prev) {
    try {
      await unlink(fileDocumentDiskPath(companyId, p.id));
    } catch {
      /* 檔案可能已不存在 */
    }
  }
  await prisma.$executeRaw`
    DELETE FROM "FileDocument"
    WHERE "companyId" = ${companyId}
      AND "ownerId" = ${userId}
      AND "copiedFromPublicFileId" IS NOT NULL
  `;

  const publicRows = await prisma.fileDocument.findMany({
    where: { companyId, isPublic: true },
    select: { id: true, name: true, size: true, mimeType: true },
  });
  if (publicRows.length === 0) return;

  shuffleInPlace(publicRows);
  const ratio = 0.38;
  const take = Math.min(
    publicRows.length,
    Math.max(4, Math.round(publicRows.length * ratio)),
  );
  const pick = publicRows.slice(0, take);

  for (const src of pick) {
    const newId = randomUUID();
    const srcPath = fileDocumentDiskPath(companyId, src.id);
    const destPath = fileDocumentDiskPath(companyId, newId);
    await mkdir(path.dirname(destPath), { recursive: true });
    try {
      await copyFile(srcPath, destPath);
    } catch {
      continue;
    }
    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "FileDocument" (
          "id", "companyId", "categoryId", "name", "size", "url", "mimeType",
          "ownerId", "isPublic", "copiedFromPublicFileId", "createdAt", "updatedAt"
        ) VALUES (
          ${newId},
          ${companyId},
          NULL,
          ${src.name},
          ${src.size},
          ${`${companyId}/${newId}`},
          ${src.mimeType},
          ${userId},
          false,
          ${src.id},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `,
    );
  }
}
