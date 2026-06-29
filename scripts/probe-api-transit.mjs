#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { safeFetch } from "./safe-fetch.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const configPath = path.join(repoRoot, "config", "api-transit-probes.json");
const envPath = path.join(repoRoot, ".env.local");

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_TARGET_LIMIT = 4;
const MAX_MODELS_SNAPSHOT = 200;
const AVAILABILITY_SAMPLE_LOOKBACK_LIMIT = 2000;
const userAgent = "Mozilla/5.0 PriceAI/1.0 APITransitProbe";
let cachedFileEnv = null;

const defaultTargets = [
  {
    family: "claude",
    standardModel: "Claude Sonnet 4.6",
    candidates: [
      "claude-sonnet-4.6",
      "claude-sonnet-4-6",
      "claude-4.6-sonnet",
      "claude-4-sonnet",
      "claude-sonnet-4",
    ],
    keywords: ["claude", "sonnet"],
  },
  {
    family: "claude",
    standardModel: "Claude Opus 4.6",
    candidates: [
      "claude-opus-4.6",
      "claude-opus-4-6",
      "claude-4.6-opus",
      "claude-opus-4",
    ],
    keywords: ["claude", "opus"],
  },
  {
    family: "claude",
    standardModel: "Claude Opus 4.7",
    candidates: ["claude-opus-4.7", "claude-opus-4-7", "claude-4.7-opus"],
    keywords: ["claude", "opus", "4.7"],
  },
  {
    family: "claude",
    standardModel: "Claude Opus 4.8",
    candidates: ["claude-opus-4.8", "claude-opus-4-8", "claude-4.8-opus"],
    keywords: ["claude", "opus", "4.8"],
  },
  {
    family: "gpt",
    standardModel: "GPT 5.5",
    candidates: ["gpt-5.5", "gpt-5-5"],
    keywords: ["gpt", "5.5"],
  },
  {
    family: "gpt",
    standardModel: "GPT 5.4",
    candidates: ["gpt-5.4", "gpt-5-4"],
    keywords: ["gpt", "5.4"],
  },
  {
    family: "gemini",
    standardModel: "Gemini 3.5 Flash",
    candidates: ["gemini-3.5-flash", "gemini-3-5-flash", "google/gemini-3.5-flash"],
    keywords: ["gemini", "3.5", "flash"],
  },
  {
    family: "gemini",
    standardModel: "Gemini 3.1 Pro",
    candidates: [
      "gemini-3.1-pro",
      "gemini-3-1-pro",
      "gemini-3.1-pro-preview",
      "google/gemini-3.1-pro-preview",
    ],
    keywords: ["gemini", "3.1", "pro"],
  },
  {
    family: "glm",
    standardModel: "GLM-5.2",
    candidates: ["glm-5.2", "glm-5-2", "zhipu/glm-5.2"],
    keywords: ["glm", "5.2"],
  },
  {
    family: "glm",
    standardModel: "GLM-5.1",
    candidates: ["glm-5.1", "glm-5-1", "zhipu/glm-5.1"],
    keywords: ["glm", "5.1"],
  },
  {
    family: "deepseek",
    standardModel: "DeepSeek V4 Flash",
    candidates: ["deepseek-v4-flash", "deepseek-v4-flash-chat", "deepseek/deepseek-v4-flash"],
    keywords: ["deepseek", "v4", "flash"],
  },
  {
    family: "deepseek",
    standardModel: "DeepSeek V4 Pro",
    candidates: ["deepseek-v4-pro", "deepseek-v4-pro-chat", "deepseek/deepseek-v4-pro"],
    keywords: ["deepseek", "v4", "pro"],
  },
];

