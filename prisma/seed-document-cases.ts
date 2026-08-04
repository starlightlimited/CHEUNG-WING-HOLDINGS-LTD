import type { PrismaClient } from "@prisma/client";
import type { DocumentCaseStatus } from "@prisma/client";

function hkDate(y: number, m: number, d: number, h = 12, min = 0) {
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
  return new Date(`${iso}+08:00`);
}

/**
 * 案件分類與管理：與主 seed 敘述對齊（祥榮控股、QT-202603-001、SEED-PO、WH-MAIN/WH-COLD、
 * 宏遠食品／港島堅果行／浦東臻選、預收發票與公共庫 2026/03–06）。
 * 冪等：先刪除該公司既有 DocumentCase / DocumentCaseCategory 再重建。
 */
export async function seedDocumentCases(prisma: PrismaClient, companyId: string): Promise<void> {
  await prisma.documentCase.deleteMany({ where: { companyId } });
  await prisma.documentCaseCategory.deleteMany({ where: { companyId } });

  const catSales = await prisma.documentCaseCategory.create({
    data: {
      companyId,
      name: "銷售與客戶交付",
      description: "報價、合同執行、預收與開票相關歸檔（對齊銷售與客戶模組）。",
      parentId: null,
      sortOrder: 10,
    },
  });
  const catProc = await prisma.documentCaseCategory.create({
    data: {
      companyId,
      name: "採購與供應鏈",
      description: "採購單、入庫與倉儲冷鏈（對齊 SEED-PO 與庫存流水）。",
      parentId: null,
      sortOrder: 20,
    },
  });
  const catFin = await prisma.documentCaseCategory.create({
    data: {
      companyId,
      name: "財務與合規",
      description: "請款審批、預收對賬、月結關帳（對齊財務與會計模組）。",
      parentId: null,
      sortOrder: 30,
    },
  });
  const catExport = await prisma.documentCaseCategory.create({
    data: {
      companyId,
      name: "文件與導出",
      description: "報價單／合同／發票等 PDF、Excel 導出批次與欄位校對。",
      parentId: null,
      sortOrder: 40,
    },
  });

  const catQuote = await prisma.documentCaseCategory.create({
    data: {
      companyId,
      name: "報價與投標",
      description: "客戶報價審批、條款版本與郵件推廣合規抽查。",
      parentId: catSales.id,
      sortOrder: 11,
    },
  });
  const catContract = await prisma.documentCaseCategory.create({
    data: {
      companyId,
      name: "合同與開票",
      description: "銷售合同、預收發票與框架協議補充。",
      parentId: catSales.id,
      sortOrder: 12,
    },
  });
  const catPo = await prisma.documentCaseCategory.create({
    data: {
      companyId,
      name: "採購訂單跟進",
      description: "供應商交期、到貨備忘與入庫關聯。",
      parentId: catProc.id,
      sortOrder: 21,
    },
  });
  const catWh = await prisma.documentCaseCategory.create({
    data: {
      companyId,
      name: "倉儲與冷鏈",
      description: "主倉／冷鏈溫控、蟲害自查與庫存差異。",
      parentId: catProc.id,
      sortOrder: 22,
    },
  });
  const catPr = await prisma.documentCaseCategory.create({
    data: {
      companyId,
      name: "請款與審批",
      description: "請款單附件、審批軌跡與支付前檢查。",
      parentId: catFin.id,
      sortOrder: 31,
    },
  });
  const catRecon = await prisma.documentCaseCategory.create({
    data: {
      companyId,
      name: "對賬與關帳",
      description: "預收與應收差異、客戶對賬釐清。",
      parentId: catFin.id,
      sortOrder: 32,
    },
  });
  const catPdf = await prisma.documentCaseCategory.create({
    data: {
      companyId,
      name: "單據導出與歸檔",
      description: "批量導出、VAT 金額交叉核對與模板對齊。",
      parentId: catExport.id,
      sortOrder: 41,
    },
  });

  type CaseSeed = {
    code: string;
    title: string;
    description: string;
    categoryId: string;
    status: DocumentCaseStatus;
    openedAt: Date;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };

  const cases: CaseSeed[] = [
    {
      code: "CASE-2026-0307-HY",
      title: "宏遠食品—報價 QT-202603-001（碧根果 PROD-001）條款內部審批",
      description:
        "對齊公共庫「報價QT-202603-001_碧根果規格備註」：月結 30 天、MOQ、TT 30/70 與財務口徑一致；銷售已回簽風險備忘。",
      categoryId: catQuote.id,
      status: "CLOSED",
      openedAt: hkDate(2026, 3, 1),
      closedAt: hkDate(2026, 3, 7, 17, 30),
      createdAt: hkDate(2026, 3, 1, 9, 0),
      updatedAt: hkDate(2026, 3, 7, 17, 30),
    },
    {
      code: "CASE-2026-0328-FW",
      title: "大灣區經銷框架合同補充條款—法務與銷售雙簽前復核",
      description:
        "銷售文件模組常用敘述對齊：祥榮控股主體、屯門聯昌中心地址、蓋章流程；已歸檔供審計抽樣。",
      categoryId: catContract.id,
      status: "ARCHIVED",
      openedAt: hkDate(2026, 3, 5),
      closedAt: hkDate(2026, 3, 28, 16, 0),
      createdAt: hkDate(2026, 3, 5, 10, 15),
      updatedAt: hkDate(2026, 3, 28, 16, 0),
    },
    {
      code: "CASE-2026-0321-EM",
      title: "「華南加工廠」客戶分組—春季促銷郵件合規與退訂鏈接抽查",
      description:
        "對齊客戶跟進與郵件推廣：抄送財務／採購、碧根果與開心果價目更新；無未授權收集個資情形。",
      categoryId: catQuote.id,
      status: "CLOSED",
      openedAt: hkDate(2026, 3, 10),
      closedAt: hkDate(2026, 3, 21, 11, 0),
      createdAt: hkDate(2026, 3, 10, 14, 0),
      updatedAt: hkDate(2026, 3, 21, 11, 0),
    },
    {
      code: "CASE-2026-0331-PO6",
      title: "SEED-PO-202603-006 開心果到貨—與公共庫入庫備忘同步",
      description:
        "對齊「入庫關聯_SEED-PO-202603-006_開心果到貨備忘」：PROD-002 冷鏈入庫數量與品管留樣一致；採購已關閉差異單。",
      categoryId: catPo.id,
      status: "CLOSED",
      openedAt: hkDate(2026, 3, 18),
      closedAt: hkDate(2026, 3, 31, 15, 45),
      createdAt: hkDate(2026, 3, 18, 9, 30),
      updatedAt: hkDate(2026, 3, 31, 15, 45),
    },
    {
      code: "CASE-2026-0418-PO8",
      title: "SEED-PO-202604-008 碧根果入庫延期—供應商交期與主倉 WH-MAIN 協調",
      description:
        "對齊庫存種子流水 referenceId SEED-PO-202604-008；採購與倉儲達成分批到貨，避免超賣預警。",
      categoryId: catPo.id,
      status: "CLOSED",
      openedAt: hkDate(2026, 4, 1),
      closedAt: hkDate(2026, 4, 18, 10, 20),
      createdAt: hkDate(2026, 4, 1, 8, 45),
      updatedAt: hkDate(2026, 4, 18, 10, 20),
    },
    {
      code: "CASE-2026-0520-WC",
      title: "WH-COLD 冷鏈溫度偏離事件—客戶通知與蟲害風險自查閉環",
      description:
        "對齊公共庫「主倉蟲害風險自查」與冷鏈 SOP：銷售接口人執行客戶告知；當班溫度記錄已補登。",
      categoryId: catWh.id,
      status: "IN_PROGRESS",
      openedAt: hkDate(2026, 4, 12),
      closedAt: null,
      createdAt: hkDate(2026, 4, 12, 7, 0),
      updatedAt: hkDate(2026, 5, 20, 14, 10),
    },
    {
      code: "CASE-2026-0527-PRB",
      title: "駿業貿易—預收 INV-CW-001 與進度款對賬差異釐清",
      description:
        "對齊種子預收資料與資產負債表：財務核對銀行水單與合同里程碑；待客戶蓋回採購章後轉應收。",
      categoryId: catRecon.id,
      status: "IN_PROGRESS",
      openedAt: hkDate(2026, 4, 15),
      closedAt: null,
      createdAt: hkDate(2026, 4, 15, 13, 20),
      updatedAt: hkDate(2026, 5, 27, 9, 0),
    },
    {
      code: "CASE-2026-0506-MTR",
      title: "港鐵物料類請款—附件齊套性與審批軌跡檢查",
      description:
        "對齊請款／公共庫敘述：發票副本、驗收單、合同頁次與審批權限設置一致；已標記可支付。",
      categoryId: catPr.id,
      status: "CLOSED",
      openedAt: hkDate(2026, 4, 28),
      closedAt: hkDate(2026, 5, 6, 16, 30),
      createdAt: hkDate(2026, 4, 28, 10, 0),
      updatedAt: hkDate(2026, 5, 6, 16, 30),
    },
    {
      code: "CASE-2026-0524-PZ",
      title: "浦東臻選進口食品—試單預收與越南帶殼夏威夷果條款跟進",
      description:
        "對齊預收發票種子備註：進博會後首單、小批量、條款與發票 202500062 對齊；關務文件補齊中。",
      categoryId: catContract.id,
      status: "IN_PROGRESS",
      openedAt: hkDate(2026, 5, 8),
      closedAt: null,
      createdAt: hkDate(2026, 5, 8, 11, 40),
      updatedAt: hkDate(2026, 5, 24, 15, 5),
    },
    {
      code: "CASE-2026-0525-INV",
      title: "2026 年 5 月預收發票 Excel／PDF 導出批次與 VAT 金額交叉核對",
      description:
        "對齊「發票導出」列表：多筆 2026-03～05 開票日期；導出欄位與總帳應收科目勾稽無誤。",
      categoryId: catPdf.id,
      status: "CLOSED",
      openedAt: hkDate(2026, 5, 18),
      closedAt: hkDate(2026, 5, 25, 17, 0),
      createdAt: hkDate(2026, 5, 18, 9, 0),
      updatedAt: hkDate(2026, 5, 25, 17, 0),
    },
    {
      code: "CASE-2026-0610-Q2",
      title: "Q2 開心果 PROD-002 通路退回—庫存差異與品管複檢",
      description:
        "對齊客戶跟進種子「核桃口感偏乾」類似流程：留樣複檢、換貨預案；與 SEED-PO-202605-012 入庫成本銜接。",
      categoryId: catWh.id,
      status: "IN_PROGRESS",
      openedAt: hkDate(2026, 6, 1),
      closedAt: null,
      createdAt: hkDate(2026, 6, 1, 8, 30),
      updatedAt: hkDate(2026, 6, 10, 11, 15),
    },
    {
      code: "CASE-2026-0612-LC",
      title: "屯門業旺路 8 號聯昌中心 18 樓 1813 室—租約續簽行政歸檔",
      description:
        "對齊公司基本資料賣方地址與傳真；已掃描雙章合同並上傳公共庫「制度與合規」備查。",
      categoryId: catContract.id,
      status: "ARCHIVED",
      openedAt: hkDate(2026, 5, 20),
      closedAt: hkDate(2026, 6, 12, 14, 0),
      createdAt: hkDate(2026, 5, 20, 10, 0),
      updatedAt: hkDate(2026, 6, 12, 14, 0),
    },
    {
      code: "CASE-2026-0620-B2B",
      title: "B2B 報價單導出欄位—與二十家客戶公司模板對齊",
      description:
        "對齊客戶種子「風格接近真實商業檔案」：抬頭、聯絡人、稅號欄位與 QT 前綴單號規則批量驗證。",
      categoryId: catPdf.id,
      status: "OPEN",
      openedAt: hkDate(2026, 6, 10),
      closedAt: null,
      createdAt: hkDate(2026, 6, 10, 9, 15),
      updatedAt: hkDate(2026, 6, 20, 16, 45),
    },
    {
      code: "CASE-2026-0624-HK",
      title: "港島堅果行—六月拜訪紀要與四款輪換報價跟進",
      description:
        "對齊公共庫「客戶跟進_港島堅果行_拜訪紀要_202606」：杏仁、開心果用量大；核桃、碧根果補貨節奏。",
      categoryId: catQuote.id,
      status: "OPEN",
      openedAt: hkDate(2026, 6, 24),
      closedAt: null,
      createdAt: hkDate(2026, 6, 24, 10, 30),
      updatedAt: hkDate(2026, 6, 24, 10, 30),
    },
    {
      code: "CASE-2026-0626-MAC",
      title: "SEED-PO-202606-018 帶殼夏威夷果大宗到港—卸貨窗口與主倉 WH-MAIN 調度",
      description:
        "對齊公共庫「卸貨窗口申請_SEED-PO-202606-018」：MAC-B-INSHELL-KG 補登卸貨記錄、車輛時段與倉儲放行。",
      categoryId: catPo.id,
      status: "IN_PROGRESS",
      openedAt: hkDate(2026, 6, 18),
      closedAt: null,
      createdAt: hkDate(2026, 6, 18, 7, 55),
      updatedAt: hkDate(2026, 6, 26, 9, 30),
    },
  ];

  for (const c of cases) {
    await prisma.documentCase.create({
      data: {
        companyId,
        code: c.code,
        title: c.title,
        description: c.description,
        categoryId: c.categoryId,
        status: c.status,
        openedAt: c.openedAt,
        closedAt: c.closedAt,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      },
    });
  }
}
