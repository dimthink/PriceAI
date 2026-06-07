import { PlatformLandingPage } from "@/components/PlatformLandingPage";
import { getExplorerData } from "@/lib/data";
import { platformPageConfigs } from "@/lib/platform-pages";
import type { ExplorerProductSummary } from "@/lib/types";

export const revalidate = 300;
export const metadata = platformPageConfigs.api.metadata;

export default async function ApiPlatformPage() {
  const data = await getExplorerData();
  const config = platformPageConfigs.api;
  const productIds: readonly string[] = config.productIds;
  const products = data.products
    .filter((product) => productIds.includes(product.id))
    .sort((a, b) => compareConfiguredProduct(a, b, productIds));

  return <PlatformLandingPage config={config} products={products} />;
}

function compareConfiguredProduct(a: ExplorerProductSummary, b: ExplorerProductSummary, productIds: readonly string[]): number {
  const aIndex = productIds.indexOf(a.id);
  const bIndex = productIds.indexOf(b.id);
  return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
}