if (isCli()) {
  const options = normalizeOptions(parseArgs(process.argv.slice(2)));

  try {
    const result = await probeApiTransitStations(options);
    printSummary(result);
    if (options.dryRun || options.verbose) {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }
}

export async function probeApiTransitStations(options = {}) {
  options = normalizeOptions(options);
  const startedAt = new Date().toISOString();
  const selectedProfiles = selectProfiles(await loadProbeProfilesForRun(options), options);
  const disabledProfiles = selectedProfiles.filter((profile) => !profile.enabled);
  const profiles = selectedProfiles.filter((profile) => profile.enabled);
  const supabase = getSupabaseClient();
  const stationIds = profiles.map((profile) => profile.stationId);
  const dbOfferModels = supabase ? await listOfferModels(supabase, stationIds) : new Map();
  const dbCredentials =
    supabase && options.dbCredentials
      ? await listCredentialApiKeys(supabase, stationIds)
      : emptyCredentialStore();
  const runs = [];
  const rollups = [];
  const skipped = [];

  for (const profile of disabledProfiles) {
    skipped.push(buildSkippedProfile(profile, "profile_disabled"));
  }

  for (const profile of profiles) {
    const envApiKey = options.env?.[profile.apiKeyEnv] || envValue(profile.apiKeyEnv);
    const credential = envApiKey
      ? { apiKey: envApiKey, source: "env", credentialId: null }
      : selectCredentialForProfile(dbCredentials, profile);
    const apiKey = credential?.apiKey || "";
    if (!apiKey) {
      skipped.push(buildSkippedProfile(profile, dbCredentials.unavailableReason || "missing_api_key"));
      continue;
    }

    const run = await probeProfile(profile, {
      apiKey,
      credentialSource: credential.source,
      credentialId: credential.credentialId,
      offerModels: dbOfferModels.get(profile.stationId) || [],
      targetLimit: profile.targetLimit || options.targetLimit,
      skipCompletions: options.skipCompletions,
      timeoutMs: options.timeoutMs,
    });

    runs.push(run);

    if ((options.post || options.db) && !options.dryRun) {
      if (!supabase) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for --post/--db.");
      await upsertRows(supabase, "api_transit_detection_runs", [run.row], { onConflict: "id" });
      await upsertAvailabilitySamples(supabase, run);
      if (credential.credentialId) await markCredentialUsed(supabase, credential.credentialId);
      rollups.push(await refreshAvailabilityRollup(supabase, profile.stationId));
    }
  }

  return {
    dryRun: Boolean(options.dryRun),
    post: Boolean(options.post || options.db),
    source: "api_transit_api_probe",
    startedAt,
    finishedAt: new Date().toISOString(),
    counts: {
      profiles: profiles.length,
      selectedProfiles: selectedProfiles.length,
      probed: runs.length,
      skipped: skipped.length,
      successfulRuns: runs.filter((run) => run.row.status === "success").length,
      failedRuns: runs.filter((run) => run.row.status === "failed").length,
    },
    skipped,
    runs,
    rollups,
  };
}

async function probeProfile(profile, options) {
  const startedAt = new Date().toISOString();
  const baseUrl = normalizeApiBaseUrl(profile.apiBaseUrl);
  const modelList = await probeModelList(profile, baseUrl, options);
  const availableModels = modelList.ok ? modelList.models : [];
  const targets = selectProbeTargets({
    profileFamily: inferProbeProfileFamily(profile),
    configuredTargets: profile.targets || [],
    offerModels: options.offerModels,
    availableModels,
    targetLimit: options.targetLimit,
    targetPriority: profile.targetPriority,
  });

  const targetResults = [];
  if (modelList.ok && !options.skipCompletions) {
    for (const target of targets) {
      if (!target.modelId) {
        targetResults.push({
          family: target.family,
          standardModel: target.standardModel,
          groupName: target.groupName || null,
          accountPool: target.accountPool || null,
          channelType: target.channelType || null,
          configuredModelId: null,
          ok: false,
          skipped: true,
          errorType: "model_not_found",
          message: "模型列表中未匹配到可探测模型。",
          latencyMs: null,
          checkedAt: new Date().toISOString(),
        });
        continue;
      }

      targetResults.push(await probeCompletion(profile, baseUrl, target, options));
    }
  }

  const attemptedTargetResults = targetResults.filter((item) => !item.skipped);
  const okTargets = attemptedTargetResults.filter((item) => item.ok).length;
  const status = runStatus({
    modelListOk: modelList.ok,
    modelCount: availableModels.length,
    attemptedTargets: attemptedTargetResults.length,
    okTargets,
    skippedTargets: targetResults.length - attemptedTargetResults.length,
    skipCompletions: options.skipCompletions,
  });
  const firstError =
    modelList.ok
      ? targetResults.find((item) => item.message)?.message || null
      : modelList.message || "模型列表探测失败。";

  const finishedAt = new Date().toISOString();
  const row = {
    id: stableId("api-transit-probe-run", profile.profileId || profile.stationId, startedAt),
    station_id: profile.stationId,
    run_type: "api_probe",
    status,
    model_count: availableModels.length,
    offer_count: attemptedTargetResults.length,
    error_message: status === "success" ? null : firstError,
    source_url: baseUrl,
    started_at: startedAt,
    finished_at: finishedAt,
    raw_snapshot: {
      protocol: profile.protocol,
      apiKeyEnv: profile.apiKeyEnv,
      modelList: {
        ok: modelList.ok,
        status: modelList.status,
        latencyMs: modelList.latencyMs,
        message: modelList.message,
      },
      availableModelIds: availableModels.slice(0, MAX_MODELS_SNAPSHOT),
      targetResults,
    },
    logs: {
      protocol: profile.protocol,
      profileId: profile.profileId || null,
      apiKeyEnv: profile.apiKeyEnv,
      credentialSource: options.credentialSource || "env",
      credentialId: options.credentialId || null,
      selectedTargets: targets,
      targetLimit: options.targetLimit,
      skipCompletions: Boolean(options.skipCompletions),
    },
  };

  const output = {
    stationId: profile.stationId,
    status,
    modelCount: row.model_count,
    attemptedTargets: row.offer_count,
    okTargets,
    startedAt,
    finishedAt,
    row,
  };
  output.availabilitySamples = availabilitySamplesFromProbe({
    runId: row.id,
    stationId: profile.stationId,
    modelList,
    targetResults,
    checkedAt: finishedAt || startedAt,
  });
  return output;
}

async function probeModelList(profile, baseUrl, options) {
  const started = Date.now();
  try {
    const response = await fetchJson(`${baseUrl}/models`, {
      timeoutMs: options.timeoutMs,
      headers: authHeaders(profile, options.apiKey),
    });
    return {
      ok: true,
      status: response.status,
      latencyMs: Date.now() - started,
      models: normalizeModelIds(response.json),
      message: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: error.status || null,
      latencyMs: Date.now() - started,
      models: [],
      message: errorMessage(error),
    };
  }
}

async function probeCompletion(profile, baseUrl, target, options) {
  const started = Date.now();
  const checkedAt = new Date().toISOString();

  try {
    const endpoint = profile.protocol === "anthropic_compatible" ? `${baseUrl}/messages` : `${baseUrl}/chat/completions`;
    const response = await fetchJson(endpoint, {
      timeoutMs: options.timeoutMs,
      method: "POST",
      headers: {
        ...authHeaders(profile, options.apiKey),
        "content-type": "application/json",
      },
      body: JSON.stringify(completionBody(profile, target.modelId)),
    });

    return {
      family: target.family,
      standardModel: target.standardModel,
      groupName: target.groupName || null,
      accountPool: target.accountPool || null,
      channelType: target.channelType || null,
      configuredModelId: target.modelId,
      ok: true,
      skipped: false,
      status: response.status,
      errorType: null,
      message: null,
      latencyMs: Date.now() - started,
      checkedAt,
    };
  } catch (error) {
    return {
      family: target.family,
      standardModel: target.standardModel,
      groupName: target.groupName || null,
      accountPool: target.accountPool || null,
      channelType: target.channelType || null,
      configuredModelId: target.modelId,
      ok: false,
      skipped: false,
      status: error.status || null,
      errorType: classifyProbeError(error),
      message: errorMessage(error),
      latencyMs: Date.now() - started,
      checkedAt,
    };
  }
}

function selectProbeTargets(input) {
  const configuredTargets = normalizeConfiguredTargets(input.configuredTargets);
  const profileFamily = normalizeFamily(input.profileFamily);
  const targetPriority = stringValue(input.targetPriority);
  const priorityTargets =
    targetPriority === "latest_highest_available" || targetPriority === "last_available"
      ? configuredTargets.toReversed()
      : configuredTargets;
  const dbTargets = normalizeDbTargets(input.offerModels);
  const merged = [...priorityTargets, ...dbTargets, ...defaultTargets].filter(
    (target) => !profileFamily || target.family === profileFamily,
  );
  const byTargetKey = new Map();

  for (const target of merged) {
    const key = probeTargetKey(target);
    if (!target.standardModel || byTargetKey.has(key)) continue;
    byTargetKey.set(key, {
      family: target.family,
      standardModel: target.standardModel,
      groupName: target.groupName || null,
      accountPool: target.accountPool || null,
      channelType: target.channelType || null,
      modelId: matchAvailableModel(input.availableModels, target),
      candidates: target.candidates || [],
      keywords: target.keywords || [],
    });
  }

  const targets = Array.from(byTargetKey.values());
  const orderedTargets = input.availableModels?.length
    ? [...targets.filter((target) => target.modelId), ...targets.filter((target) => !target.modelId)]
    : targets;

  return orderedTargets.slice(0, input.targetLimit || DEFAULT_TARGET_LIMIT);
}

function normalizeConfiguredTargets(targets) {
  if (!Array.isArray(targets)) return [];
  return targets
    .map((target) => ({
      family: normalizeFamily(target.family || target.standardModel),
      standardModel: String(target.standardModel || ""),
      groupName: stringValue(target.groupName || target.group_name),
      accountPool: stringValue(target.accountPool || target.account_pool),
      channelType: stringValue(target.channelType || target.channel_type),
      candidates: stringArray(target.candidates || target.modelIds),
      keywords: stringArray(target.keywords),
    }))
    .filter((target) => target.family && target.standardModel);
}

function inferProbeProfileFamily(profile) {
  const explicitFamily = normalizeFamily(profile.family || profile.profileId || profile.apiKeyEnv || profile.groupName);
  if (explicitFamily) return explicitFamily;

  const configuredFamilies = new Set(normalizeConfiguredTargets(profile.targets).map((target) => target.family));
  return configuredFamilies.size === 1 ? Array.from(configuredFamilies)[0] : null;
}

function normalizeDbTargets(offerModels) {
  if (!Array.isArray(offerModels)) return [];
  return offerModels
    .map((offer) => ({
      family: normalizeFamily(offer.family || offer.standard_model || offer.standardModel),
      standardModel: String(offer.standard_model || offer.standardModel || ""),
      groupName: stringValue(offer.group_name || offer.groupName),
      accountPool: stringValue(offer.account_pool || offer.accountPool),
      channelType: stringValue(offer.channel_type || offer.channelType),
      candidates: stringArray([offer.raw_model_name, offer.rawModelName]),
      keywords: keywordsForStandardModel(offer.standard_model || offer.standardModel),
    }))
    .filter((target) => target.family && target.standardModel);
}

function probeTargetKey(target) {
  return [
    normalizeLooseToken(target.family),
    normalizeLooseToken(target.standardModel),
    normalizeLooseToken(target.groupName || target.accountPool || target.channelType || "default"),
  ].join("|");
}

function matchAvailableModel(availableModels, target) {
  const models = availableModels.map((model) => String(model || "")).filter(Boolean);
  if (!models.length) return target.candidates?.[0] || null;

  for (const candidate of target.candidates || []) {
    const exact = models.find((model) => normalizeModelId(model) === normalizeModelId(candidate));
    if (exact) return exact;
  }

  for (const candidate of target.candidates || []) {
    const fuzzy = models.find((model) => normalizeModelId(model).includes(normalizeModelId(candidate)));
    if (fuzzy) return fuzzy;
  }

  const keywords = target.keywords || keywordsForStandardModel(target.standardModel);
  if (keywords.length) {
    const keywordMatch = models.find((model) => {
      const normalized = normalizeModelId(model);
      return keywords.every((keyword) => normalized.includes(normalizeModelId(keyword)));
    });
    if (keywordMatch) return keywordMatch;
  }

  return null;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));

  try {
    const response = await safeFetch(url, {
      method: options.method || "GET",
      signal: controller.signal,
      headers: {
        accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
        "user-agent": userAgent,
        ...(options.headers || {}),
      },
      body: options.body,
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!response.ok) {
      const error = new Error(extractErrorMessage(json) || `HTTP ${response.status}`);
      error.status = response.status;
      error.body = safeTextPreview(text);
      throw error;
    }

    return { status: response.status, json };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("请求超时。");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function completionBody(profile, modelId) {
  if (profile.protocol === "anthropic_compatible") {
    return {
      model: modelId,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    };
  }

  return {
    model: modelId,
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 1,
    temperature: 0,
    stream: false,
  };
}

function authHeaders(profile, apiKey) {
  if (profile.protocol === "anthropic_compatible") {
    return {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
  }

  return {
    authorization: `Bearer ${apiKey}`,
  };
}

async function refreshAvailabilityRollup(supabase, stationId) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [samplesResult, offerRows, stationFirstCheckedAt] = await Promise.all([
    supabase
      .from("api_transit_availability_samples")
      .select("scope,standard_model,group_name,ok,checked_at")
      .eq("station_id", stationId)
      .gte("checked_at", since)
      .order("checked_at", { ascending: false })
      .limit(AVAILABILITY_SAMPLE_LOOKBACK_LIMIT),
    readOfferRowsForAvailabilityRollup(supabase, stationId),
    readStationFirstCheckedAt(supabase, stationId),
  ]);

  if (samplesResult.error) throw samplesResult.error;

  const stationSamples = [];
  const samplesByOfferKey = new Map();
  const legacySamplesByModel = new Map();
  const offerGroupsByModel = groupOfferRowsByModel(offerRows);
  const activeOfferScope = buildActiveOfferScope(offerRows);
  const stationWindow = { first: null, last: null };

  for (const row of dbRows(samplesResult.data)) {
    const checkedAt = stringValue(row.checked_at);
    const sample = { ok: Boolean(row.ok), checkedAt };
    const scope = stringValue(row.scope);

    if (scope === "station") {
      if (!availabilitySampleMatchesActiveOfferScope(row, activeOfferScope)) continue;
      stationSamples.push(sample);
      extendSampleWindow(stationWindow, checkedAt);
      continue;
    }

    if (scope !== "offer") continue;
    const standardModel = stringValue(row.standard_model);
    if (!standardModel) continue;
    if (!availabilitySampleMatchesActiveOfferScope(row, activeOfferScope)) continue;
    extendSampleWindow(stationWindow, checkedAt);
    const groupName = stringValue(row.group_name);
    if (!groupName) {
      const existing = legacySamplesByModel.get(standardModel) || [];
      existing.push(sample);
      legacySamplesByModel.set(standardModel, existing);
      continue;
    }
    const key = offerAvailabilityKey(standardModel, groupName);
    const existing = samplesByOfferKey.get(key) || [];
    existing.push(sample);
    samplesByOfferKey.set(key, existing);
  }

  const stationAvailability = summarizeSamples(stationSamples);
  const stationUpdate = {
    availability_seven_day_rate: stationAvailability.rate,
    availability_seven_day_samples: stationAvailability.samples,
    availability_first_checked_at: stationAvailability.samples ? stationFirstCheckedAt || stationWindow.first : null,
    availability_last_checked_at: stationAvailability.samples ? stationWindow.last : null,
    availability_note: availabilityNote("站点", stationAvailability),
    last_updated_at: new Date().toISOString(),
  };
  const { error: stationError } = await updateAvailabilityRollup(
    supabase.from("api_transit_stations").update(stationUpdate).eq("id", stationId),
    supabase.from("api_transit_stations").update(removeFields(stationUpdate, ["availability_first_checked_at"])).eq("id", stationId),
  );
  if (stationError) throw stationError;

  const offerRollups = [];
  for (const offer of offerRows) {
    const standardModel = stringValue(offer.standard_model);
    const groupName = stringValue(offer.group_name);
    if (!standardModel) continue;

    const key = offerAvailabilityKey(standardModel, groupName);
    const samples =
      samplesByOfferKey.get(key) ||
      legacySamplesForOffer(legacySamplesByModel, offerGroupsByModel, standardModel) ||
      [];
    const availability = summarizeSamples(samples);
    const offerWindow = sampleWindow(samples);
    const existingOfferFirstCheckedAt = stringValue(offer.availability_first_checked_at);
    const offerUpdate = {
      availability_seven_day_rate: availability.rate,
      availability_seven_day_samples: availability.samples,
      availability_first_checked_at: availability.samples ? existingOfferFirstCheckedAt || offerWindow.first : null,
      availability_last_checked_at: availability.samples ? offerWindow.last : null,
      availability_note: availabilityNote(targetGroupLabel(standardModel, groupName), availability),
    };
    const { error: offerError } = await updateAvailabilityRollup(
      withOfferAvailabilityFilter(supabase.from("api_transit_offers").update(offerUpdate), stationId, standardModel, groupName),
      withOfferAvailabilityFilter(
        supabase.from("api_transit_offers").update(removeFields(offerUpdate, ["availability_first_checked_at"])),
        stationId,
        standardModel,
        groupName,
      ),
    );
    if (offerError) throw offerError;
    offerRollups.push({ standardModel, groupName: groupName || null, ...availability });
  }

  return {
    stationId,
    station: stationAvailability,
    offers: offerRollups,
    lastCheckedAt: stationWindow.last,
  };
}

function summarizeSamples(samples) {
  const valid = samples.filter((sample) => sample && typeof sample.ok === "boolean");
  const success = valid.filter((sample) => sample.ok).length;
  return {
    rate: valid.length ? round(success / valid.length, 4) : null,
    samples: valid.length,
    success,
  };
}

async function readOfferRowsForAvailabilityRollup(supabase, stationId) {
  const { data, error } = await supabase
    .from("api_transit_offers")
    .select("standard_model,group_name,status,availability_first_checked_at")
    .eq("station_id", stationId)
    .in("status", ["active", "needs_review"]);
  if (!error) return dbRows(data);
  if (!isMissingColumnError(error, "availability_first_checked_at")) throw error;

  const fallback = await supabase
    .from("api_transit_offers")
    .select("standard_model,group_name,status")
    .eq("station_id", stationId)
    .in("status", ["active", "needs_review"]);
  if (fallback.error) throw fallback.error;
  return dbRows(fallback.data);
}

async function readStationFirstCheckedAt(supabase, stationId) {
  const { data, error } = await supabase
    .from("api_transit_stations")
    .select("availability_first_checked_at")
    .eq("id", stationId)
    .limit(1);
  if (!error) return stringValue(data?.[0]?.availability_first_checked_at);
  if (isMissingColumnError(error, "availability_first_checked_at")) return null;
  throw error;
}

function withOfferAvailabilityFilter(query, stationId, standardModel, groupName) {
  const filtered = query.eq("station_id", stationId).eq("standard_model", standardModel);
  return groupName ? filtered.eq("group_name", groupName) : filtered.is("group_name", null);
}

async function updateAvailabilityRollup(query, fallbackQuery) {
  const result = await query;
  if (result.error && isMissingColumnError(result.error, "availability_first_checked_at")) {
    return await fallbackQuery;
  }
  return result;
}

function removeFields(row, fieldNames) {
  const next = { ...row };
  for (const fieldName of fieldNames) delete next[fieldName];
  return next;
}

function sampleWindow(samples) {
  const checkedTimes = samples
    .map((sample) => stringValue(sample?.checkedAt))
    .filter(Boolean)
    .sort();
  return {
    first: checkedTimes[0] || null,
    last: checkedTimes.at(-1) || null,
  };
}

async function upsertAvailabilitySamples(supabase, run) {
  const samples = run.availabilitySamples || [];
  if (!samples.length) return;
  await upsertRows(supabase, "api_transit_availability_samples", samples, { onConflict: "id" });
  await pruneAvailabilitySamples(supabase, run.stationId);
}

async function pruneAvailabilitySamples(supabase, stationId) {
  const cutoff = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("api_transit_availability_samples")
    .delete()
    .eq("station_id", stationId)
    .lt("checked_at", cutoff);
  if (error) throw error;
}

function availabilitySamplesFromProbe({ runId, stationId, modelList, targetResults, checkedAt }) {
  const normalizedCheckedAt = stringValue(checkedAt) || new Date().toISOString();
  const targetSamples = Array.isArray(targetResults)
    ? targetResults.filter(isAvailabilitySample)
    : [];
  const samples = [];

  if (targetSamples.length) {
    targetSamples.forEach((item, index) => {
      const standardModel = stringValue(item.standardModel);
      const groupName = stringValue(item.groupName);
      const targetCheckedAt = stringValue(item.checkedAt) || normalizedCheckedAt;
      samples.push(availabilitySampleRow({
        runId,
        stationId,
        scope: "station",
        standardModel,
        groupName,
        ok: Boolean(item.ok),
        checkedAt: targetCheckedAt,
        index,
      }));
      if (!standardModel) return;
      samples.push(availabilitySampleRow({
        runId,
        stationId,
        scope: "offer",
        standardModel,
        groupName,
        ok: Boolean(item.ok),
        checkedAt: targetCheckedAt,
        index,
      }));
    });
    return samples;
  }

  if (modelList && typeof modelList.ok === "boolean") {
    samples.push(availabilitySampleRow({
      runId,
      stationId,
      scope: "station",
      standardModel: null,
      groupName: null,
      ok: Boolean(modelList.ok),
      checkedAt: normalizedCheckedAt,
      index: 0,
    }));
  }

  return samples;
}

function availabilitySampleRow(input) {
  const stationId = stringValue(input.stationId);
  const runId = stringValue(input.runId);
  const checkedAt = stringValue(input.checkedAt) || new Date().toISOString();
  const standardModel = stringValue(input.standardModel) || null;
  const groupName = stringValue(input.groupName) || null;
  const scope = input.scope === "offer" ? "offer" : "station";

  return {
    id: stableId(
      "api-transit-availability-sample",
      runId,
      stationId,
      scope,
      standardModel || "station",
      groupName || "default",
      checkedAt,
      String(input.index || 0),
    ),
    run_id: runId,
    station_id: stationId,
    scope,
    standard_model: standardModel,
    group_name: groupName,
    ok: Boolean(input.ok),
    checked_at: checkedAt,
  };
}

function isAvailabilitySample(item) {
  return item && typeof item === "object" && typeof item.ok === "boolean";
}

function availabilityNote(label, availability) {
  if (!availability.samples) return "暂无 PriceAI API Key 可用性探测样本。";
  return `PriceAI API Key 探测：近 7 日 ${label} ${availability.success}/${availability.samples} 个样本成功。`;
}

function groupOfferRowsByModel(offerRows) {
  const output = new Map();
  for (const offer of offerRows) {
    const standardModel = stringValue(offer.standard_model);
    if (!standardModel) continue;
    const groups = output.get(standardModel) || new Set();
    groups.add(stringValue(offer.group_name) || "default");
    output.set(standardModel, groups);
  }
  return output;
}

function buildActiveOfferScope(offerRows) {
  const offerKeys = new Set();
  const modelTokens = new Set();
  for (const offer of offerRows) {
    const standardModel = stringValue(offer.standard_model);
    if (!standardModel) continue;
    offerKeys.add(offerAvailabilityKey(standardModel, stringValue(offer.group_name)));
    modelTokens.add(normalizeLooseToken(standardModel));
  }
  return { offerKeys, modelTokens };
}

function availabilitySampleMatchesActiveOfferScope(row, activeOfferScope) {
  const standardModel = stringValue(row.standard_model);
  if (!standardModel) return true;
  const groupName = stringValue(row.group_name);
  if (groupName) return activeOfferScope.offerKeys.has(offerAvailabilityKey(standardModel, groupName));
  return activeOfferScope.modelTokens.has(normalizeLooseToken(standardModel));
}

function extendSampleWindow(window, checkedAt) {
  const value = stringValue(checkedAt);
  if (!value) return;
  if (!window.first || value < window.first) window.first = value;
  if (!window.last || value > window.last) window.last = value;
}

function offerAvailabilityKey(standardModel, groupName) {
  return `${normalizeLooseToken(standardModel)}|${normalizeLooseToken(groupName || "default")}`;
}

function legacySamplesForOffer(legacySamplesByModel, offerGroupsByModel, standardModel) {
  const groups = offerGroupsByModel.get(standardModel);
  if (groups && groups.size > 1) return null;
  return legacySamplesByModel.get(standardModel) || null;
}

function targetGroupLabel(standardModel, groupName) {
  return groupName ? `${groupName} / ${standardModel}` : standardModel;
}

async function listOfferModels(supabase, stationIds) {
  const output = new Map();
  const ids = stationIds.filter(Boolean);
  if (!ids.length) return output;

  const { data, error } = await supabase
    .from("api_transit_offers")
    .select("station_id,family,standard_model,raw_model_name,group_name,account_pool,channel_type,status")
    .in("station_id", ids)
    .in("status", ["active", "needs_review"]);

  if (error) throw error;

  for (const row of dbRows(data)) {
    const stationId = stringValue(row.station_id);
    if (!stationId) continue;
    const existing = output.get(stationId) || [];
    existing.push(row);
    output.set(stationId, existing);
  }

  return output;
}

async function listCredentialApiKeys(supabase, stationIds) {
  const output = emptyCredentialStore();
  const ids = Array.from(new Set(stationIds.filter(Boolean)));
  if (!ids.length) return output;

  const { data, error } = await supabase
    .from("api_transit_credentials")
    .select("id,station_id,credential_type,status,encrypted_payload,credential_meta,expires_at,created_at")
    .in("station_id", ids)
    .eq("credential_type", "test_key")
    .in("status", ["submitted", "ready"])
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "PGRST205" || String(error.message || "").includes("api_transit_credentials")) {
      output.unavailableReason = "credential_table_missing";
      return output;
    }
    throw error;
  }

  const secret = envValue("API_TRANSIT_CREDENTIAL_ENCRYPTION_KEY");
  if (!secret) {
    output.unavailableReason = "missing_credential_encryption_key";
    return output;
  }

  for (const row of dbRows(data)) {
    if (isExpired(row.expires_at)) continue;
    const stationId = stringValue(row.station_id);
    if (!stationId) continue;

    const payload = await decryptCredentialPayload(row.encrypted_payload, secret).catch(() => null);
    const apiKey = stringValue(payload?.api_key);
    if (!apiKey) continue;

    const meta = row.credential_meta && typeof row.credential_meta === "object" ? row.credential_meta : {};
    const items = output.byStation.get(stationId) || [];
    items.push({
      credentialId: stringValue(row.id) || null,
      apiKey,
      allowedModels: stringArray(payload?.allowed_models || meta.allowed_models),
      allowedGroups: stringArray(payload?.allowed_groups || meta.allowed_groups),
      groupName: stringValue(payload?.group_name || meta.group_name),
      groupId: stringValue(payload?.group_id || meta.group_id),
      accountPool: stringValue(payload?.account_pool || meta.account_pool),
      family: stringValue(payload?.family || meta.family),
      createdAt: stringValue(row.created_at),
    });
    output.byStation.set(stationId, items);
  }

  return output;
}

