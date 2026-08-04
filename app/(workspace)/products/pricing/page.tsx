import { prisma } from "@/lib/prisma";
import { getDefaultCompanyId } from "@/lib/company";
import { serializeProductForClient } from "@/lib/serialize-for-client";
import { PricingClient } from "./pricing-client";

export default async function Page() {
  const companyId = await getDefaultCompanyId();
  const raw = await prisma.product.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      sku: true,
      name: true,
      price: true,
      cost: true,
      attributes: true,
    },
  });

  const products = raw.map(serializeProductForClient);

  // #region agent log
  {
    const sample = products[0];
    const payload = {
      sessionId: "87db0c",
      runId: "post-fix",
      hypothesisId: "pricing-A",
      location: "products/pricing/page.tsx:after-serialize",
      message: "pricing products after serializeProductForClient",
      data: {
        productCount: products.length,
        priceType: sample ? typeof sample.price : "none",
        costType: sample ? typeof sample.cost : "none",
        priceIsDecimalLike:
          sample?.price != null &&
          typeof sample.price === "object" &&
          typeof (sample.price as { toNumber?: unknown }).toNumber === "function",
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

  return <PricingClient products={products} />;
}
