import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  buildPriceRadarBundle,
  createPriceRadarSnapshotId,
  PRICE_RADAR_PUBLIC_ORIGIN,
  PRICE_RADAR_SCHEMA_VERSION,
  type PriceRadarLatestDocument,
  type PriceRadarProductOffersSnapshot,
  type PriceRadarStoredProductSnapshot,
} from "./price-radar-contract";
import {
  readPublicApiSnapshot,
  readPublicApiSnapshotsByKind,
} from "./public-api-snapshots";
import type { ExplorerData } from "./types";

const PRICE_RADAR_BINDING = "PRICE_RADAR_BUCKET";
const PRICE_RADAR_LATEST_KEY = "latest.json";
const PRICE_RADAR_WRITE_BATCH_SIZE = 20;
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const LATEST_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=1800";

type PriceRadarBucket = {
  head: (key: string) => Promise<{
    customMetadata?: Record<string, string>;
  } | null>;
  put: (
    key: string,
    value: ArrayBuffer,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    },
  ) => Promise<unknown>;
};

type PriceRadarEnv = CloudflareEnv & {
  PRICE_RADAR_BUCKET?: PriceRadarBucket;
};

export type PriceRadarPublishResult = {
  configured: boolean;
  published: boolean;
  reason: "published" | "unchanged" | "binding_missing" | "snapshot_missing" | "unhealthy_snapshot" | "publish_failed";
  snapshotId: string | null;
  objectCount: number;
  bytes: number;
  latestUrl: string;
  message?: string;
};

export async function publishPriceRadarSnapshot(): Promise<PriceRadarPublishResult> {
  const bucket = await getPriceRadarBucket();
  if (!bucket) return resultFor("binding_missing", false);

  let snapshotId: string | null = null;
  try {
    const [explorerSnapshot, productSnapshotRows] = await Promise.all([
      readPublicApiSnapshot<ExplorerData>("explorer", "default"),
      readPublicApiSnapshotsByKind<PriceRadarProductOffersSnapshot>("product_offers", { timeoutMs: 5_000 }),
    ]);
    if (!explorerSnapshot || productSnapshotRows.length === 0) return resultFor("snapshot_missing", true);
    if (explorerSnapshot.value.degraded || explorerSnapshot.value.configured === false || explorerSnapshot.value.products.length === 0) {
      return resultFor("unhealthy_snapshot", true);
    }

    const storedSnapshots: PriceRadarStoredProductSnapshot[] = productSnapshotRows.map((snapshot) => ({
      cacheKey: snapshot.cacheKey,
      generatedAt: snapshot.generatedAt,
      value: snapshot.value,
    }));
    const resolvedSnapshotId = await createPriceRadarSnapshotId(explorerSnapshot.value, storedSnapshots);
    snapshotId = resolvedSnapshotId;
    const publishedAt = new Date().toISOString();
    const bundle = buildPriceRadarBundle({
      explorer: explorerSnapshot.value,
      productSnapshots: storedSnapshots,
      publishedAt,
      snapshotId: resolvedSnapshotId,
    });

    const current = await bucket.head(PRICE_RADAR_LATEST_KEY);
    if (current?.customMetadata?.snapshotId === resolvedSnapshotId) {
      return {
        configured: true,
        published: true,
        reason: "unchanged",
        snapshotId: resolvedSnapshotId,
        objectCount: 0,
        bytes: 0,
        latestUrl: latestUrl(),
      };
    }

    let bytes = 0;
    for (let index = 0; index < bundle.objects.length; index += PRICE_RADAR_WRITE_BATCH_SIZE) {
      const batch = bundle.objects.slice(index, index + PRICE_RADAR_WRITE_BATCH_SIZE);
      await Promise.all(batch.map(async (object) => {
        const encoded = encodeJson(object.value);
        bytes += encoded.byteLength;
        await putJson(bucket, object.key, encoded, IMMUTABLE_CACHE_CONTROL, resolvedSnapshotId);
      }));
    }

    const latest = encodeJson(bundle.latest);
    bytes += latest.byteLength;
    await putJson(bucket, PRICE_RADAR_LATEST_KEY, latest, LATEST_CACHE_CONTROL, resolvedSnapshotId);
    return {
      configured: true,
      published: true,
      reason: "published",
      snapshotId: resolvedSnapshotId,
      objectCount: bundle.objects.length + 1,
      bytes,
      latestUrl: latestUrl(),
    };
  } catch (error) {
    console.error("Price radar snapshot publish failed:", error);
    return {
      ...resultFor("publish_failed", true),
      snapshotId,
      message: error instanceof Error ? error.message : "Unknown price radar publish error.",
    };
  }
}

async function getPriceRadarBucket(): Promise<PriceRadarBucket | null> {
  try {
    const context = await getCloudflareContext({ async: true });
    return (context.env as PriceRadarEnv)[PRICE_RADAR_BINDING] || null;
  } catch {
    return null;
  }
}

async function putJson(
  bucket: PriceRadarBucket,
  key: string,
  value: ArrayBuffer,
  cacheControl: string,
  snapshotId: string,
): Promise<void> {
  await bucket.put(key, value, {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      cacheControl,
    },
    customMetadata: {
      schemaVersion: PRICE_RADAR_SCHEMA_VERSION,
      snapshotId,
      publishedAt: new Date().toISOString(),
    },
  });
}

function encodeJson(value: PriceRadarLatestDocument | object): ArrayBuffer {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`).buffer as ArrayBuffer;
}

function resultFor(
  reason: Exclude<PriceRadarPublishResult["reason"], "published" | "unchanged">,
  configured: boolean,
): PriceRadarPublishResult {
  return {
    configured,
    published: false,
    reason,
    snapshotId: null,
    objectCount: 0,
    bytes: 0,
    latestUrl: latestUrl(),
  };
}

function latestUrl(): string {
  return `${PRICE_RADAR_PUBLIC_ORIGIN}/${PRICE_RADAR_LATEST_KEY}`;
}