function emptyCredentialStore() {
  return {
    byStation: new Map(),
    unavailableReason: null,
  };
}

function selectCredentialForProfile(store, profile) {
  const credentials = store.byStation.get(profile.stationId) || [];
  if (!credentials.length) return null;

  const exact = credentials.find((credential) => credentialMatchesProfile(credential, profile));
  const selected = exact || (profileRequiresSpecificCredential(profile) ? null : credentials[0]);
  if (!selected) return null;
  return {
    apiKey: selected.apiKey,
    credentialId: selected.credentialId,
    source: "database",
  };
}

function credentialMatchesProfile(credential, profile) {
  if (!credentialGroupMatchesProfile(credential, profile)) return false;
  if (!credential.allowedModels.length) return true;

  const profileTokens = [
    profile.profileId,
    profile.stationId,
    profile.apiKeyEnv,
    profile.groupName,
    profile.groupId,
    profile.accountPool,
    ...(Array.isArray(profile.targets) ? profile.targets.flatMap((target) => [
      target.family,
      target.standardModel,
      target.groupName,
      target.groupId,
      target.accountPool,
      ...(target.candidates || []),
      ...(target.keywords || []),
    ]) : []),
  ].map(normalizeLooseToken).filter(Boolean);

  return credential.allowedModels.some((allowed) => {
    const token = normalizeLooseToken(allowed);
    if (!token) return false;
    return profileTokens.some((profileToken) => looseTokenMatches(profileToken, token));
  });
}

