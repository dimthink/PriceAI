import type { MetadataRoute } from "next";
import { getApiModelSummaries, getApiProviderSummaries } from "@/lib/api-models";
import { getApiModelDataset } from "@/lib/api-models-db";
import { getExplorerData } from "@/lib/data";
import { getOfficialPricePlanSummaries } from "@/lib/official-prices";

const siteUrl = "https://priceai.cc";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [data, apiDataset] = await Promise.all([
    getExplorerData(),
    getApiModelDataset(),
  ]);
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
    {
      url: `${siteUrl}/official-prices`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.75,
    },
    {
      url: `${siteUrl}/api-models`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.75,
    },
  ];

  const productRoutes: MetadataRoute.Sitemap = data.products.map((product) => ({
    url: `${siteUrl}/products/${product.slug}`,
    lastModified: product.latestSeenAt ? new Date(product.latestSeenAt) : now,
    changeFrequency: "hourly",
    priority: product.inStockCount > 0 ? 0.8 : 0.55,
  }));

  const officialPriceRoutes: MetadataRoute.Sitemap = getOfficialPricePlanSummaries("all").map((product) => ({
    url: `${siteUrl}/official-prices/${product.id}`,
    lastModified: product.latestFetchedAt ? new Date(product.latestFetchedAt) : now,
    changeFrequency: "daily",
    priority: 0.65,
  }));

  const apiModelRoutes: MetadataRoute.Sitemap = getApiModelSummaries("all", apiDataset).map((model) => ({
    url: `${siteUrl}/api-models/${model.id}`,
    lastModified: model.latestUpdatedAt ? new Date(model.latestUpdatedAt) : now,
    changeFrequency: "daily",
    priority: 0.65,
  }));

  const apiProviderRoutes: MetadataRoute.Sitemap = getApiProviderSummaries("all", apiDataset).map((provider) => ({
    url: `${siteUrl}/api-models/providers/${provider.id}`,
    lastModified: provider.latestUpdatedAt ? new Date(provider.latestUpdatedAt) : now,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  return [...staticRoutes, ...productRoutes, ...officialPriceRoutes, ...apiModelRoutes, ...apiProviderRoutes];
}
