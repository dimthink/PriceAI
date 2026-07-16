import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PriceAiVersionEnv = CloudflareEnv & {
  PRICEAI_VERSION?: {
    id?: string;
    tag?: string;
    timestamp?: string;
  };
};

export async function GET() {
  let version: PriceAiVersionEnv["PRICEAI_VERSION"] | null = null;

  try {
    const context = await getCloudflareContext({ async: true });
    version = (context.env as PriceAiVersionEnv).PRICEAI_VERSION;
  } catch {
    version = null;
  }

  const versionId = typeof version?.id === "string" ? version.id : null;
  const versionTag = typeof version?.tag === "string" ? version.tag : null;

  return Response.json(
    {
      ok: Boolean(versionId),
      platform: versionId ? "cloudflare" : "unknown",
      versionId,
      versionTag,
    },
    {
      status: versionId ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
