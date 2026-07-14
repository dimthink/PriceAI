export const infrastructureRuntimeProfile = {
  productionTarget: "Cloudflare Workers + OpenNext",
  workerName: "priceai-cloudflare-poc",
  incrementalCache: "R2 Standard",
  revalidationQueue: "Durable Object Queue",
  regionalCacheMode: "short-lived",
  regionalCacheMaxAgeSeconds: 60,
  cacheInterceptionEnabled: false,
  publicAssetCacheRoutes: [
    "/api/sponsor-assets",
    "/api/api-transit/logo",
  ],
  observability: {
    enabled: true,
    successSamplingConfigured: false,
  },
} as const;

export const OPEN_NEXT_REGIONAL_CACHE_MODE = infrastructureRuntimeProfile.regionalCacheMode;