function credentialGroupMatchesProfile(credential, profile) {
  const profileGroupTokens = [
    profile.groupName,
    profile.groupId,
    profile.accountPool,
    ...(Array.isArray(profile.targets)
      ? profile.targets.flatMap((target) => [target.groupName, target.groupId, target.accountPool])
      : []),
  ].map(normalizeLooseToken).filter(Boolean);

  if (!profileGroupTokens.length) return true;

  const credentialGroupTokens = [
    credential.groupName,
    credential.groupId,
    credential.accountPool,
    ...credential.allowedGroups,
  ].map(normalizeLooseToken).filter(Boolean);

  if (!credentialGroupTokens.length) return false;
  return profileGroupTokens.some((profileToken) =>
    credentialGroupTokens.some((credentialToken) => groupTokenMatches(profileToken, credentialToken)),
  );
}

function profileRequiresSpecificCredential(profile) {
  return Boolean(
    profile.groupName ||
      profile.groupId ||
      profile.accountPool ||
      (Array.isArray(profile.targets) &&
        profile.targets.some((target) => target.groupName || target.groupId || target.accountPool)),
  );
}

async function decryptCredentialPayload(encryptedPayload, secret) {
  if (!encryptedPayload || typeof encryptedPayload !== "object") return null;
  if (encryptedPayload.alg !== "AES-GCM") return null;

  const cryptoApi = globalThis.crypto || webcrypto;
  if (!cryptoApi?.subtle) return null;

  const encoder = new TextEncoder();
  const keyMaterial = await cryptoApi.subtle.digest("SHA-256", encoder.encode(secret));
  const key = await cryptoApi.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["decrypt"]);
  const iv = base64ToBytes(encryptedPayload.iv);
  const ciphertext = base64ToBytes(encryptedPayload.ciphertext);
  const decrypted = await cryptoApi.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(decrypted));
}

