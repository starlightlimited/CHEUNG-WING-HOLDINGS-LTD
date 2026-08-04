import type { Prisma, PrismaClient } from "@prisma/client";

function parseAttributesJson(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const o = JSON.parse(raw) as unknown;
      return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) };
  return {};
}

/**
 * 列表同步時更新目錄：以資料庫既有 attributes 為準，**不再**用目錄覆寫
 * category / subCategory / packaging / customAttributes（否則使用者刪改會在下次開列表還原）。
 * - specs：與目錄深層合併（便於統一補「計價幣別」等欄位）
 * - bom：目錄若含 `bom` 陣列（可為空）則以目錄為準，便於統一清空配件清單
 * - 僅當某頂層欄位在 DB 完全缺失時，才用目錄補預設（新曾對齊 SKU 的列）
 */
export function mergeNutCatalogAttributes(
  existingRaw: unknown,
  catalogAttrs: Prisma.InputJsonValue
): Prisma.InputJsonValue {
  const ex = parseAttributesJson(existingRaw);
  const cat = parseAttributesJson(catalogAttrs);

  const exSpecs = parseAttributesJson(ex.specs);
  const catSpecs = parseAttributesJson(cat.specs);
  const exCustom = parseAttributesJson(ex.customAttributes);

  const out: Record<string, unknown> = { ...ex };

  out.specs = { ...exSpecs, ...catSpecs };

  const exBom = ex.bom;
  if (Array.isArray(cat.bom)) {
    out.bom = cat.bom;
  } else if (Array.isArray(exBom) && exBom.length > 0) {
    out.bom = exBom;
  }

  const exTiers = ex.pricingTiers;
  if (Array.isArray(exTiers) && exTiers.length > 0) {
    out.pricingTiers = exTiers;
  } else if (Array.isArray(cat.pricingTiers)) {
    out.pricingTiers = cat.pricingTiers;
  }

  for (const key of ["category", "subCategory", "packaging"] as const) {
    const v = out[key];
    const missing = v === undefined || v === null || (typeof v === "string" && v.trim() === "");
    if (missing && cat[key] != null) {
      out[key] = cat[key];
    }
  }

  if (Object.keys(exCustom).length === 0 && Object.keys(parseAttributesJson(cat.customAttributes)).length > 0) {
    out.customAttributes = cat.customAttributes;
  }

  return out as Prisma.InputJsonValue;
}

/**
 * 公司主數據中的堅果品類（碧根果、開心果、無殼核桃、杏仁、腰果、帶殼夏威夷果 B 級）。
 * 由產品列表頁與 prisma seed 共用，透過 SKU 冪等 upsert，與庫存／銷售單據中的既有 productId 對齊。
 */
export type NutCatalogRow = {
  sku: string;
  name: string;
  barcode: string;
  description: string;
  price: number;
  cost: number;
  /** 主檔建立時間（2026-03～06 分批維護） */
  createdAtIso: string;
  attributes: Prisma.InputJsonValue;
  attachments: Prisma.InputJsonValue;
};

