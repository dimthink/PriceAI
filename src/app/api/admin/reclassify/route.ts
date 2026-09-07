import { OFFER_CLASSIFICATION_VERSION, canonicalCatalog, classifyOffer } from "@/lib/catalog";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { clearPublicDataCache, markPublicApiSnapshotsDirty } from "@/lib/data";
import { requireAdminRequest } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase";
import { categoryFeedbackMatchesCurrentClassification } from "@/lib/trust-risk";

export async function POST(request: Request) {
  try {
    await requireAdminRequest(request);

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

    let scannedCount = 0;
    let updatedCount = 0;
    const distribution = new Map<string, number>();

    const groupedOfferIds = new Map<string, { canonicalProductId: string; categorySlug: string; ids: string[] }>();
    const classifiedProductByOfferId = new Map<string, string>();

    await forEachRawOfferPage(supabase, (rows) => {
      scannedCount += rows.length;
      for (const row of rows) {
        const canonical = classifyOffer(String(row.source_title || ""), {
          tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
        });
        classifiedProductByOfferId.set(String(row.id), canonical.id);
        distribution.set(canonical.id, (distribution.get(canonical.id) || 0) + 1);
        if (String(row.canonical_product_id || "") === canonical.id && String(row.category_slug || "") === canonical.platform) {
          continue;
        }
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

    const reconciledFeedbackCount = await reconcilePendingCategoryFeedback(
      supabase,
      classifiedProductByOfferId,
      now,
    );

    clearPublicDataCache();
    const snapshotRefreshQueued = await markPublicApiSnapshotsDirty("admin reclassify", { full: true });

    return Response.json({
      ok: true,
      productCount: canonicalCatalog.length,
      scannedCount,
      updatedCount,
      reconciledFeedbackCount,
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

async function reconcilePendingCategoryFeedback(
  supabase: SupabaseClient,
  classifiedProductByOfferId: Map<string, string>,
  reviewedAt: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("offer_feedback")
    .select("id,offer_id,product_id,product_slug,issue_dimension,expected_product_id")
    .eq("status", "pending")
    .eq("reason", "wrong_category")
    .limit(1000);
  if (error) throw error;

  const resolvedIds = (data || []).flatMap((row) => {
    const currentProductId = classifiedProductByOfferId.get(String(row.offer_id || ""));
    const expectedProductId = row.expected_product_id ? String(row.expected_product_id) : null;
    const snapshotProductId = row.product_id ? String(row.product_id) : row.product_slug ? String(row.product_slug) : null;
    return categoryFeedbackMatchesCurrentClassification({
      issueDimension: row.issue_dimension ? String(row.issue_dimension) : null,
      expectedProductId,
      snapshotProductId,
      currentProductId,
    }) ? [String(row.id)] : [];
  });

  for (const ids of chunks(resolvedIds, 100)) {
    const { error: updateError } = await supabase
      .from("offer_feedback")
      .update({
        status: "resolved",
        reviewed_at: reviewedAt,
        reviewer_note: `分类规则 ${OFFER_CLASSIFICATION_VERSION} 重建后已自动修正。`,
        verification_status: "auto_fixed",
        verification_message: "当前标准商品分类已与用户期望或反馈快照修正方向一致。",
      })
      .in("id", ids);
    if (updateError) throw updateError;
  }

  return resolvedIds.length;
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
  canonical_product_id: unknown;
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
      .select("id,source_title,tags,category_slug,canonical_product_id")
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw error;

    const rows = (data || []) as ReclassifyOfferRow[];
    if (!rows.length) break;

    onPage(rows);
    if (rows.length < pageSize) break;
  }
}