async function markCredentialUsed(supabase, credentialId) {
  const { error } = await supabase
    .from("api_transit_credentials")
    .update({ last_used_at: new Date().toISOString(), failure_message: null })
    .eq("id", credentialId);
  if (error && error.code !== "PGRST205") throw error;
}

function isExpired(value) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function base64ToBytes(value) {
  return Uint8Array.from(Buffer.from(String(value || ""), "base64"));
}

async function upsertRows(supabase, table, rows, options = {}) {
  for (const chunk of chunks(rows, 300)) {
    if (!chunk.length) continue;
    const { error } = await supabase.from(table).upsert(chunk, options);
    if (error) {
      error.table = table;
      throw error;
    }
  }
}

function loadProbeProfiles() {
  return JSON.parse(readFileSync(configPath, "utf8"));
}

async function loadProbeProfilesForRun(options) {
  const profiles = options.profiles || loadProbeProfiles();
  if (!shouldRestrictToPublishedStations(options)) return profiles;

  const publishedStationIds = await readPublishedApiTransitStationIds();
  return filterProfilesByPublishedStationIds(profiles, publishedStationIds);
}

function selectProfiles(profiles, options) {
  const ids = optionList(options.station || options.stationId || options.source || options.sources);
  const selected = ids.length ? profiles.filter((profile) => ids.includes(profile.stationId)) : profiles;
  if (!selected.length) throw new Error("No API transit probe profiles matched.");
  return selected;
}

