import { prisma } from "@/lib/prisma";
import { getDefaultCompanyId } from "@/lib/company";
import { serializeProductForClient } from "@/lib/serialize-for-client";
import { ExportClient } from "./export-client";

export default async function Page() {
  const companyId = await getDefaultCompanyId();
  const raw = await prisma.product.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
  });

  const products = raw.map(serializeProductForClient);

  return <ExportClient products={products} />;
}
