import "server-only";

import { revalidatePath } from "next/cache";

const publicOfferPaths = [
  "/",
  "/platforms/chatgpt",
  "/platforms/claude",
  "/platforms/gemini",
  "/platforms/api",
  "/channels",
  "/about",
  "/sitemap.xml",
] as const;

const apiTransitPublicPaths = [
  "/api-transit",
  "/api-transit/models",
  "/sitemap.xml",
] as const;

const sponsorPublicPaths = [
  "/",
  "/channels",
  "/api-transit",
  "/api-transit/models",
  "/official-api",
  "/commercial",
  "/api/sponsor-settings",
] as const;

const communityPublicPaths = [
  "/",
  "/channels",
  "/api-transit",
  "/api-transit/submit",
  "/official-api",
  "/guides",
  "/api/community-settings",
] as const;

export function revalidatePublicOfferPaths(): string[] {
  for (const path of publicOfferPaths) {
    revalidatePath(path);
  }
  revalidatePath("/products/[id]", "page");
  return [...publicOfferPaths, "/products/[id]"];
}

export function revalidatePublicOfferPathsForProducts(
  productIds: Array<string | null | undefined>,
): string[] {
  const paths = new Set<string>([
    "/",
    "/api/explorer",
    "/api/offers",
  ]);

  for (const productId of productIds) {
    const cleanId = productId?.trim();
    if (!cleanId || cleanId.includes("/") || cleanId.includes("\\")) continue;
    paths.add(`/products/${encodeURIComponent(cleanId)}`);
    paths.add(`/api/products/${encodeURIComponent(cleanId)}/offers`);
  }

  for (const path of paths) {
    revalidatePath(path);
  }

  return [...paths];
}

export function revalidateApiTransitPublicPaths(
  slugs: Array<string | null | undefined> = [],
): string[] {
  const paths = new Set<string>(apiTransitPublicPaths);
  for (const path of apiTransitPublicPaths) {
    revalidatePath(path);
  }
  revalidatePath("/api-transit/[slug]", "page");

  for (const slug of slugs) {
    const path = apiTransitStationPath(slug);
    if (!path) continue;
    revalidatePath(path);
    paths.add(path);
  }

  return [...paths];
}

export function revalidateSponsorPublicPaths(): string[] {
  for (const path of sponsorPublicPaths) {
    revalidatePath(path);
  }
  return [...sponsorPublicPaths];
}

export function revalidateCommunityPublicPaths(): string[] {
  for (const path of communityPublicPaths) {
    revalidatePath(path);
  }
  revalidatePath("/products/[id]", "page");
  return [...communityPublicPaths, "/products/[id]"];
}

const PREWARM_TIMEOUT_MS = 8_000;

export async function prewarmPublicPaths(request: Request, paths: Iterable<string>): Promise<void> {
  const urls = publicPrewarmUrls(request, paths);
  if (!urls.length) return;

  const results = await Promise.allSettled(urls.map((url) => fetchForPrewarm(url)));
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length) {
    console.warn(`Public prewarm skipped ${failed.length} path(s).`);
  }
}

function apiTransitStationPath(slug: string | null | undefined): string | null {
  const cleanSlug = slug?.trim();
  if (!cleanSlug || cleanSlug.includes("/") || cleanSlug.includes("\\")) return null;
  return `/api-transit/${encodeURIComponent(cleanSlug)}`;
}

function publicPrewarmUrls(request: Request, paths: Iterable<string>): string[] {
  const baseUrl = publicBaseUrl(request);
  const urls = new Set<string>();

  for (const path of paths) {
    if (!path.startsWith("/") || path.includes("[") || path.includes("]")) continue;
    urls.add(new URL(path, baseUrl).toString());
  }

  return [...urls];
}

function publicBaseUrl(request: Request): URL {
  const configuredBaseUrl = process.env.CRON_PUBLIC_BASE_URL?.trim();
  const baseUrl = new URL(configuredBaseUrl || request.url);
  baseUrl.pathname = "/";
  baseUrl.search = "";
  baseUrl.hash = "";
  return baseUrl;
}

async function fetchForPrewarm(url: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PREWARM_TIMEOUT_MS);
  try {
    await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent": "PriceAI admin revalidation prewarm",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
