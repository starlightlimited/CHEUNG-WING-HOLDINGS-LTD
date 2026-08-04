import { prisma } from "@/lib/prisma";
import { getDefaultCompanyId } from "@/lib/company";
import { serializeProductForClient } from "@/lib/serialize-for-client";
import { ProductListClient } from "./product-list-client";
import { NUT_CATALOG } from "./nut-catalog";

const nutCatalogRowBySku = new Map(NUT_CATALOG.map((r) => [r.sku, r] as const));

export default async function Page() {
  const companyId = await getDefaultCompanyId();
  const raw = await prisma.product.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      sku: true,
      name: true,
      barcode: true,
      description: true,
      price: true,
      cost: true,
      attributes: true,
      updatedAt: true,
    },
  });

  /**
   * 堅果目錄 SKU：列表展示與 nut-catalog 一致（無需重跑 seed），含已清空的 BOM。
   * price/cost 必須在 Server 轉成 number，才能傳給 Client Component。
   */
  const products = raw.map((p) => {
    const row = nutCatalogRowBySku.get(p.sku);
    const base = serializeProductForClient(p);
    if (!row) return base;
    return {
      ...base,
      description: row.description,
      attributes: row.attributes,
    };
  });

  // #region agent log
  {
    const sample = products[0];
    const price = sample?.price;
    const cost = sample?.cost;
    const updatedAt = sample?.updatedAt;
    const payload = {
      sessionId: "87db0c",
      runId: "post-fix",
      hypothesisId: "A,B,C",
      location: "products/list/page.tsx:after-serialize",
      message: "product field types after serializeProductForClient",
      data: {
        productCount: products.length,
        hasSample: !!sample,
        priceType: price == null ? "null" : typeof price,
        priceCtor: price != null && typeof price === "object" ? (price as object).constructor?.name : null,
        priceIsDecimalLike:
          price != null &&
          typeof price === "object" &&
          typeof (price as { toFixed?: unknown }).toFixed === "function" &&
          typeof (price as { toNumber?: unknown }).toNumber === "function",
        costType: cost == null ? "null" : typeof cost,
        costCtor: cost != null && typeof cost === "object" ? (cost as object).constructor?.name : null,
        costIsDecimalLike:
          cost != null &&
          typeof cost === "object" &&
          typeof (cost as { toFixed?: unknown }).toFixed === "function" &&
          typeof (cost as { toNumber?: unknown }).toNumber === "function",
        updatedAtType: updatedAt == null ? "null" : typeof updatedAt,
        updatedAtIsDate: updatedAt instanceof Date,
        samplePrice: typeof price === "number" ? price : String(price),
        sampleCost: typeof cost === "number" ? cost : String(cost),
      },
      timestamp: Date.now(),
    };
    fetch("http://127.0.0.1:7400/ingest/d1cd1f78-10d6-4ca1-8b6b-cd229733bede", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "87db0c" },
      body: JSON.stringify(payload),
    }).catch(() => {});
    try {
      const { appendFileSync } = require("fs") as typeof import("fs");
      const { join } = require("path") as typeof import("path");
      appendFileSync(join(process.cwd(), "debug-87db0c.log"), JSON.stringify(payload) + "\n");
    } catch {
      /* ignore */
    }
  }
  // #endregion

  return <ProductListClient products={products} />;
}
