import type { MetadataRoute } from "next";
import { getExplorerData } from "@/lib/data";

const siteUrl = "https://priceai.cc";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await getExplorerData();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: data.generatedAt ? new Date(data.generatedAt) : now,
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${siteUrl}/about`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];

  const productRoutes: MetadataRoute.Sitemap = data.products.map((product) => ({
    url: `${siteUrl}/products/${product.slug}`,
    lastModified: product.latestSeenAt ? new Date(product.latestSeenAt) : now,
    changeFrequency: "hourly",
    priority: product.inStockCount > 0 ? 0.8 : 0.55,
  }));

  return [...staticRoutes, ...productRoutes];
}