export const NUT_CATALOG: NutCatalogRow[] = [
  {
    sku: "PROD-001",
    name: "碧根果（長壽果）",
    barcode: "6950234517802",
    description:
      "美國進口原料，低溫烘焙；大宗與批發以「公斤」為計價與出貨單位，港幣（HKD）結算。2026-03 由採購部建檔，04 月品控補齊批次檢驗摘要；與主倉 WH-MAIN 入庫流水、報價 QT-202603-001 一致。",
    price: 118.0,
    cost: 72.0,
    createdAtIso: "2026-03-08T10:20:00+08:00",
    attachments: [
      { type: "image", url: "/files/public/spec-pecan-202603.jpg" },
      { type: "pdf", url: "/files/public/lab-report-PROD-001-202603.pdf" },
    ],
    attributes: {
      category: "堅果炒貨",
      subCategory: "碧根果",
      packaging: "大宗：散裝／編織袋等（按 kg 過磅出貨；零售包裝另議）",
      specs: {
        計價幣別: "港幣 HKD",
        計價單位: "每公斤（HKD/kg）",
        原料產地: "美國（喬治亞 / 德克薩斯產區）",
        加工方式: "低溫烘烤",
        等級: "大果（依批次檢驗證書為準）",
        保質期: "12 個月（未開封）",
        最後審核: "2026-04-02 倉儲主管覆核",
      },
      customAttributes: {
        儲存條件: "陰涼乾燥、密封避光；開封後請儘快食用。",
        過敏提示: "含堅果，過敏體質請留意。",
        內部備註: "Q2 主力 SKU；與 PI-202603-8801 預收條款綁定。",
      },
      bom: [],
      pricingTiers: [
        { name: "MOQ 50–199 kg", price: 122 },
        { name: "200–499 kg", price: 118 },
        { name: "≥500 kg 年約", price: 112 },
      ],
    },
  },
  {
    sku: "PROD-002",
    name: "開心果（原味）",
    barcode: "6950234517819",
    description:
      "自然開口、紫衣綠仁，鹽焗原味；港幣結算，單價以每公斤（kg）為準，適合批發與分裝通路。2026-03 冷鏈 WH-COLD 試入庫後建檔，05–06 月依夏季風控加強抽檢濕度。",
    price: 132.0,
    cost: 84.0,
    createdAtIso: "2026-03-19T14:05:00+08:00",
    attachments: [
      { type: "image", url: "/files/public/pistachio-lot-202604.png" },
      { type: "video", url: "/files/public/opening-PROD-002.mp4" },
    ],
    attributes: {
      category: "堅果炒貨",
      subCategory: "開心果",
      packaging: "大宗：按 kg 出貨（港幣計價）",
      specs: {
        計價幣別: "港幣 HKD",
        計價單位: "每公斤（HKD/kg）",
        原料產地: "美國 / 土耳其（按批次標示於外包裝）",
        加工方式: "輕鹽焗烤",
        等級: "自然開口率 ≥ 98%",
        保質期: "10 個月（未開封）",
        建議倉別: "WH-COLD（4–9 月）",
      },
      customAttributes: {
        儲存條件: "密封防潮；夏季建議冷藏保存風味更佳。",
        過敏提示: "含堅果。",
        內部備註: "與 SEED-PO-202604-011 土耳其批次同規格代碼。",
      },
      bom: [],
      pricingTiers: [
        { name: "試單 ≤80 kg", price: 138 },
        { name: "81–300 kg", price: 132 },
        { name: "≥301 kg 專線", price: 128 },
      ],
    },
  },
  {
    sku: "PROD-003",
    name: "無殼核桃仁",
    barcode: "6950234517826",
    description:
      "去殼核桃仁，免剝即食；港幣（HKD）每公斤報價，適合食品廠、烘焙與堅果混合包採購。2026-04 由研發申請新增金屬探測參數至主檔；05 月與烘焙客戶 HK-NUT-006 試產對齊粒度。",
    price: 98.0,
    cost: 62.0,
    createdAtIso: "2026-04-11T09:40:00+08:00",
    attachments: [{ type: "image", url: "/files/public/walnut-kernel-202605.jpg" }],
    attributes: {
      category: "堅果炒貨",
      subCategory: "核桃",
      packaging: "大宗：按 kg 出貨",
      specs: {
        計價幣別: "港幣 HKD",
        計價單位: "每公斤（HKD/kg）",
        原料產地: "新疆阿克蘇 / 雲南漾濞（按批次）",
        加工方式: "去殼、人工挑揀、金屬探測",
        等級: "頭路仁（半片為主）",
        保質期: "8 個月（未開封）",
        金屬探測: "Fe≤1.5mm, Sus≤2.0mm（2026-04 校準）",
      },
      customAttributes: {
        儲存條件: "開封後請密封冷藏，避免油脂氧化產生油耗味。",
        過敏提示: "含堅果。",
        內部備註: "食品廠客戶偏好半片；與 SEED-SO-202605-020 出庫粒度一致。",
      },
      bom: [],
      pricingTiers: [
        { name: "烘焙專線 100–399 kg", price: 98 },
        { name: "≥400 kg", price: 93 },
      ],
    },
  },
  {
    sku: "PROD-004",
    name: "杏仁（巴旦木仁）",
    barcode: "6950234517833",
    description:
      "巴旦木整仁，顆粒均勻；單價以港幣每公斤標示，輕烤原味為主，可配合大宗 kg 出貨。2026-05 建檔，06 月與禮盒組合料號對齊；售價階梯與母親節促銷檔期共用。",
    price: 108.0,
    cost: 68.0,
    createdAtIso: "2026-05-03T16:15:00+08:00",
    attachments: [
      { type: "image", url: "/files/public/almond-np-202605.webp" },
      { type: "pdf", url: "/files/public/allergen-matrix-2026Q2.pdf" },
    ],
    attributes: {
      category: "堅果炒貨",
      subCategory: "杏仁 / 巴旦木",
      packaging: "大宗：按 kg 出貨（港幣計價）",
      specs: {
        計價幣別: "港幣 HKD",
        計價單位: "每公斤（HKD/kg）",
        原料產地: "美國加州",
        加工方式: "輕烤原味",
        等級: "NP 級（顆粒完整）",
        保質期: "12 個月（未開封）",
        促銷檔期: "2026-05-10～06-08 禮盒綁定價",
      },
      customAttributes: {
        儲存條件: "陰涼乾燥處密封保存。",
        過敏提示: "含堅果。",
        內部備註: "與 SEED-PO-202606-006 入庫 NP 級同批。",
      },
      bom: [],
      pricingTiers: [
        { name: "標準批發", price: 108 },
        { name: "禮盒綁定量 ≥300 kg", price: 104 },
      ],
    },
  },
  {
    sku: "PROD-005",
    name: "腰果（原味整仁）",
    barcode: "6950234517840",
    description:
      "越南／印度進口整仁腰果，輕烤原味；港幣（HKD）每公斤結算，大宗按 kg 過磅出貨。2026-06 由採購補建主檔；驗收依 W320 粒徑與水份 ≤5% 等常見出口規格執行，適合零售分裝與烘焙配料。",
    price: 125.0,
    cost: 79.5,
    createdAtIso: "2026-06-21T11:10:00+08:00",
    attachments: [
      { type: "image", url: "/files/public/cashew-kernel-w320-202606.jpg" },
      { type: "pdf", url: "/files/public/lab-moisture-PROD-005-202606.pdf" },
    ],
    attributes: {
      category: "堅果炒貨",
      subCategory: "腰果",
      packaging: "大宗：25 kg 食品級牛皮紙複合袋（內襯 PE）／噸袋可議；按 kg 過磅出貨（港幣計價）",
      specs: {
        計價幣別: "港幣 HKD",
        計價單位: "每公斤（HKD/kg）",
        原料產地: "越南平福省／印度卡納塔克邦（依外包裝批次標示）",
        加工方式: "脫殼、蒸汽殺菌、輕烤原味",
        等級: "W320（整仁，顆粒數約 320 粒／磅；允收碎仁 ≤3% 依當批 COA）",
        水份: "≤5.0%（2026-06 實測 4.2–4.6%）",
        保質期: "12 個月（未開封）",
        最後審核: "2026-06-22 品控覆核",
      },
      customAttributes: {
        儲存條件: "陰涼乾燥、密封避光；開封後請冷藏並儘快用完以防油脂氧化。",
        過敏提示: "含堅果（腰果），生產線或同倉可能接觸其他堅果。",
        內部備註: "首批入庫單據待採購補登；Q3 建議與 PROD-004 杏仁組合促銷堆頭。",
      },
      bom: [],
      pricingTiers: [
        { name: "試單 ≤100 kg", price: 130 },
        { name: "101–400 kg", price: 125 },
        { name: "≥401 kg 年約", price: 119 },
      ],
    },
  },
  {
    sku: "MAC-B-INSHELL-KG",
    name: "帶殼夏威夷果 (B級) / INSHELL MACADAMIA NUTS (B Grade)",
    barcode: "9312345678901",
    description: "带壳夏威夷果,每公斤报价，港币（HKD）结算。",
    price: 56.0,
    cost: 56.35,
    createdAtIso: "2026-06-02T11:30:00+08:00",
    attachments: [
      { type: "pdf", url: "/files/public/invoice-ref-202500062-summary.pdf" },
      { type: "image", url: "/files/public/macadamia-inshell-b-grade-202606.jpg" },
    ],
    attributes: {
      category: "堅果炒貨",
      subCategory: "夏威夷果（帶殼）",
      packaging: "大宗：散裝／噸袋過磅（按 kg 出貨；港幣計價）",
      specs: {
        計價幣別: "港幣 HKD",
        計價單位: "每公斤（HKD/kg）",
        原料產地: "澳洲（昆士蘭 Bundaberg／Gympie）／南非（林波波省；依外包裝批次噴碼）",
        加工方式: "帶殼蒸汽滅酶、分級篩選、浮選去雜",
        等級: "B 級（帶殼；果仁水份 ≤1.8%，殼厚與浮選比例依批次 COA）",
        保質期: "18 個月（未開封）",
        最後審核: "2026-06-18 品控覆核；與 SEED-PO-202606-018 同批檢驗摘要歸檔",
      },
      customAttributes: {
        儲存條件: "主倉 WH-MAIN 乾貨區陰涼乾燥、密封避光；避免與強味貨品混放，防潮防蟲。",
        過敏提示: "含堅果，過敏體質請留意。",
        內部備註:
          "大宗入庫單價與 SEED-PO-202603-312、202605-007、202606-018 區間一致（56.0–57.1 HKD/kg）；06-12 盤點調整見 SEED-ADJ-202606-STOCKTAKE。",
      },
      bom: [],
      pricingTiers: [
        { name: "現貨 ≤5 噸", price: 58 },
        { name: "5–20 噸", price: 56 },
        { name: "年約 ≥20 噸", price: 54 },
      ],
    },
  },
];

