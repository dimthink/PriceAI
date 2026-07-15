import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase";

export type ExternalApiBudgetClaim = {
  allowed: boolean;
  service: string;
  date: string;
  used: number;
  limit: number;
  remaining: number;
};

export async function claimExternalApiDailyBudget(service: string, dailyLimit: number, units = 1): Promise<ExternalApiBudgetClaim> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 未配置，无法领取第三方 API 预算。");

  const { data, error } = await supabase.rpc("claim_external_api_daily_budget", {
    p_service: service,
    p_daily_limit: dailyLimit,
    p_units: units,
  });
  if (error) throw error;
  const row = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return {
    allowed: row.allowed === true,
    service: String(row.service || service),
    date: String(row.date || ""),
    used: Number(row.used || 0),
    limit: Number(row.limit || dailyLimit),
    remaining: Number(row.remaining || 0),
  };
}
