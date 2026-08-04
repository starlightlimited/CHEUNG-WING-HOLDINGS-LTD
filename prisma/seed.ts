import {
  Prisma,
  PrismaClient,
  GlAccountType,
  BudgetType,
  PaymentRequestStatus,
  ArApStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { syncNutCatalog } from "../app/(workspace)/products/list/nut-catalog";
import { ensureQ2NutPurchaseOrders } from "../app/(workspace)/data-entry/purchase-orders/purchase-orders-q2-seed";
import {
  seedPersonalCopiesFromPublicLibrary,
  seedPublicLibraryDocuments,
} from "./seed-public-library-files";
import { seedDocumentCases } from "./seed-document-cases";
import {
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_NAME,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_COMPANY_CODE,
  LEGACY_ADMIN_EMAIL,
  LEGACY_COMPANY_CODES,
} from "../lib/company-constants";

const prisma = new PrismaClient();

async function main() {
  /** 發票 202500062 — 賣方（本系統預設公司即開票主體） */
  const sellerAddress =
    "RM 1813, 18/F., LUEN CHEONG CAN CENTRE, NO.8 YIP WONG ROAD, TUEN MUN, N.T., HONG KONG.（香港屯門業旺路8號聯昌中心18樓1813室）\n傳真: (852) 2819-8363";

  const companyProfile = {
    name: "祥榮控股有限公司 (CHEUNG WING HOLDINGS LTD.)",
    address: sellerAddress,
    phone: "(852) 2819-0303",
    email: "info@cheungwing.hk",
  };

  let company = await prisma.company.findFirst({ where: { code: DEFAULT_COMPANY_CODE } });
  if (!company) {
    for (const legacyCode of LEGACY_COMPANY_CODES) {
      const legacy = await prisma.company.findFirst({ where: { code: legacyCode } });
      if (legacy) {
        company = await prisma.company.update({
          where: { id: legacy.id },
          data: { code: DEFAULT_COMPANY_CODE, ...companyProfile },
        });
        break;
      }
    }
  }
  if (!company) {
    company = await prisma.company.create({
      data: { code: DEFAULT_COMPANY_CODE, ...companyProfile },
    });
  } else {
    company = await prisma.company.update({
      where: { id: company.id },
      data: companyProfile,
    });
  }

  const catDefs = [
    { code: "GEN", name: "一般", description: "一般業務" },
    { code: "SAL", name: "銷售", description: "銷售相關" },
    { code: "ADM", name: "行政", description: "行政費用" },
  ];
  for (const c of catDefs) {
    await prisma.accountingCategory.upsert({
      where: { companyId_code: { companyId: company.id, code: c.code } },
      create: { ...c, companyId: company.id },
      update: { name: c.name, description: c.description },
    });
  }

  const accounts: { code: string; name: string; type: GlAccountType; sortOrder: number }[] = [
    { code: "1000", name: "庫存現金", type: "ASSET", sortOrder: 10 },
    { code: "1100", name: "銀行存款", type: "ASSET", sortOrder: 20 },
    { code: "1200", name: "應收賬款", type: "ASSET", sortOrder: 30 },
    { code: "2000", name: "應付賬款", type: "LIABILITY", sortOrder: 40 },
    { code: "2010", name: "短期借款", type: "LIABILITY", sortOrder: 41 },
    { code: "2100", name: "預收賬款", type: "LIABILITY", sortOrder: 42 },
    { code: "2150", name: "應付職工薪津", type: "LIABILITY", sortOrder: 43 },
    { code: "2200", name: "應交稅費", type: "LIABILITY", sortOrder: 44 },
    { code: "2250", name: "其他應付款", type: "LIABILITY", sortOrder: 45 },
    { code: "3000", name: "實收資本", type: "EQUITY", sortOrder: 50 },
    { code: "4000", name: "營業收入", type: "REVENUE", sortOrder: 60 },
    { code: "5000", name: "營業成本", type: "EXPENSE", sortOrder: 70 },
    { code: "5100", name: "管理費用", type: "EXPENSE", sortOrder: 80 },
  ];

  const glByCode: Record<string, string> = {};
  for (const a of accounts) {
    const row = await prisma.glAccount.upsert({
      where: { companyId_code: { companyId: company.id, code: a.code } },
      create: { ...a, companyId: company.id },
      update: { name: a.name, type: a.type, sortOrder: a.sortOrder },
    });
    glByCode[a.code] = row.id;
  }

  const genCat = await prisma.accountingCategory.findFirst({
    where: { companyId: company.id, code: "GEN" },
  });
  if (!genCat) throw new Error("seed: category GEN missing");

  /** 清理歷史種子標記憑證（舊資料可能含此字樣），不刪手動／請款來源之已過帳憑證 */
  await prisma.journalEntry.deleteMany({
    where: {
      companyId: company.id,
      description: { contains: "（演示）" },
    },
  });

  /** 資產負債表負債欄種子：冪等重建（與手動憑證分開） */
  await prisma.journalEntry.deleteMany({
    where: { companyId: company.id, sourceType: "SEED_BS_LIABILITIES" },
  });

  const seedBsLiabAt = (day: number) => new Date(2026, 0, day, 12, 0, 0);
  const catId = genCat.id;
  const jl = (
    entryNo: string,
    sourceId: string,
    at: Date,
    description: string,
    pairs: { code: string; debit: string; credit: string; memo: string }[],
  ) =>
    prisma.journalEntry.create({
      data: {
        companyId: company.id,
        entryNo,
        entryDate: at,
        description,
        status: "POSTED",
        sourceType: "SEED_BS_LIABILITIES",
        sourceId,
        lines: {
          create: pairs.map((p) => ({
            glAccountId: glByCode[p.code]!,
            debit: new Prisma.Decimal(p.debit),
            credit: new Prisma.Decimal(p.credit),
            memo: p.memo,
            accountingCategoryId: catId,
          })),
        },
      },
    });

  await jl("SEED-BS-LIAB-001", "001", seedBsLiabAt(6), "預收客戶訂金入賬（BS種子）", [
    { code: "1100", debit: "128000.00", credit: "0", memo: "銀行收款" },
    { code: "2100", debit: "0", credit: "128000.00", memo: "預收賬款" },
  ]);
  await jl("SEED-BS-LIAB-002", "002", seedBsLiabAt(8), "營運週轉短期借款撥入（BS種子）", [
    { code: "1100", debit: "250000.00", credit: "0", memo: "貸款入賬" },
    { code: "2010", debit: "0", credit: "250000.00", memo: "短期借款" },
  ]);
  await jl("SEED-BS-LIAB-003", "003", seedBsLiabAt(10), "供應商原料款暫估應付（BS種子）", [
    { code: "5000", debit: "168500.00", credit: "0", memo: "進貨暫估" },
    { code: "2000", debit: "0", credit: "168500.00", memo: "應付賬款" },
  ]);
  await jl("SEED-BS-LIAB-004", "004", seedBsLiabAt(12), "本期應計職工薪津（BS種子）", [
    { code: "5100", debit: "42880.00", credit: "0", memo: "薪津費用" },
    { code: "2150", debit: "0", credit: "42880.00", memo: "應付職工薪津" },
  ]);
  await jl("SEED-BS-LIAB-005", "005", seedBsLiabAt(14), "應交稅費暫估（BS種子）", [
    { code: "5100", debit: "15620.40", credit: "0", memo: "稅費" },
    { code: "2200", debit: "0", credit: "15620.40", memo: "應交稅費" },
  ]);
  await jl("SEED-BS-LIAB-006", "006", seedBsLiabAt(16), "倉租及雜項其他應付款（BS種子）", [
    { code: "5100", debit: "3840.00", credit: "0", memo: "倉租雜費" },
    { code: "2250", debit: "0", credit: "3840.00", memo: "其他應付款" },
  ]);

  const y = new Date().getFullYear();
  // 全年固定月預算（大致不變）；5000 僅 1 月（其餘月無成本實際會顯示 0%）
  const FLAT_REVENUE = 40000;
  const FLAT_OPEX = 50000;
  const JAN_COGS = 140000;
  for (let month = 1; month <= 12; month++) {
    const specs: {
      code: string;
      budgetType: BudgetType;
      amount: number;
      note: string;
    }[] = [
      {
        code: "4000",
        budgetType: BudgetType.REVENUE,
        amount: FLAT_REVENUE,
        note: "月度收入預算（全年固定）",
      },
      {
        code: "5100",
        budgetType: BudgetType.EXPENSE,
        amount: FLAT_OPEX,
        note: "月度管理費用預算（全年固定）",
      },
    ];
    if (month === 1) {
      specs.push({
        code: "5000",
        budgetType: BudgetType.EXPENSE,
        amount: JAN_COGS,
        note: "營業成本預算（1月進貨暫估）",
      });
    }
    for (const s of specs) {
      const glId = glByCode[s.code];
      if (!glId) continue;
      await prisma.budgetLine.upsert({
        where: {
          companyId_year_month_glAccountId_budgetType: {
            companyId: company.id,
            year: y,
            month,
            glAccountId: glId,
            budgetType: s.budgetType,
          },
        },
        create: {
          companyId: company.id,
          year: y,
          month,
          glAccountId: glId,
          amount: s.amount,
          budgetType: s.budgetType,
          note: s.note,
        },
        update: { amount: s.amount, note: s.note },
      });
    }
  }

  await prisma.paymentRequest.deleteMany({
    where: {
      companyId: company.id,
      OR: [
        { title: "辦公用品採購請款（演示）" },
        { requestedBy: "演示用戶" },
        { requestedBy: "演示用户" },
        { requestedBy: DEFAULT_ADMIN_NAME },
      ],
    },
  });

  /** 請款單種子：標題含「請款種子」以便每次 seed 冪等重建（與手動自建請款分開）。 */
  const prSeedMarker = "請款種子";
  await prisma.paymentRequest.deleteMany({
    where: { companyId: company.id, title: { contains: prSeedMarker } },
  });
  type PrSeed = {
    title: string;
    amount: string;
    purpose: string;
    status: PaymentRequestStatus;
    department: string;
    category: string;
  };
  type PrSeedDated = PrSeed & { createdAt: string };
  const prSeeds: PrSeedDated[] = [
    {
      title: `快遞與同城送貨（${prSeedMarker}）`,
      amount: "980",
      purpose: "月結運費",
      status: "SUBMITTED",
      department: "行政部",
      category: "物流",
      createdAt: "2026-07-20T09:00:00.000Z",
    },
    {
      title: `辦公軟體年度續費（${prSeedMarker}）`,
      amount: "4200",
      purpose: "協作與郵箱套件（小團隊）",
      status: "APPROVED",
      department: "財務部",
      category: "其他",
      createdAt: "2026-05-15T10:00:00.000Z",
    },
    {
      title: `冷庫溫度記錄服務（${prSeedMarker}）`,
      amount: "1800",
      purpose: "月度訂閱",
      status: "PAID",
      department: "品質與合規部",
      category: "其他",
      createdAt: "2026-04-08T11:00:00.000Z",
    },
    {
      title: `展會交通與住宿（${prSeedMarker}）`,
      amount: "2600",
      purpose: "實報實銷",
      status: "DRAFT",
      department: "市場部",
      category: "差旅",
      createdAt: "2026-06-22T14:00:00.000Z",
    },
    {
      title: `臨時裝卸外包（${prSeedMarker}）`,
      amount: "1500",
      purpose: "夜間到櫃",
      status: "REJECTED",
      department: "物流倉儲部",
      category: "物流",
      createdAt: "2026-03-16T16:00:00.000Z",
    },
  ];
  for (const r of prSeeds) {
    const needApproval =
      r.status === "APPROVED" || r.status === "REJECTED" || r.status === "PAID";
    const createdAt = new Date(r.createdAt);
    await prisma.paymentRequest.create({
      data: {
        companyId: company.id,
        title: r.title,
        amount: new Prisma.Decimal(r.amount),
        purpose: r.purpose,
        status: r.status,
        department: r.department,
        category: r.category,
        approverRole: "finance_manager",
        approvedBy: needApproval ? "財務審批" : null,
        approvedAt: needApproval ? new Date(createdAt.getTime() + 5 * 3_600_000) : null,
        createdAt,
      },
    });
  }

  await prisma.prepayment.deleteMany({
    where: {
      companyId: company.id,
      OR: [{ reference: "DEMO-PREP-1" }, { payerName: "演示客戶 A" }],
    },
  });

  await prisma.accountsReceivable.deleteMany({
    where: {
      companyId: company.id,
      OR: [{ invoiceNo: "INV-DEMO-001" }, { customerName: "演示客戶 B" }],
    },
  });

  await prisma.accountsPayable.deleteMany({
    where: {
      companyId: company.id,
      OR: [{ billNo: "BILL-DEMO-001" }, { vendorName: "演示供應商" }],
    },
  });

  const passwordHash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
  let adminUser = await prisma.user.findUnique({ where: { email: DEFAULT_ADMIN_EMAIL } });
  if (!adminUser) {
    const legacyAdmin = await prisma.user.findUnique({ where: { email: LEGACY_ADMIN_EMAIL } });
    if (legacyAdmin) {
      adminUser = await prisma.user.update({
        where: { id: legacyAdmin.id },
        data: {
          email: DEFAULT_ADMIN_EMAIL,
          passwordHash,
          name: DEFAULT_ADMIN_NAME,
        },
      });
    } else {
      adminUser = await prisma.user.create({
        data: {
          email: DEFAULT_ADMIN_EMAIL,
          passwordHash,
          name: DEFAULT_ADMIN_NAME,
        },
      });
    }
  } else {
    adminUser = await prisma.user.update({
      where: { id: adminUser.id },
      data: { passwordHash, name: DEFAULT_ADMIN_NAME },
    });
  }

  // --- RBAC Seed ---
  const adminRole = await prisma.role.upsert({
    where: { companyId_name: { companyId: company.id, name: "Admin" } },
    create: {
      companyId: company.id,
      name: "Admin",
      description: "系統管理員",
    },
    update: { description: "系統管理員" },
  });

  const financeRole = await prisma.role.upsert({
    where: { companyId_name: { companyId: company.id, name: "Finance" } },
    create: {
      companyId: company.id,
      name: "Finance",
      description: "財務人員",
    },
    update: { description: "財務人員" },
  });

  const salesRole = await prisma.role.upsert({
    where: { companyId_name: { companyId: company.id, name: "Sales" } },
    create: {
      companyId: company.id,
      name: "Sales",
      description: "銷售人員",
    },
    update: { description: "銷售人員" },
  });

  const warehouseRole = await prisma.role.upsert({
    where: { companyId_name: { companyId: company.id, name: "Warehouse" } },
    create: {
      companyId: company.id,
      name: "Warehouse",
      description: "倉庫管理員",
    },
    update: { description: "倉庫管理員" },
  });

  const staffRole = await prisma.role.upsert({
    where: { companyId_name: { companyId: company.id, name: "Staff" } },
    create: {
      companyId: company.id,
      name: "Staff",
      description: "普通員工",
    },
    update: { description: "普通員工" },
  });

  const allPerm = await prisma.permission.upsert({
    where: { action_resource: { action: "manage", resource: "all" } },
    create: { action: "manage", resource: "all", description: "所有權限" },
    update: { description: "所有權限" },
  });

  const readPerm = await prisma.permission.upsert({
    where: { action_resource: { action: "read", resource: "all" } },
    create: { action: "read", resource: "all", description: "只讀權限" },
    update: { description: "只讀權限" },
  });

  const readFilesPerm = await prisma.permission.upsert({
    where: { action_resource: { action: "read", resource: "files" } },
    create: { action: "read", resource: "files", description: "查看企業文件庫／公共庫" },
    update: { description: "查看企業文件庫／公共庫" },
  });

  const manageFilesPerm = await prisma.permission.upsert({
    where: { action_resource: { action: "manage", resource: "files" } },
    create: { action: "manage", resource: "files", description: "上傳／刪除企業文件與網盤" },
    update: { description: "上傳／刪除企業文件與網盤" },
  });

  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: adminRole.id, permissionId: allPerm.id } },
    create: { roleId: adminRole.id, permissionId: allPerm.id },
    update: {},
  });

  /** 與 manage:all 冗餘但保證 JWT 內必有 files 字串，避免舊庫缺關聯時公共庫讀寫全失 */
  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: adminRole.id, permissionId: readFilesPerm.id } },
    create: { roleId: adminRole.id, permissionId: readFilesPerm.id },
    update: {},
  });
  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: adminRole.id, permissionId: manageFilesPerm.id } },
    create: { roleId: adminRole.id, permissionId: manageFilesPerm.id },
    update: {},
  });

  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: staffRole.id, permissionId: readPerm.id } },
    create: { roleId: staffRole.id, permissionId: readPerm.id },
    update: {},
  });

  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: staffRole.id, permissionId: readFilesPerm.id } },
    create: { roleId: staffRole.id, permissionId: readFilesPerm.id },
    update: {},
  });

  await prisma.userRole.upsert({
    where: { userId_roleId_companyId: { userId: adminUser.id, roleId: adminRole.id, companyId: company.id } },
    create: { userId: adminUser.id, roleId: adminRole.id, companyId: company.id },
    update: {},
  });

  /** 公共庫上傳者（Staff + 可讀文件庫），密碼同管理員 */
  const publicLibColleagueDefs = [
    { email: "chenyi@tvp.local", name: "Chen Yi" },
    { email: "linyi@tvp.local", name: "Lin Yi" },
    { email: "wangsan@tvp.local", name: "Wang San" },
    { email: "zhaowu@tvp.local", name: "Zhao Wu" },
  ] as const;
  const publicLibOwnerIds: string[] = [adminUser.id];
  for (const c of publicLibColleagueDefs) {
    const u = await prisma.user.upsert({
      where: { email: c.email },
      create: { email: c.email, passwordHash, name: c.name },
      update: { passwordHash, name: c.name },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId_companyId: { userId: u.id, roleId: staffRole.id, companyId: company.id } },
      create: { userId: u.id, roleId: staffRole.id, companyId: company.id },
      update: {},
    });
    publicLibOwnerIds.push(u.id);
  }
  // --- End RBAC Seed ---

  // --- Products & Inventory ---
  /** 堅果主數據（PROD-001～005 等），與產品列表 / 採購種子共用 */
  await syncNutCatalog(prisma, company.id);

  /** 採購單（2026/03–06）：堅果大宗＋帶殼夏威夷果，與庫存種子、供應商敘述一致；依單號冪等 upsert */
  await ensureQ2NutPurchaseOrders(prisma, company.id);

  /** 2026/03–06 庫存臺賬與流水（與「詳細庫存與成本」加權入庫成本一致）；每次 seed 先清空再寫入以免重複 */
  await prisma.inventoryTransaction.deleteMany({ where: { companyId: company.id } });
  await prisma.inventoryBalance.deleteMany({ where: { companyId: company.id } });

  const invSkus = ["PROD-001", "PROD-002", "PROD-003", "PROD-004", "MAC-B-INSHELL-KG"] as const;
  const invProducts = await prisma.product.findMany({
    where: { companyId: company.id, sku: { in: [...invSkus] } },
    select: { id: true, sku: true },
  });
  const productIdBySku = new Map(invProducts.map((p) => [p.sku, p.id]));
  for (const sku of invSkus) {
    if (!productIdBySku.has(sku)) throw new Error(`seed: missing product ${sku}`);
  }

  type InvWh = "WH-MAIN" | "WH-COLD";
  type InvEv = {
    at: string;
    sku: (typeof invSkus)[number];
    warehouseId: InvWh;
    type: "IN" | "OUT";
    quantity: number;
    unitCost: number | null;
    referenceType: string;
    referenceId?: string;
  };

  const invEvents: InvEv[] = [
    // 碧根果 PROD-001 · 主倉乾貨
    { at: "2026-03-03T09:15:00+08:00", sku: "PROD-001", warehouseId: "WH-MAIN", type: "IN", quantity: 420, unitCost: 71.5, referenceType: "PO_RECEIVE", referenceId: "SEED-PO-202603-001" },
    { at: "2026-03-18T14:40:00+08:00", sku: "PROD-001", warehouseId: "WH-MAIN", type: "OUT", quantity: 80, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202603-118" },
    { at: "2026-04-08T10:05:00+08:00", sku: "PROD-001", warehouseId: "WH-MAIN", type: "IN", quantity: 300, unitCost: 72.8, referenceType: "PO_RECEIVE", referenceId: "SEED-PO-202604-008" },
    { at: "2026-04-22T11:20:00+08:00", sku: "PROD-001", warehouseId: "WH-MAIN", type: "OUT", quantity: 120, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202604-220" },
    { at: "2026-05-05T08:50:00+08:00", sku: "PROD-001", warehouseId: "WH-MAIN", type: "IN", quantity: 360, unitCost: 73.2, referenceType: "PO_RECEIVE", referenceId: "SEED-PO-202605-005" },
    { at: "2026-05-20T15:10:00+08:00", sku: "PROD-001", warehouseId: "WH-MAIN", type: "OUT", quantity: 200, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202605-518" },
    { at: "2026-06-03T13:00:00+08:00", sku: "PROD-001", warehouseId: "WH-MAIN", type: "OUT", quantity: 90, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202606-302" },
    { at: "2026-06-17T09:30:00+08:00", sku: "PROD-001", warehouseId: "WH-MAIN", type: "IN", quantity: 280, unitCost: 74.0, referenceType: "PO_RECEIVE", referenceId: "SEED-PO-202606-017" },
    // 開心果 PROD-002 · 冷鏈倉（夏季風控）
    { at: "2026-03-06T08:20:00+08:00", sku: "PROD-002", warehouseId: "WH-COLD", type: "IN", quantity: 260, unitCost: 83.5, referenceType: "PO_RECEIVE", referenceId: "SEED-PO-202603-006" },
    { at: "2026-03-25T16:45:00+08:00", sku: "PROD-002", warehouseId: "WH-COLD", type: "OUT", quantity: 40, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202603-325" },
    { at: "2026-04-11T10:30:00+08:00", sku: "PROD-002", warehouseId: "WH-COLD", type: "IN", quantity: 220, unitCost: 85.2, referenceType: "PO_RECEIVE", referenceId: "SEED-PO-202604-011" },
    { at: "2026-04-28T14:05:00+08:00", sku: "PROD-002", warehouseId: "WH-COLD", type: "OUT", quantity: 95, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202604-426" },
    { at: "2026-05-12T09:00:00+08:00", sku: "PROD-002", warehouseId: "WH-COLD", type: "IN", quantity: 180, unitCost: 84.0, referenceType: "PO_RECEIVE", referenceId: "SEED-PO-202605-012" },
    { at: "2026-05-29T11:55:00+08:00", sku: "PROD-002", warehouseId: "WH-COLD", type: "OUT", quantity: 70, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202605-529" },
    { at: "2026-06-10T10:15:00+08:00", sku: "PROD-002", warehouseId: "WH-COLD", type: "OUT", quantity: 55, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202606-108" },
    { at: "2026-06-24T08:40:00+08:00", sku: "PROD-002", warehouseId: "WH-COLD", type: "IN", quantity: 150, unitCost: 86.1, referenceType: "PO_RECEIVE", referenceId: "SEED-PO-202606-024" },
    // 核桃仁 PROD-003
    { at: "2026-03-10T13:25:00+08:00", sku: "PROD-003", warehouseId: "WH-MAIN", type: "IN", quantity: 580, unitCost: 61.2, referenceType: "PO_RECEIVE", referenceId: "SEED-PO-202603-010" },
    { at: "2026-03-28T09:50:00+08:00", sku: "PROD-003", warehouseId: "WH-MAIN", type: "OUT", quantity: 150, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202603-326" },
    { at: "2026-04-15T14:20:00+08:00", sku: "PROD-003", warehouseId: "WH-MAIN", type: "IN", quantity: 400, unitCost: 62.5, referenceType: "PO_RECEIVE", referenceId: "SEED-PO-202604-015" },
    { at: "2026-05-02T10:10:00+08:00", sku: "PROD-003", warehouseId: "WH-MAIN", type: "OUT", quantity: 220, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202605-020" },
    { at: "2026-05-16T08:35:00+08:00", sku: "PROD-003", warehouseId: "WH-MAIN", type: "IN", quantity: 520, unitCost: 61.8, referenceType: "PO_RECEIVE", referenceId: "SEED-PO-202605-016" },
    { at: "2026-06-01T15:30:00+08:00", sku: "PROD-003", warehouseId: "WH-MAIN", type: "OUT", quantity: 180, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202606-101" },
    { at: "2026-06-14T11:00:00+08:00", sku: "PROD-003", warehouseId: "WH-MAIN", type: "OUT", quantity: 95, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202606-140" },
    { at: "2026-06-26T09:45:00+08:00", sku: "PROD-003", warehouseId: "WH-MAIN", type: "IN", quantity: 300, unitCost: 63.0, referenceType: "PO_RECEIVE", referenceId: "SEED-PO-202606-026" },
    // 杏仁 PROD-004
    { at: "2026-03-04T10:00:00+08:00", sku: "PROD-004", warehouseId: "WH-MAIN", type: "IN", quantity: 340, unitCost: 67.4, referenceType: "PO_RECEIVE", referenceId: "SEED-PO-202603-004" },
    { at: "2026-03-20T14:15:00+08:00", sku: "PROD-004", warehouseId: "WH-MAIN", type: "OUT", quantity: 55, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202603-318" },
    { at: "2026-04-05T09:20:00+08:00", sku: "PROD-004", warehouseId: "WH-MAIN", type: "IN", quantity: 280, unitCost: 68.9, referenceType: "PO_RECEIVE", referenceId: "SEED-PO-202604-005" },
    { at: "2026-04-19T16:00:00+08:00", sku: "PROD-004", warehouseId: "WH-MAIN", type: "OUT", quantity: 130, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202604-417" },
    { at: "2026-05-08T08:45:00+08:00", sku: "PROD-004", warehouseId: "WH-MAIN", type: "IN", quantity: 310, unitCost: 69.2, referenceType: "PO_RECEIVE", referenceId: "SEED-PO-202605-008" },
    { at: "2026-05-25T13:30:00+08:00", sku: "PROD-004", warehouseId: "WH-MAIN", type: "OUT", quantity: 160, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202605-523" },
    { at: "2026-06-06T10:50:00+08:00", sku: "PROD-004", warehouseId: "WH-MAIN", type: "IN", quantity: 260, unitCost: 70.1, referenceType: "PO_RECEIVE", referenceId: "SEED-PO-202606-006" },
    { at: "2026-06-20T15:05:00+08:00", sku: "PROD-004", warehouseId: "WH-MAIN", type: "OUT", quantity: 88, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202606-618" },
    // 帶殼夏威夷果（大宗 kg）
    { at: "2026-03-12T07:30:00+08:00", sku: "MAC-B-INSHELL-KG", warehouseId: "WH-MAIN", type: "IN", quantity: 22000, unitCost: 56.0, referenceType: "PO_RECEIVE", referenceId: "SEED-PO-202603-312" },
    { at: "2026-04-02T11:40:00+08:00", sku: "MAC-B-INSHELL-KG", warehouseId: "WH-MAIN", type: "OUT", quantity: 3200, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202604-018" },
    { at: "2026-04-20T14:25:00+08:00", sku: "MAC-B-INSHELL-KG", warehouseId: "WH-MAIN", type: "OUT", quantity: 4100, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202604-422" },
    { at: "2026-05-07T08:00:00+08:00", sku: "MAC-B-INSHELL-KG", warehouseId: "WH-MAIN", type: "IN", quantity: 18500, unitCost: 56.4, referenceType: "PO_RECEIVE", referenceId: "SEED-PO-202605-007" },
    { at: "2026-05-22T10:20:00+08:00", sku: "MAC-B-INSHELL-KG", warehouseId: "WH-MAIN", type: "OUT", quantity: 5000, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202605-520" },
    { at: "2026-06-05T09:10:00+08:00", sku: "MAC-B-INSHELL-KG", warehouseId: "WH-MAIN", type: "OUT", quantity: 2800, unitCost: null, referenceType: "SO_SHIP", referenceId: "SEED-SO-202606-503" },
    { at: "2026-06-12T16:30:00+08:00", sku: "MAC-B-INSHELL-KG", warehouseId: "WH-MAIN", type: "IN", quantity: 800, unitCost: 56.0, referenceType: "MANUAL", referenceId: "SEED-ADJ-202606-STOCKTAKE" },
    { at: "2026-06-18T07:55:00+08:00", sku: "MAC-B-INSHELL-KG", warehouseId: "WH-MAIN", type: "IN", quantity: 12000, unitCost: 57.1, referenceType: "PO_RECEIVE", referenceId: "SEED-PO-202606-018" },
  ];

  const invBalanceQty = new Map<string, number>();
  const invKey = (productId: string, wh: InvWh) => `${productId}\t${wh}`;
  for (const ev of invEvents) {
    const productId = productIdBySku.get(ev.sku)!;
    const k = invKey(productId, ev.warehouseId);
    const prev = invBalanceQty.get(k) ?? 0;
    const delta = ev.type === "IN" ? ev.quantity : -ev.quantity;
    const next = prev + delta;
    if (next < 0) throw new Error(`seed inventory negative: ${ev.sku} ${ev.warehouseId}`);
    invBalanceQty.set(k, next);

    await prisma.inventoryTransaction.create({
      data: {
        companyId: company.id,
        productId,
        type: ev.type,
        quantity: ev.quantity,
        unitCost: ev.unitCost != null ? new Prisma.Decimal(String(ev.unitCost)) : null,
        referenceType: ev.referenceType,
        referenceId: ev.referenceId ?? null,
        createdBy: adminUser.id,
        createdAt: new Date(ev.at),
      },
    });
  }

  for (const [k, quantity] of invBalanceQty) {
    const [productId, warehouseId] = k.split("\t") as [string, InvWh];
    await prisma.inventoryBalance.upsert({
      where: {
        companyId_productId_warehouseId: {
          companyId: company.id,
          productId,
          warehouseId,
        },
      },
      create: { companyId: company.id, productId, warehouseId, quantity },
      update: { quantity },
    });
  }

  // --- Customers & Sales ---
  const customerGroup = await prisma.customerGroup.upsert({
    where: { companyId_name: { companyId: company.id, name: "VIP客戶" } },
    create: {
      companyId: company.id,
      name: "VIP客戶",
      description: "重要客戶群體",
    },
    update: { description: "重要客戶群體" },
  });

  const customerGroupSouth = await prisma.customerGroup.upsert({
    where: { companyId_name: { companyId: company.id, name: "華南區渠道" } },
    create: {
      companyId: company.id,
      name: "華南區渠道",
      description: "廣東、廣西、福建等地經銷與加工廠客戶",
    },
    update: { description: "廣東、廣西、福建等地經銷與加工廠客戶" },
  });

  const customerGroupOverseas = await prisma.customerGroup.upsert({
    where: { companyId_name: { companyId: company.id, name: "海外食品買家" } },
    create: {
      companyId: company.id,
      name: "海外食品買家",
      description: "東盟及港台地區堅果、乾貨、配料採購商",
    },
    update: { description: "東盟及港台地區堅果、乾貨、配料採購商" },
  });

  const customerGroupKa = await prisma.customerGroup.upsert({
    where: { companyId_name: { companyId: company.id, name: "KA／連鎖商超" } },
    create: {
      companyId: company.id,
      name: "KA／連鎖商超",
      description: "區域批發市場、商超採購、連鎖零售集團；單量大、對帳期與驗廠要求較高",
    },
    update: {
      description: "區域批發市場、商超採購、連鎖零售集團；單量大、對帳期與驗廠要求較高",
    },
  });

  const customerGroupBakery = await prisma.customerGroup.upsert({
    where: { companyId_name: { companyId: company.id, name: "烘焙與輕食供應" } },
    create: {
      companyId: company.id,
      name: "烘焙與輕食供應",
      description: "烘焙坊、咖啡店、輕食品牌；關注風味穩定、小包裝與原料溯源",
    },
    update: {
      description: "烘焙坊、咖啡店、輕食品牌；關注風味穩定、小包裝與原料溯源",
    },
  });

  const customerGroupCrossBorder = await prisma.customerGroup.upsert({
    where: { companyId_name: { companyId: company.id, name: "跨境電商賣家" } },
    create: {
      companyId: company.id,
      name: "跨境電商賣家",
      description: "綜試區倉、平台賣家、直播帶貨供應鏈；節奏快、對 SKU 與貼標要求高",
    },
    update: {
      description: "綜試區倉、平台賣家、直播帶貨供應鏈；節奏快、對 SKU 與貼標要求高",
    },
  });

  /** 二十家風格接近真實商業檔案的客戶（公司名、聯絡人均為虛構，供檔案結構與列表效果） */
  const realisticCustomers: Array<{
    code: string;
    name: string;
    contactPerson: string;
    email: string;
    phone: string;
    address: string;
    taxId: string | null;
    source: string;
    status: string;
    groupId: string | null;
  }> = [
    {
      code: "CUST-SEED-101",
      name: "深圳市粵興電子科技有限公司",
      contactPerson: "劉偉強（採購總監）",
      email: "liu.weiqiang@yuexing-elec.cn",
      phone: "+86 755 8342 9108",
      address: "深圳市南山區科技園南區深圳灣科技生態園10棟A座1903室",
      taxId: "91440300MA5F2K8L3X",
      source: "HKTDC 香港貿發局配對",
      status: "ACTIVE",
      groupId: customerGroup.id,
    },
    {
      code: "CUST-SEED-102",
      name: "東莞市順發精密五金製品有限公司",
      contactPerson: "陳國棟（生產副總）",
      email: "chen.guodong@shunfa-dg.com",
      phone: "+86 769 8773 2260",
      address: "廣東省東莞市長安鎮錦廈社區振安路聚和国际機械城二期8號館",
      taxId: "91441900MA4W7N9P2E",
      source: "業界轉介",
      status: "ACTIVE",
      groupId: customerGroupSouth.id,
    },
    {
      code: "CUST-SEED-103",
      name: "廣州市宏泰進出口貿易有限公司",
      contactPerson: "黃美玲（外貿經理）",
      email: "huang.meiling@hongtai-gz.cn",
      phone: "+86 20 3765 4412",
      address: "廣州市海珠區新港東路保利世貿中心E座1206室",
      taxId: "91440101MA5CQ3H8K1",
      source: "廣交會現場名片",
      status: "ACTIVE",
      groupId: customerGroupSouth.id,
    },
    {
      code: "CUST-SEED-104",
      name: "佛山市南海區金輝金屬材料商行",
      contactPerson: "何志華",
      email: "he.zhihua@jinhui-metals.cn",
      phone: "+86 757 8672 5590",
      address: "佛山市南海區大瀝鎮鳳池裝飾材料市場西區三路19號",
      taxId: "92440605MA5E8K3N2Y",
      source: "電話開發",
      status: "ACTIVE",
      groupId: customerGroupSouth.id,
    },
    {
      code: "CUST-SEED-105",
      name: "廈門海滄區藍洋冷鏈物流有限公司",
      contactPerson: "林嘉文（運營主管）",
      email: "lin.jiawen@lanyang-cold.cn",
      phone: "+86 592 6891 3307",
      address: "廈門市海滄區海景東二路海滄保稅港區冷鏈物流中心3號庫",
      taxId: "91350205MA31XXXXXX",
      source: "物流行業協會年會",
      status: "ACTIVE",
      groupId: customerGroupSouth.id,
    },
    {
      code: "CUST-SEED-106",
      name: "香港匯洋貿易有限公司 (WELL OCEAN TRADING LTD)",
      contactPerson: "鄭家豪（董事）",
      email: "ricky.cheng@wellocean.hk",
      phone: "+852 2156 8820",
      address: "香港九龍觀塘成業街15號成運工業大廈8樓802室",
      taxId: "71234567-000-05-23-8",
      source: "中信銀行客戶轉介",
      status: "ACTIVE",
      groupId: customerGroup.id,
    },
    {
      code: "CUST-SEED-107",
      name: "新北市板橋區瑞豐食品商行",
      contactPerson: "吳淑芬（採購）",
      email: "wu.shufen@ruifeng-foods.tw",
      phone: "+886 2 8964 5512",
      address: "新北市板橋區文化路二段88號7樓之3",
      taxId: "24567890",
      source: "台北國際食品展",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "CUST-SEED-108",
      name: "新加坡星洲堅果私人有限公司 (SINO NUTS PTE. LTD.)",
      contactPerson: "Tan Wei Ming (Operations)",
      email: "wmtan@sinonuts.sg",
      phone: "+65 6743 9182",
      address: "8 Loyang Crescent, Singapore 508988",
      taxId: "201234567M",
      source: "LinkedIn 商務訊息",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "CUST-SEED-109",
      name: "胡志明市明安國際貿易責任有限公司 (MINH AN CO., LTD)",
      contactPerson: "Nguyễn Thị Mai（進出口部）",
      email: "mai.nt@minhan-trade.vn",
      phone: "+84 28 3822 7741",
      address: "Lầu 5, 123 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh, Việt Nam",
      taxId: "0315678901",
      source: "越南合作夥伴推薦",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "CUST-SEED-110",
      name: "中山市小欖鎮永盛照明電器廠",
      contactPerson: "梁志剛（廠長）",
      email: "liang.zhigang@yongsheng-light.cn",
      phone: "+86 760 2210 6680",
      address: "廣東省中山市小欖鎮工業大道南22號永盛工業園",
      taxId: "91442000MA4UXXXXXX",
      source: "官網詢價表單",
      status: "LEAD",
      groupId: customerGroupSouth.id,
    },
    {
      code: "CUST-SEED-111",
      name: "惠州市惠陽區德信包裝材料有限公司",
      contactPerson: "周敏（銷售）",
      email: "zhou.min@dexin-pack.cn",
      phone: "+86 752 3559 1022",
      address: "惠州市惠陽區秋長街道新塘村德信工業園B棟",
      taxId: "91441303MA5XXXXXX",
      source: "阿里巴巴國際站",
      status: "ACTIVE",
      groupId: customerGroupSouth.id,
    },
    {
      code: "CUST-SEED-112",
      name: "江門市新會區陳皮村農產品專業合作社",
      contactPerson: "陳啟明（理事長）",
      email: "chen.qiming@chenpivillage.cn",
      phone: "+86 750 6398 2100",
      address: "廣東省江門市新會區天祿村陳皮村市場大道1號",
      taxId: "93440705MA5XXXXXX",
      source: "農產品展銷會",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "CUST-SEED-113",
      name: "珠海市橫琴新區跨境電商供應鏈服務中心",
      contactPerson: "馮凱琳（關務經理）",
      email: "feng.kailin@hengqin-scm.cn",
      phone: "+86 756 8689 5500",
      address: "珠海市橫琴新區港澳大道1888號跨境電商產業園3層",
      taxId: "91440400MA5XXXXXX",
      source: "政府採購與服務平台",
      status: "ACTIVE",
      groupId: customerGroup.id,
    },
    {
      code: "CUST-SEED-114",
      name: "南寧市青秀區桂香乾貨批發市場管理有限公司",
      contactPerson: "蒙建軍（招商部）",
      email: "meng.jianjun@guixiang-market.cn",
      phone: "+86 771 5882 6601",
      address: "廣西南寧市青秀區民族大道東段桂香乾貨批發市場辦公樓301",
      taxId: "91450103MA5XXXXXX",
      source: "區域批發市場走訪",
      status: "ACTIVE",
      groupId: customerGroupSouth.id,
    },
    {
      code: "CUST-SEED-115",
      name: "泉州市晉江市海聯水產食品有限公司",
      contactPerson: "施文龍（出口部）",
      email: "shi.wenlong@hailian-aqua.cn",
      phone: "+86 595 8588 7733",
      address: "福建省泉州市晉江市深滬鎮東山工業區海聯食品園",
      taxId: "91350582MA2XXXXXX",
      source: "水產行業展會",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "CUST-SEED-116",
      name: "澳門新口岸區百匯零售集團有限公司",
      contactPerson: "馬志偉（集團採購）",
      email: "ma.zhiwei@bairport-mo.com",
      phone: "+853 2871 9920",
      address: "澳門宋玉生廣場336號誠豐商業中心15樓F座",
      taxId: "82XXXXXX",
      source: "澳門零售協會活動",
      status: "INACTIVE",
      groupId: customerGroup.id,
    },
    {
      code: "CUST-SEED-117",
      name: "成都市雙流區川味調料電商倉儲中心",
      contactPerson: "楊靜（電商負責人）",
      email: "yang.jing@chuanwei-sc.cn",
      phone: "+86 28 8577 1200",
      address: "成都市雙流區西航港大道中四段1499號電商物流園6號庫",
      taxId: "91510116MA6XXXXXX",
      source: "抖音供應鏈對接",
      status: "LEAD",
      groupId: customerGroupSouth.id,
    },
    {
      code: "CUST-SEED-118",
      name: "寧波市北倉區海港國際貨運代理有限公司",
      contactPerson: "孫磊（客服主管）",
      email: "sun.lei@haigang-forwarding.cn",
      phone: "+86 574 8685 4410",
      address: "浙江省寧波市北倉區新碶街道明州路海聯大廈1808室",
      taxId: "91330206MA2XXXXXX",
      source: "船公司推薦",
      status: "ACTIVE",
      groupId: customerGroup.id,
    },
    {
      code: "CUST-SEED-119",
      name: "天津市濱海新區華北冷鏈集散中心（有限合伙）",
      contactPerson: "趙海燕（合夥人代表）",
      email: "zhao.haiyan@huabei-cold.cn",
      phone: "+86 22 5988 3300",
      address: "天津市濱海新區港城大道與海濱大道交口冷鏈物流基地A區",
      taxId: "91120116MA07XXXXXX",
      source: "冷鏈行業沙龍",
      status: "ACTIVE",
      groupId: customerGroupSouth.id,
    },
    {
      code: "CUST-SEED-120",
      name: "上海市浦東新區臻選進口食品貿易有限公司",
      contactPerson: "沈佳怡（品牌總監）",
      email: "shen.jiayi@zhenxuan-sh.com",
      phone: "+86 21 5032 8816",
      address: "上海市浦東新區陸家嘴環路1000號恒生銀行大廈36層3605室",
      taxId: "91310115MA1XXXXXX",
      source: "進博會現場洽談",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
  ];

  /** 香港地區零售／採購堅果客戶（虛構示範；常購：杏仁、無殼核桃、開心果、碧根果） */
  const hkNutRetailCustomers: Array<{
    code: string;
    name: string;
    contactPerson: string;
    email: string;
    phone: string;
    address: string;
    taxId: string | null;
    source: string;
    status: string;
    groupId: string | null;
  }> = [
    {
      code: "HK-NUT-001",
      name: "陳志明（Tony Chan）",
      contactPerson: "陳志明",
      email: "tony.chan.hk@gmail.com",
      phone: "+852 6123 8847",
      address: "香港九龍塘 · 常購：杏仁、無殼核桃、開心果、碧根果（烘焙／家常）",
      taxId: null,
      source: "WhatsApp 查價",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "HK-NUT-002",
      name: "李美玲",
      contactPerson: "李美玲",
      email: "mei.ling.lee@yahoo.com.hk",
      phone: "+852 9345 2016",
      address: "香港沙田第一城 · 偏好無鹽；無殼核桃、碧根果較多；四款均有採購",
      taxId: null,
      source: "Facebook 專頁",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "HK-NUT-003",
      name: "王浩軒（Jason Wong）",
      contactPerson: "王浩軒",
      email: "jason.wong.work@outlook.com",
      phone: "+852 6712 5590",
      address: "香港中環 · 辦公室茶點；四款輪換；小包裝",
      taxId: null,
      source: "企業茶水間採購",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "HK-NUT-004",
      name: "張雅詩",
      contactPerson: "張雅詩",
      email: "ngaisi.cheung@gmail.com",
      phone: "+852 9088 3741",
      address: "香港將軍澳 · 全家食用；杏仁、開心果用量大；另備核桃、碧根果",
      taxId: null,
      source: "鄰里推薦",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "HK-NUT-005",
      name: "劉家俊",
      contactPerson: "劉家俊",
      email: "kachun.lau@icloud.com",
      phone: "+852 6543 9182",
      address: "香港元朗 · 燕麥碗用無殼核桃、碧根果；杏仁奶昔",
      taxId: null,
      source: "健康食品社團",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "HK-NUT-006",
      name: "陳慧敏（Emily Chan）",
      contactPerson: "陳慧敏",
      email: "emily.cm@hotmail.com",
      phone: "+852 9211 6405",
      address: "香港銅鑼灣 · 送禮混合禮袋；四款均要靚貨",
      taxId: null,
      source: "節日禮盒查詢",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "HK-NUT-007",
      name: "黃子謙",
      contactPerson: "黃子謙",
      email: "tszhim.wong@gmail.com",
      phone: "+852 6890 2257",
      address: "香港荃灣 · 健身加餐；無殼核桃、杏仁為主；開心果少量",
      taxId: null,
      source: "健身房同學介紹",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "HK-NUT-008",
      name: "吳佩儀",
      contactPerson: "吳佩儀",
      email: "puiyee.ng@outlook.com",
      phone: "+852 9456 7783",
      address: "香港大埔 · 學童午餐盒；開心果、杏仁（去殼款）；核桃、碧根果",
      taxId: null,
      source: "家長群組",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "HK-NUT-009",
      name: "鄭國輝",
      contactPerson: "鄭國輝",
      email: "kwokfai.cheng@163.com",
      phone: "+852 6120 4491",
      address: "香港觀塘 · 公司團購；四款批量；需發票",
      taxId: null,
      source: "觀塘工廈同層公司",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "HK-NUT-010",
      name: "林詩穎（Shirley Lam）",
      contactPerson: "林詩穎",
      email: "shirley.lam.hk@gmail.com",
      phone: "+852 9334 1568",
      address: "香港尖沙咀 · 派對小食；碧根果、開心果要香脆；杏仁、核桃",
      taxId: null,
      source: "活動策劃轉介",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "HK-NUT-011",
      name: "馬俊傑",
      contactPerson: "馬俊傑",
      email: "chun_kit.ma@icloud.com",
      phone: "+852 6778 9024",
      address: "香港屯門 · 長輩愛核桃；本人愛杏仁、碧根果；開心果",
      taxId: null,
      source: "街市同檔口老闆",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "HK-NUT-012",
      name: "何嘉欣",
      contactPerson: "何嘉欣",
      email: "kayan.ho@yahoo.com",
      phone: "+852 9188 5330",
      address: "香港北角 · 烘焙曲奇；杏仁碎、開心果碎；整粒核桃、碧根果",
      taxId: null,
      source: "烘焙班同學",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "HK-NUT-013",
      name: "謝家樂（Kelvin Tse）",
      contactPerson: "謝家樂",
      email: "kelvin.tse.hk@outlook.com",
      phone: "+852 6422 7819",
      address: "香港紅磡 · 追劇零食；四款混買；每月補貨",
      taxId: null,
      source: "網店首單",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "HK-NUT-014",
      name: "羅婉婷",
      contactPerson: "羅婉婷",
      email: "wanting.luo@gmail.com",
      phone: "+852 9567 3044",
      address: "香港馬鞍山 · 低糖飲食；指定原味杏仁、核桃；開心果、碧根果少鹽",
      taxId: null,
      source: "營養師客戶轉介",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "HK-NUT-015",
      name: "梁志偉",
      contactPerson: "梁志偉",
      email: "chiwai.leung@hotmail.com",
      phone: "+852 6689 1126",
      address: "香港深水埗 · 家庭裝；碧根果、開心果消耗最快；杏仁、核桃",
      taxId: null,
      source: "熟客回購",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "HK-NUT-016",
      name: "馮凱琳（Karen Fung）",
      contactPerson: "馮凱琳",
      email: "karen.fung.shop@gmail.com",
      phone: "+852 9233 8895",
      address: "香港金鐘 · 送禮＋自用；禮盒分格放四款",
      taxId: null,
      source: "寫字樓同事",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "HK-NUT-017",
      name: "鄧子軒",
      contactPerson: "鄧子軒",
      email: "tsz_hin.tang@icloud.com",
      phone: "+852 6345 6670",
      address: "香港西貢 · 露營野餐；小袋裝杏仁、開心果；核桃、碧根果",
      taxId: null,
      source: "戶外用品店聯宣",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "HK-NUT-018",
      name: "蔡靜怡",
      contactPerson: "蔡靜怡",
      email: "jingyi.cai@yahoo.com.hk",
      phone: "+852 9411 2284",
      address: "香港柴灣 · 素食；四款均需確認無動物成分加工",
      taxId: null,
      source: "素食市集",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "HK-NUT-019",
      name: "鍾文浩",
      contactPerson: "鍾文浩",
      email: "manho.chung@gmail.com",
      phone: "+852 6598 4451",
      address: "香港東涌 · 下午時段送貨；核桃、碧根果大宗；杏仁、開心果",
      taxId: null,
      source: "離島專線查詢",
      status: "ACTIVE",
      groupId: customerGroupOverseas.id,
    },
    {
      code: "HK-NUT-020",
      name: "許嘉怡（Kay Hui）",
      contactPerson: "許嘉怡",
      email: "kay.hui.nuts@gmail.com",
      phone: "+852 9122 5907",
      address: "香港灣仔 · 咖啡店原料試用；四款各要樣品再訂貨",
      taxId: null,
      source: "HKTDC 配對",
      status: "LEAD",
      groupId: customerGroupOverseas.id,
    },
  ];

  for (const row of realisticCustomers) {
    await prisma.customer.upsert({
      where: { companyId_code: { companyId: company.id, code: row.code } },
      create: {
        companyId: company.id,
        code: row.code,
        name: row.name,
        contactPerson: row.contactPerson,
        email: row.email,
        phone: row.phone,
        address: row.address,
        taxId: row.taxId,
        source: row.source,
        status: row.status,
        groupId: row.groupId,
      },
      update: {
        name: row.name,
        contactPerson: row.contactPerson,
        email: row.email,
        phone: row.phone,
        address: row.address,
        taxId: row.taxId,
        source: row.source,
        status: row.status,
        groupId: row.groupId,
      },
    });
  }

  for (const row of hkNutRetailCustomers) {
    await prisma.customer.upsert({
      where: { companyId_code: { companyId: company.id, code: row.code } },
      create: {
        companyId: company.id,
        code: row.code,
        name: row.name,
        contactPerson: row.contactPerson,
        email: row.email,
        phone: row.phone,
        address: row.address,
        taxId: row.taxId,
        source: row.source,
        status: row.status,
        groupId: row.groupId,
      },
      update: {
        name: row.name,
        contactPerson: row.contactPerson,
        email: row.email,
        phone: row.phone,
        address: row.address,
        taxId: row.taxId,
        source: row.source,
        status: row.status,
        groupId: row.groupId,
      },
    });
  }

  /** 將部分客戶劃入新增分組，讓「客戶分組」頁更像實際在用的結構 */
  await prisma.customer.updateMany({
    where: {
      companyId: company.id,
      code: {
        in: [
          "HK-NUT-001",
          "HK-NUT-002",
          "HK-NUT-004",
          "HK-NUT-007",
          "HK-NUT-012",
          "HK-NUT-020",
        ],
      },
    },
    data: { groupId: customerGroupBakery.id },
  });
  await prisma.customer.updateMany({
    where: {
      companyId: company.id,
      code: { in: ["CUST-SEED-114", "CUST-SEED-116", "CUST-SEED-120", "CUST-SEED-103"] },
    },
    data: { groupId: customerGroupKa.id },
  });
  await prisma.customer.updateMany({
    where: {
      companyId: company.id,
      code: { in: ["CUST-SEED-113", "CUST-SEED-117", "HK-NUT-003", "HK-NUT-010"] },
    },
    data: { groupId: customerGroupCrossBorder.id },
  });

  const customer1 = await prisma.customer.upsert({
    where: { companyId_code: { companyId: company.id, code: "CUST-001" } },
    create: {
      companyId: company.id,
      code: "CUST-001",
      name: "創科資訊有限公司",
      contactPerson: "張總",
      email: "zhang@example.com",
      phone: "13800138000",
      groupId: customerGroup.id,
      status: "ACTIVE",
    },
    update: { name: "創科資訊有限公司", contactPerson: "張總" },
  });

  const thuanAnInvoiceNotes = `# 發票信息提取 (Invoice Information Extraction)

## 1. 基本信息
- **單據類型**: 發票 (INVOICE - ORIGINAL)
- **發票日期**: 2025年12月5日 (05-DEC-2025)
- **發票編號**: 202500062
- **頁碼**: 1 of 1
- **貨幣**: 港幣 (HKD)

## 2. 買賣雙方信息
### 賣方 (Seller)
- **公司名稱**: 祥榮控股有限公司 (CHEUNG WING HOLDINGS LTD.)
- **地址**: RM 1813, 18/F., LUEN CHEONG CAN CENTRE, NO.8 YIP WONG ROAD, TUEN MUN, N.T., HONG KONG. (香港屯門業旺路8號聯昌中心18樓1813室)
- **電話**: (852) 2819-0303
- **傳真**: (852) 2819-8363
- **電子郵件**: info@cheungwing.hk

### 買方 (Buyer / To)
- **公司名稱**: THUAN AN SERVICE IMPORT EXPORT CO., LTD
- **地址**: PHAM NGU LAO STREET-KA LONG WARD-MONG CAI CITY-QUANG NINH PROVINCE (越南廣寧省芒街市卡隆坊范五老街)

## 3. 商品明細
| 描述 (Description) | 數量 (QTY) | 單位 (Unit) | 單價 (Unit Price) | 總額 (Amount HKD) |
| :--- | :--- | :--- | :--- | :--- |
| 帶殼夏威夷果 (B級) <br>INSHELL MACADAMIA NUTS (B Grade) | 36,340 | KGS | HKD 56.00 | HKD 2,035,040.00 |

## 4. 合計信息
- **總計金額 (TOTAL AMOUNT)**: **HKD 2,035,040.00**

## 5. 付款指令 (Payment Instructions)
- **收款人名稱 (Beneficiary Name)**: CHEUNG WING HOLDINGS LIMITED
- **開戶銀行 (Bank Name)**: 中信銀行(國際)有限公司 (CHINA CITIC BANK INTERNATIONAL LIMITED)
- **銀行代碼 (Bank Code)**: 018
- **SWIFT Code**: KWHKHKHH
- **銀行賬號 (Account No.)**: 694-2-65204000 (HKD)

## 6. 其他備註
- **簽署/蓋章**: 祥榮控股有限公司 (CHEUNG WING HOLDINGS LIMITED) 已蓋章簽署。
- **條款**: E. & O.E. (有錯漏另行更正)
- **聲明**: 收到款項後將另發正式收據 (An official receipt will be issued upon payment)。
`;

  const thuanCustomer = await prisma.customer.upsert({
    where: { companyId_code: { companyId: company.id, code: "CUST-INV-202500062" } },
    create: {
      companyId: company.id,
      code: "CUST-INV-202500062",
      name: "THUAN AN SERVICE IMPORT EXPORT CO., LTD",
      address:
        "PHAM NGU LAO STREET-KA LONG WARD-MONG CAI CITY-QUANG NINH PROVINCE (越南廣寧省芒街市卡隆坊范五老街)",
      source: "發票提取",
      status: "ACTIVE",
    },
    update: {
      name: "THUAN AN SERVICE IMPORT EXPORT CO., LTD",
      address:
        "PHAM NGU LAO STREET-KA LONG WARD-MONG CAI CITY-QUANG NINH PROVINCE (越南廣寧省芒街市卡隆坊范五老街)",
      source: "發票提取",
    },
  });

  await prisma.customerFollowUp.deleteMany({
    where: {
      customerId: thuanCustomer.id,
      type: "EMAIL",
      content: { startsWith: "【發票 202500062 歸檔摘要】" },
    },
  });
  await prisma.customerFollowUp.create({
    data: {
      customerId: thuanCustomer.id,
      type: "EMAIL",
      content: `【發票 202500062 歸檔摘要】\n${thuanAnInvoiceNotes.slice(0, 4000)}`,
      createdBy: adminUser.id,
    },
  });

  await prisma.accountsReceivable.deleteMany({
    where: { companyId: company.id, invoiceNo: "202500062" },
  });
  await prisma.accountsReceivable.create({
    data: {
      companyId: company.id,
      customerId: thuanCustomer.id,
      customerName: thuanCustomer.name,
      invoiceNo: "202500062",
      issueDate: new Date(2025, 11, 5),
      description:
        "發票 202500062（HKD）：帶殼夏威夷果(B級) / INSHELL MACADAMIA NUTS (B Grade)，36,340 KGS × 56.00 = 2,035,040.00",
      amount: new Prisma.Decimal("2035040.00"),
      receivedAmount: new Prisma.Decimal("0"),
      status: ArApStatus.OPEN,
    },
  });

  /** 2026-03～06 跟進記錄：重跑 seed 時先清同區間、同批客戶，避免重複堆疊 */
  const followUpRangeStart = new Date("2026-03-01T00:00:00+08:00");
  const followUpRangeEnd = new Date("2026-06-30T23:59:00+08:00");

  await prisma.customerFollowUp.deleteMany({
    where: {
      date: { gte: followUpRangeStart, lte: followUpRangeEnd },
      customer: {
        companyId: company.id,
        AND: [
          { code: { not: null } },
          { code: { not: "CUST-INV-202500062" } },
          {
            OR: [
              { code: { startsWith: "CUST-SEED-" } },
              { code: { startsWith: "HK-NUT-" } },
              { code: "CUST-001" },
            ],
          },
        ],
      },
    },
  });

  const followUpTargets = await prisma.customer.findMany({
    where: {
      companyId: company.id,
      AND: [
        { code: { not: null } },
        { code: { not: "CUST-INV-202500062" } },
        {
          OR: [
            { code: { startsWith: "CUST-SEED-" } },
            { code: { startsWith: "HK-NUT-" } },
            { code: "CUST-001" },
          ],
        },
      ],
    },
    select: { id: true, code: true, name: true, contactPerson: true },
    orderBy: { code: "asc" },
  });

  const followUpTemplates: Array<{
    type: "PHONE" | "EMAIL" | "MEETING" | "OTHER";
    text: (who: string, co: string) => string;
  }> = [
    {
      type: "PHONE",
      text: (who, co) =>
        `致電${who}（${co}），核對帶殼夏威夷果 B 級現貨與下批到港 ETA；對方預計本週內回傳補貨數量區間。`,
    },
    {
      type: "EMAIL",
      text: (who, co) =>
        `已發郵件給${who}（${co}）：碧根果、開心果最新價目、MOQ 與付款條款（TT 30/70）；抄送財務與採購。`,
    },
    {
      type: "MEETING",
      text: (who, co) =>
        `線上會議：與${who}（${co}）敲定試單混裝櫃配比（杏仁／核桃），並確認驗貨標準與留樣方式。`,
    },
    {
      type: "PHONE",
      text: (who, co) =>
        `電話跟進小包裝分裝交期；${co} 採購${who} 表示標籤需兩輪審批，預留約 10 個工作日生產。`,
    },
    {
      type: "EMAIL",
      text: (who, co) =>
        `郵件回覆${co}：關於越南線報關抬頭與裝運港選擇，已附代理聯絡方式與路線書草稿供內部法務審閱。`,
    },
    {
      type: "MEETING",
      text: (who, co) =>
        `拜訪後紀要（${co}）：淡季備貨建議拆兩批出貨，降低冷鏈倉租；${who} 同意先走 800kg 開心果試單。`,
    },
    {
      type: "PHONE",
      text: (who, co) =>
        `與${who} 通話處理短溢裝 0.3% 差異（${co}），雙方同意按實收結算，已請財務開具差異備註發票。`,
    },
    {
      type: "OTHER",
      text: (who, co) =>
        `內部交接：${co} 指定跟單改由李小姐負責；已在企業微信群同步聯絡方式與歷史訂單文件夾給${who}。`,
    },
    {
      type: "PHONE",
      text: (who, co) =>
        `致電${who}（${co}）確認展會樣品寄送地址與收件時間窗，順豐單號已短信同步。`,
    },
    {
      type: "EMAIL",
      text: (who, co) =>
        `發送食安與第三方檢測報告掃描件給${co}（聯絡人 ${who}），說明有效期至 2027-Q1，供其商超驗廠使用。`,
    },
    {
      type: "MEETING",
      text: (who, co) =>
        `季度業務回顧會（${co}）：覆盤 Q1 堅果類 SKU 動銷，${who} 提出 6 月促銷堆頭追加一組端架。`,
    },
    {
      type: "PHONE",
      text: (who, co) =>
        `電話安撫客戶關於一批核桃口感偏乾的反饋（${co}）；已安排留樣複檢與換貨預案，${who} 同意暫緩公開評價。`,
    },
    {
      type: "EMAIL",
      text: (who, co) =>
        `郵件確認 ETD 2026-06-12 鹽田出運之開心果試單裝櫃時間，${co} 船務已收 VGM 截止日提醒並回執給${who}。`,
    },
    {
      type: "OTHER",
      text: (who, co) =>
        `系統備註：${co} 要求所有對外報價郵件標題統一加前綴「CW-報價」；已告知${who} 銷售全員執行。`,
    },
    {
      type: "PHONE",
      text: (who, co) =>
        `與${who} 確認季末促銷報名截止日；${co} 採購委員會仍在走內部簽批，承諾下週三前給是否加簽促銷協議。`,
    },
    {
      type: "MEETING",
      text: (who, co) =>
        `視頻會議（${co}）：與${who} 討論無鹽系列與禮盒規格，初步選定四款堅果混裝方案待設計出稿。`,
    },
  ];

  const slotIn2026H1 = (salt: number) => {
    const t0 = new Date("2026-03-01T00:00:00+08:00").getTime();
    const spanMs = 121 * 24 * 60 * 60 * 1000;
    const offset = (salt * 7919) % spanMs;
    return new Date(t0 + offset);
  };

  const followUpRows: {
    customerId: string;
    type: string;
    content: string;
    date: Date;
    createdBy: string | null;
  }[] = [];

  let fuSalt = 0;
  for (const c of followUpTargets) {
    const who = (c.contactPerson ?? "").trim() || "對方聯絡人";
    const co = c.name;
    const count = 2 + (fuSalt % 3);
    for (let j = 0; j < count; j++) {
      const tmpl = followUpTemplates[(fuSalt + j) % followUpTemplates.length];
      if (!tmpl) continue;
      followUpRows.push({
        customerId: c.id,
        type: tmpl.type,
        content: tmpl.text(who, co),
        date: slotIn2026H1(fuSalt * 17 + j * 23 + (c.code?.length ?? 0)),
        createdBy: adminUser.id,
      });
    }
    fuSalt++;
  }

  if (followUpRows.length > 0) {
    await prisma.customerFollowUp.createMany({ data: followUpRows });
  }

  const catalogPecan = await prisma.product.findUniqueOrThrow({
    where: { companyId_sku: { companyId: company.id, sku: "PROD-001" } },
  });

  const salesDoc = await prisma.salesDocument.upsert({
    where: { companyId_type_documentNo: { companyId: company.id, type: "QUOTATION", documentNo: "QT-202603-001" } },
    create: {
      companyId: company.id,
      type: "QUOTATION",
      documentNo: "QT-202603-001",
      customerId: customer1.id,
      totalAmount: new Prisma.Decimal("1180"),
      status: "PENDING",
    },
    update: {
      customerId: customer1.id,
      totalAmount: new Prisma.Decimal("1180"),
      status: "PENDING",
    },
  });

  await prisma.salesDocumentItem.deleteMany({ where: { salesDocumentId: salesDoc.id } });
  await prisma.salesDocumentItem.create({
    data: {
      salesDocumentId: salesDoc.id,
      productId: catalogPecan.id,
      quantity: 10,
      unitPrice: new Prisma.Decimal("118"),
      discount: new Prisma.Decimal("0"),
      taxRate: new Prisma.Decimal("0"),
      total: new Prisma.Decimal("1180"),
    },
  });

  /** 預收發票（發票導出列表）：2026-03～06，客戶／SKU 與庫存流水、報價敘述一致；單號冪等 upsert */
  const piHkCustomers = await prisma.customer.findMany({
    where: {
      companyId: company.id,
      code: {
        in: [
          "HK-NUT-001",
          "HK-NUT-002",
          "HK-NUT-003",
          "HK-NUT-006",
          "HK-NUT-009",
          "HK-NUT-012",
          "HK-NUT-014",
          "HK-NUT-015",
          "HK-NUT-019",
        ],
      },
    },
    select: { id: true, code: true },
  });
  const piCustId = new Map(piHkCustomers.map((c) => [c.code, c.id]));
  for (const code of [
    "HK-NUT-001",
    "HK-NUT-002",
    "HK-NUT-003",
    "HK-NUT-006",
    "HK-NUT-009",
    "HK-NUT-012",
    "HK-NUT-014",
    "HK-NUT-015",
    "HK-NUT-019",
  ] as const) {
    if (!piCustId.has(code)) {
      throw new Error(`seed PI: missing customer ${code} (香港堅果零售種子)`);
    }
  }
  const custSeed120 = await prisma.customer.findFirst({
    where: { companyId: company.id, code: "CUST-SEED-120" },
    select: { id: true },
  });

  type PiLine = { sku: (typeof invSkus)[number]; qty: number; unit: string; total: string };
  type PiSeed = {
    documentNo: string;
    customerId: string;
    dateIso: string;
    total: string;
    status: "DRAFT" | "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
    notes: string;
    lines: PiLine[];
  };

  const piSeeds: PiSeed[] = [
    {
      documentNo: "PI-202603-8801",
      customerId: customer1.id,
      dateIso: "2026-03-06T11:20:00+08:00",
      total: "8850",
      status: "CONFIRMED",
      notes: "對應報價 QT-202603-001 後續；碧根果大宗首期預收，財務已核對入賬。",
      lines: [{ sku: "PROD-001", qty: 75, unit: "118", total: "8850" }],
    },
    {
      documentNo: "PI-202603-8802",
      customerId: piCustId.get("HK-NUT-009") as string,
      dateIso: "2026-03-14T15:40:00+08:00",
      total: "2360",
      status: "PENDING",
      notes: "觀塘公司團購；待客戶蓋回採購章後轉正式應收。",
      lines: [{ sku: "PROD-001", qty: 20, unit: "118", total: "2360" }],
    },
    {
      documentNo: "PI-202603-8803",
      customerId: thuanCustomer.id,
      dateIso: "2026-03-19T09:00:00+08:00",
      total: "56000",
      status: "CONFIRMED",
      notes: "越南客戶試單：帶殼夏威夷果 B 級，與既有發票 202500062 條款對齊（小批量）。",
      lines: [{ sku: "MAC-B-INSHELL-KG", qty: 1000, unit: "56", total: "56000" }],
    },
    {
      documentNo: "PI-202603-8804",
      customerId: piCustId.get("HK-NUT-003") as string,
      dateIso: "2026-03-28T14:05:00+08:00",
      total: "3540",
      status: "DRAFT",
      notes: "中環寫字樓茶點季度補貨（草稿）；待行政確認送貨時段。",
      lines: [{ sku: "PROD-001", qty: 30, unit: "118", total: "3540" }],
    },
    {
      documentNo: "PI-202604-8805",
      customerId: piCustId.get("HK-NUT-012") as string,
      dateIso: "2026-04-03T10:30:00+08:00",
      total: "2950",
      status: "COMPLETED",
      notes: "北角烘焙曲奇原料；已出庫並與 SEED-SO-202604-417 敘述對齊結清。",
      lines: [{ sku: "PROD-001", qty: 25, unit: "118", total: "2950" }],
    },
    ...(custSeed120
      ? ([
          {
            documentNo: "PI-202604-8806",
            customerId: custSeed120.id,
            dateIso: "2026-04-11T16:15:00+08:00",
            total: "18400",
            status: "CONFIRMED" as const,
            notes: "浦東臻選進口食品：碧根果試單，協議單價 HKD 115/kg（進博會後首單）。",
            lines: [{ sku: "PROD-001", qty: 160, unit: "115", total: "18400" }],
          },
        ] satisfies PiSeed[])
      : []),
    {
      documentNo: "PI-202604-8807",
      customerId: piCustId.get("HK-NUT-006") as string,
      dateIso: "2026-04-19T11:50:00+08:00",
      total: "1770",
      status: "CONFIRMED",
      notes: "銅鑼灣送禮混合禮袋用貨；已同步倉儲預留庫位。",
      lines: [{ sku: "PROD-001", qty: 15, unit: "118", total: "1770" }],
    },
    {
      documentNo: "PI-202604-8808",
      customerId: piCustId.get("HK-NUT-014") as string,
      dateIso: "2026-04-27T09:25:00+08:00",
      total: "4720",
      status: "PENDING",
      notes: "馬鞍山低糖系列；品管備註少鹽開心果／碧根果比例待客戶回簽。",
      lines: [{ sku: "PROD-001", qty: 40, unit: "118", total: "4720" }],
    },
    {
      documentNo: "PI-202605-8809",
      customerId: piCustId.get("HK-NUT-001") as string,
      dateIso: "2026-05-07T13:40:00+08:00",
      total: "3540",
      status: "CONFIRMED",
      notes: "九龍塘常購客戶；與 Q2 跟進記錄中「四款輪換」敘述一致。",
      lines: [{ sku: "PROD-001", qty: 30, unit: "118", total: "3540" }],
    },
    {
      documentNo: "PI-202605-8810",
      customerId: piCustId.get("HK-NUT-015") as string,
      dateIso: "2026-05-15T08:55:00+08:00",
      total: "8260",
      status: "CONFIRMED",
      notes: "深水埗家庭裝；倉儲備註與 SEED-SO-202605-518 出庫節奏銜接。",
      lines: [{ sku: "PROD-001", qty: 70, unit: "118", total: "8260" }],
    },
    {
      documentNo: "PI-202605-8811",
      customerId: customer1.id,
      dateIso: "2026-05-23T17:10:00+08:00",
      total: "1180",
      status: "CANCELLED",
      notes: "客戶改走月結框架後撤銷本預收；僅保留列表稽核痕跡。",
      lines: [{ sku: "PROD-001", qty: 10, unit: "118", total: "1180" }],
    },
    {
      documentNo: "PI-202606-8812",
      customerId: piCustId.get("HK-NUT-019") as string,
      dateIso: "2026-06-04T10:00:00+08:00",
      total: "5900",
      status: "CONFIRMED",
      notes: "東涌大宗出貨；與庫存流水 SO_SHIP 2026-06 批次敘述一致。",
      lines: [{ sku: "PROD-001", qty: 50, unit: "118", total: "5900" }],
    },
    {
      documentNo: "PI-202606-8813",
      customerId: piCustId.get("HK-NUT-002") as string,
      dateIso: "2026-06-12T14:45:00+08:00",
      total: "3960",
      status: "COMPLETED",
      notes: "沙田第一城：開心果（原味）為主；已完成對賬。",
      lines: [{ sku: "PROD-002", qty: 30, unit: "132", total: "3960" }],
    },
    {
      documentNo: "PI-202606-8814",
      customerId: thuanCustomer.id,
      dateIso: "2026-06-28T11:30:00+08:00",
      total: "120000",
      status: "DRAFT",
      notes: "半年結前追加杏仁備貨（草稿）；促銷協議價 HKD 40/kg，待法務覆核條款。",
      lines: [{ sku: "PROD-004", qty: 3000, unit: "40", total: "120000" }],
    },
  ];

  for (const def of piSeeds) {
    if (!def.customerId) continue;
    for (const line of def.lines) {
      const pid = productIdBySku.get(line.sku);
      if (!pid) throw new Error(`seed PI ${def.documentNo}: missing product ${line.sku}`);
    }

    const doc = await prisma.salesDocument.upsert({
      where: {
        companyId_type_documentNo: {
          companyId: company.id,
          type: "PROFORMA_INVOICE",
          documentNo: def.documentNo,
        },
      },
      create: {
        companyId: company.id,
        type: "PROFORMA_INVOICE",
        documentNo: def.documentNo,
        customerId: def.customerId,
        date: new Date(def.dateIso),
        totalAmount: new Prisma.Decimal(def.total),
        status: def.status,
        notes: def.notes,
      },
      update: {
        customerId: def.customerId,
        date: new Date(def.dateIso),
        totalAmount: new Prisma.Decimal(def.total),
        status: def.status,
        notes: def.notes,
      },
    });

    await prisma.salesDocumentItem.deleteMany({ where: { salesDocumentId: doc.id } });
    for (const line of def.lines) {
      const pid = productIdBySku.get(line.sku)!;
      await prisma.salesDocumentItem.create({
        data: {
          salesDocumentId: doc.id,
          productId: pid,
          quantity: line.qty,
          unitPrice: new Prisma.Decimal(line.unit),
          discount: new Prisma.Decimal("0"),
          taxRate: new Prisma.Decimal("0"),
          total: new Prisma.Decimal(line.total),
        },
      });
    }
  }

  // --- Document Rules ---
  await prisma.documentNumberRule.upsert({
    where: { companyId_documentType: { companyId: company.id, documentType: "QUOTATION" } },
    create: {
      companyId: company.id,
      documentType: "QUOTATION",
      prefix: "QT-",
      dateFormat: "YYYYMM",
      sequenceLen: 3,
      currentSeq: 1,
    },
    update: { currentSeq: 1 },
  });

  /** 公共文件數據庫：2026/03–06，與公司／庫存／請款／報價敘述對齊 */
  await seedPublicLibraryDocuments(prisma, company.id, publicLibOwnerIds);

  /** 隨機將部分公共檔複製到管理員個人網盤（供公共庫頁展示「已在個人網盤」） */
  await seedPersonalCopiesFromPublicLibrary(prisma, company.id, adminUser.id);

  /** 案件分類與管理：2026/03–06，與 QT／SEED-PO／預收／倉儲／導出敘述對齊 */
  await seedDocumentCases(prisma, company.id);

  console.log("Seed OK:", company.code);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
