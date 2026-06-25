import { canonicalCatalog, classifyOffer } from "@/lib/catalog";
import { getAdminPasswordFromRequest } from "@/lib/admin";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { clearPublicDataCache, markPublicApiSnapshotsDirty } from "@/lib/data";
import { requireAdminPassword } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    requireAdminPassword(getAdminPasswordFromRequest(request));

    const supabase = getSupabaseServerClient();
    if (!supabase) throw new Error("Supabase 尚未配置，无法重建分类。");

    const now = new Date().toISOString();
    const productRows = canonicalCatalog.map((product) => ({
      id: product.id,
      slug: product.slug,
      display_name: product.displayName,
      platform: product.platform,
      product_type: product.productType,
      spec: product.spec,
      summary: product.summary,
      aliases: product.aliases,
      is_active: true,
      updated_at: now,
    }));

    const { error: productError } = await supabase.from("canonical_products").upsert(productRows);
    if (productError) throw productError;

    const { data: existingProducts, error: existingError } = await supabase
      .from("canonical_products")
      .select("id");
    if (existingError) throw existingError;

    const activeIds = new Set(canonicalCatalog.map((product) => product.id));
    const inactiveIds = (existingProducts || [])
      .map((row) => String(row.id))
      .filter((id) => !activeIds.has(id));

    for (const ids of chunks(inactiveIds, 100)) {
      const { error } = await supabase
        .from("canonical_products")
        .update({ is_active: false, updated_at: now })
        .in("id", ids);
      if (error) throw error;
    }

    let updatedCount = 0;
    const distribution = new Map<string, number>();

    const groupedOfferIds = new Map<string, { canonicalProductId: string; categorySlug: string; ids: string[] }>();

    await forEachRawOfferPage(supabase, (rows) => {
      for (const row of rows) {
        const canonical = classifyOffer(String(row.source_title || ""), {
          tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
          categorySlug: row.category_slug ? String(row.category_slug) : null,
          price: typeof row.price === "number" ? row.price : null,
        });
        distribution.set(canonical.id, (distribution.get(canonical.id) || 0) + 1);
        const key = `${canonical.id}\u0000${canonical.platform}`;
        const group = groupedOfferIds.get(key) || {
          canonicalProductId: canonical.id,
          categorySlug: canonical.platform,
          ids: [],
        };
        group.ids.push(String(row.id));
        groupedOfferIds.set(key, group);
      }
    });

    for (const group of groupedOfferIds.values()) {
      for (const ids of chunks(group.ids, 100)) {
        const { error } = await supabase
          .from("raw_offers")
          .update({
            canonical_product_id: group.canonicalProductId,
            category_slug: group.categorySlug,
            updated_at: now,
          })
          .in("id", ids);

        if (error) throw error;
        updatedCount += ids.length;
      }
    }

    clearPublicDataCache();
    const snapshotRefreshQueued = await markPublicApiSnapshotsDirty("admin reclassify", { full: true });

    return Response.json({
      ok: true,
      productCount: canonicalCatalog.length,
      updatedCount,
      inactiveProductCount: inactiveIds.length,
      snapshotRefreshQueued,
      distribution: Object.fromEntries(distribution.entries()),
    });
  } catch (error) {
    logApiError("admin reclassify", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "重建分类失败。") },
      { status: 500 },
    );
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseServerClient>>;
type ReclassifyOfferRow = {
  id: unknown;
  source_title: unknown;
  tags: unknown;
  category_slug: unknown;
  price: unknown;
};

async function forEachRawOfferPage(
  supabase: SupabaseClient,
  onPage: (rows: ReclassifyOfferRow[]) => void,
): Promise<void> {
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("raw_offers")
      .select("id,source_title,tags,category_slug,price")
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw error;

    const rows = (data || []) as ReclassifyOfferRow[];
    if (!rows.length) break;

    onPage(rows);
    if (rows.length < pageSize) break;
  }
}