function attachmentsEmpty(raw: unknown): boolean {
  if (raw == null) return true;
  if (Array.isArray(raw)) return raw.length === 0;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      return !Array.isArray(p) || p.length === 0;
    } catch {
      return true;
    }
  }
  return false;
}

export async function syncNutCatalog(db: PrismaClient, companyId: string): Promise<void> {
  for (const row of NUT_CATALOG) {
    const existing = await db.product.findUnique({
      where: { companyId_sku: { companyId, sku: row.sku } },
      select: { id: true, attributes: true, attachments: true },
    });

    if (!existing) {
      await db.product.create({
        data: {
          companyId,
          sku: row.sku,
          name: row.name,
          barcode: row.barcode,
          description: row.description,
          price: row.price,
          cost: row.cost,
          attributes: row.attributes,
          attachments: row.attachments,
          createdAt: new Date(row.createdAtIso),
        },
      });
      continue;
    }

    const mergedAttributes = mergeNutCatalogAttributes(existing.attributes, row.attributes);
    /** 帶殼夏威夷果主檔曾用較少 specs 欄位；與 PROD-001～004 對齊時需整段覆寫以免殘留舊鍵 */
    const attributesForDb =
      row.sku === "MAC-B-INSHELL-KG" ? row.attributes : mergedAttributes;

    await db.product.update({
      where: { id: existing.id },
      data: {
        name: row.name,
        barcode: row.barcode,
        description: row.description,
        price: row.price,
        cost: row.cost,
        attributes: attributesForDb,
        createdAt: new Date(row.createdAtIso),
        ...(attachmentsEmpty(existing.attachments) ? { attachments: row.attachments } : {}),
      },
    });
  }
}
