import type { MetadataRoute } from "next";
import { getTransitStations } from "@/lib/api-transit-db";
import { getApiModelSummaries, getApiProviderSummaries } from "@/lib/api-models";
import { getApiModelDataset } from "@/lib/api-models-db";
import { getExplorerData } from "@/lib/data";
import { getOfficialPricePlanSummaries } from "@/lib/official-prices";
import { platformPageConfigList } from "@/lib/platform-pages";
import { shouldNoIndexProduct } from "@/lib/product-seo";

const siteUrl = "https://priceai.cc";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [data, apiDataset, transitStations] = await Promise.all([
    getExplorerData(),
    getApiModelDataset(),
    getTransitStations(),
  ]);
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/channels`,
      lastModified: data.generatedAt ? new Date(data.generatedAt) : now,
      changeFrequency: "hourly",
      priority: 0.92,
    },
    {
      url: `${siteUrl}/support`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.56,
    },
    {
      url: `${siteUrl}/commercial`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.48,
    },
    {
      url: `${siteUrl}/official-prices`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.75,
    },
    {
      url: `${siteUrl}/official-api`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.75,
    },
    {
      url: `${siteUrl}/api-transit`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.72,
    },
    {
      url: `${siteUrl}/api-transit/models`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.62,
    },
    {
      url: `${siteUrl}/api-transit/submit`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/wholesale`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    ...platformPageConfigList.map((platform) => ({
      url: `${siteUrl}/platforms/${platform.slug}`,
      lastModified: data.generatedAt ? new Date(data.generatedAt) : now,
      changeFrequency: "daily" as const,
      priority: platform.slug === "chatgpt" ? 0.78 : 0.74,
    })),
    {
      url: `${siteUrl}/guides`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.76,
    },
    {
      url: `${siteUrl}/guides/chatgpt-subscription-options`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.72,
    },
    {
      url: `${siteUrl}/guides/why-ai-subscription-prices-differ`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.74,
    },
    {
      url: `${siteUrl}/guides/how-to-subscribe-ai-officially`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.73,
    },
    {
      url: `${siteUrl}/guides/apple-id-ai-subscription`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.72,
    },
    {
      url: `${siteUrl}/guides/google-play-ai-subscription`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.72,
    },
    {
      url: `${siteUrl}/guides/visa-card-for-ai-subscription`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.71,
    },
    {
      url: `${siteUrl}/guides/ai-subscription-gift-card`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.71,
    },
    {
      url: `${siteUrl}/guides/ai-subscription-region-price-risks`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.71,
    },
    {
      url: `${siteUrl}/guides/are-ai-subscription-card-shops-reliable`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.74,
    },
    {
      url: `${siteUrl}/guides/api-transit`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.72,
    },
  ];

  const productRoutes: MetadataRoute.Sitemap = data.products
    .filter((product) => !shouldNoIndexProduct(product))
    .map((product) => ({
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
    url: `${siteUrl}/official-api/${model.id}`,
    lastModified: model.latestUpdatedAt ? new Date(model.latestUpdatedAt) : now,
    changeFrequency: "daily",
    priority: 0.65,
  }));

  const apiProviderRoutes: MetadataRoute.Sitemap = getApiProviderSummaries("all", apiDataset).map((provider) => ({
    url: `${siteUrl}/official-api/providers/${provider.id}`,
    lastModified: provider.latestUpdatedAt ? new Date(provider.latestUpdatedAt) : now,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  const transitRoutes: MetadataRoute.Sitemap = transitStations.map((station) => ({
    url: `${siteUrl}/api-transit/${station.slug}`,
    lastModified: station.lastUpdatedAt ? new Date(station.lastUpdatedAt) : now,
    changeFrequency: "daily",
    priority: 0.55,
  }));

  return [...staticRoutes, ...productRoutes, ...officialPriceRoutes, ...apiModelRoutes, ...apiProviderRoutes, ...transitRoutes];
}