function shouldRestrictToPublishedStations(options) {
  const ids = optionList(options.station || options.stationId || options.source || options.sources);
  return Boolean((options.post || options.db) && !options.dryRun && !ids.length);
}

function filterProfilesByPublishedStationIds(profiles, publishedStationIds) {
  return profiles.filter((profile) => publishedStationIds.has(profile.stationId));
}

async function readPublishedApiTransitStationIds() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for published API transit probe selection.");
  }

  const { data, error } = await supabase
    .from("api_transit_stations")
    .select("id")
    .eq("published", true)
    .is("removed_at", null);
  if (error) {
    if (isMissingRemovedAtColumnError(error)) return readPublishedApiTransitStationIdsWithoutRemovedFilter(supabase);
    throw error;
  }

  return new Set((data || []).map((row) => String(row.id || "")).filter(Boolean));
}

async function readPublishedApiTransitStationIdsWithoutRemovedFilter(supabase) {
  const { data, error } = await supabase
    .from("api_transit_stations")
    .select("id")
    .eq("published", true);
  if (error) throw error;
  return new Set((data || []).map((row) => String(row.id || "")).filter(Boolean));
}

function isMissingRemovedAtColumnError(error) {
  return isMissingColumnError(error, "removed_at");
}

function isMissingColumnError(error, columnName) {
  const code = String(error?.code || "");
  const message = String(error?.message || error?.details || "");
  return (code === "42703" || code === "PGRST204") && message.includes(columnName);
}

function getSupabaseClient() {
  const url = envValue("NEXT_PUBLIC_SUPABASE_URL");
  const key = envValue("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function envValue(name) {
  if (!name) return "";
  if (process.env[name]) return process.env[name];
  const fileEnv = readEnvFile(envPath);
  return fileEnv[name] || "";
}

function readEnvFile(filePath) {
  if (cachedFileEnv) return cachedFileEnv;

  const output = {};
  if (!existsSync(filePath)) {
    cachedFileEnv = output;
    return output;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    output[match[1]] = unquote(match[2].trim());
  }

  cachedFileEnv = output;
  return output;
}

function unquote(value) {
  const quote = value[0];
  if ((quote === `"` || quote === `'`) && value[value.length - 1] === quote) {
    return value.slice(1, -1);
  }
  return value;
}

function normalizeApiBaseUrl(value) {
  const text = String(value || "").trim().replace(/\/+$/, "");
  if (!text) throw new Error("API base URL is required.");
  return text.endsWith("/v1") ? text : `${text}/v1`;
}

function normalizeModelIds(payload) {
  if (Array.isArray(payload?.data)) {
    return payload.data.map((item) => item?.id || item?.name || item).map(String).filter(Boolean);
  }
  if (Array.isArray(payload?.models)) {
    return payload.models.map((item) => item?.id || item?.name || item).map(String).filter(Boolean);
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => item?.id || item?.name || item).map(String).filter(Boolean);
  }
  return [];
}

function extractErrorMessage(json) {
  if (!json || typeof json !== "object") return null;
  const error = json.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") return stringValue(error.message || error.type || error.code) || null;
  return stringValue(json.message || json.msg || json.error_message) || null;
}

function safeTextPreview(text) {
  const value = String(text || "");
  return value.length > 500 ? `${value.slice(0, 500)}...` : value;
}

function classifyProbeError(error) {
  const status = Number(error?.status);
  const message = errorMessage(error).toLowerCase();
  if (status === 401 || status === 403) return "auth";
  if (status === 404 || message.includes("model")) return "model_unavailable";
  if (status === 429) return "rate_limited";
  if (message.includes("timeout") || message.includes("超时")) return "timeout";
  if (status >= 500) return "upstream";
  return "request_failed";
}

function runStatus(input) {
  if (!input.modelListOk) return "failed";
  if (input.skipCompletions) return input.modelCount > 0 ? "success" : "partial";
  if (input.attemptedTargets > 0 && input.okTargets === input.attemptedTargets) return "success";
  if (input.attemptedTargets > 0 && input.okTargets > 0) return "partial";
  if (input.skippedTargets > 0) return "partial";
  return "failed";
}

function buildSkippedProfile(profile, reason) {
  return {
    profileId: profile.profileId || null,
    stationId: profile.stationId,
    apiBaseUrl: profile.apiBaseUrl,
    apiKeyEnv: profile.apiKeyEnv,
    groupName: profile.groupName || null,
    reason,
  };
}

function keywordsForStandardModel(value) {
  const text = String(value || "").toLowerCase();
  const version = text.match(/\d+(?:\.\d+)?/)?.[0];
  const keywords = [];
  if (text.includes("claude")) keywords.push("claude");
  if (text.includes("sonnet")) keywords.push("sonnet");
  if (text.includes("opus")) keywords.push("opus");
  if (text.includes("gpt")) keywords.push("gpt");
  if (text.includes("gemini")) keywords.push("gemini");
  if (text.includes("glm")) keywords.push("glm");
  if (text.includes("deepseek")) keywords.push("deepseek");
  if (text.includes("flash")) keywords.push("flash");
  if (text.includes("pro")) keywords.push("pro");
  if (version) keywords.push(version);
  return keywords;
}

function normalizeFamily(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("claude")) return "claude";
  if (text.includes("gpt")) return "gpt";
  if (text.includes("gemini") || text.includes("google")) return "gemini";
  if (text.includes("glm") || text.includes("zhipu")) return "glm";
  if (text.includes("deepseek")) return "deepseek";
  return null;
}

function normalizeModelId(value) {
  return String(value || "").toLowerCase().replace(/[_\s]+/g, "-");
}

function normalizeLooseToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function looseTokenMatches(left, right) {
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function groupTokenMatches(left, right) {
  return Boolean(left && right && left === right);
}

function dbRows(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

function stringArray(value) {
  const items = Array.isArray(value) ? value : [value];
  return items.map((item) => String(item || "").trim()).filter(Boolean);
}

function stringValue(value) {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function optionList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(optionList);
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function chunks(items, size) {
  const output = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

function round(value, digits) {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function stableId(...parts) {
  const input = parts.filter((part) => part !== null && part !== undefined).join("|");
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) hash = (hash * 33) ^ input.charCodeAt(index);
  return `id-${(hash >>> 0).toString(36)}`;
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!item.startsWith("--")) continue;
    const rawKey = item.slice(2);
    const equalsIndex = rawKey.indexOf("=");
    const key = equalsIndex >= 0 ? rawKey.slice(0, equalsIndex) : rawKey;
    const inlineValue = equalsIndex >= 0 ? rawKey.slice(equalsIndex + 1) : undefined;
    const next = values[index + 1];

    if (inlineValue !== undefined) {
      result[key] = inlineValue;
    } else if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function normalizeOptions(options) {
  return {
    ...options,
    env: parseInlineEnv(options.env),
    dryRun: truthyOption(options.dryRun ?? options["dry-run"]),
    post: truthyOption(options.post),
    db: truthyOption(options.db),
    dbCredentials: !truthyOption(options.noDbCredentials ?? options["no-db-credentials"]),
    verbose: truthyOption(options.verbose),
    skipCompletions: truthyOption(options.skipCompletions ?? options["skip-completions"]),
    timeoutMs: positiveInteger(options.timeoutMs ?? options.timeout, DEFAULT_TIMEOUT_MS),
    targetLimit: positiveInteger(options.targetLimit ?? options["target-limit"], DEFAULT_TARGET_LIMIT),
  };
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseInlineEnv(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;

  const output = {};
  for (const item of optionList(value)) {
    const index = item.indexOf("=");
    if (index <= 0) continue;
    output[item.slice(0, index)] = item.slice(index + 1);
  }
  return output;
}

function truthyOption(value) {
  return value === true || value === "true" || value === "1" || value === "";
}

function printSummary(result) {
  console.log(
    [
      "API transit probe plan.",
      `profiles=${result.counts.profiles}`,
      `probed=${result.counts.probed}`,
      `skipped=${result.counts.skipped}`,
      `success=${result.counts.successfulRuns}`,
      `failed=${result.counts.failedRuns}`,
      result.post ? "database=posted" : "database=not-requested",
    ].join(" "),
  );
}

function isCli() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function errorMessage(error) {
  if (error?.name === "AbortError") return "请求超时。";
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") return JSON.stringify(error, null, 2);
  return String(error);
}

export const __test = {
  keywordsForStandardModel,
  normalizeFamily,
  selectProbeTargets,
};
