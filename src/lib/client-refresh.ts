"use client";

const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 4_000;

type GeneratedDataset = {
  generatedAt?: string | null;
  degraded?: boolean | null;
};

export function isGeneratedDatasetStale(
  dataset: GeneratedDataset | null | undefined,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
): boolean {
  if (dataset?.degraded) return true;

  const timestamp = generatedAtMs(dataset);
  if (!timestamp) return true;

  return Date.now() - timestamp > staleAfterMs;
}

export function newestGeneratedDataset<T extends GeneratedDataset>(
  ...datasets: Array<T | null | undefined>
): T | null {
  let newest: T | null = null;
  let newestTimestamp = 0;

  for (const dataset of datasets) {
    if (!dataset) continue;

    const timestamp = generatedAtMs(dataset);
    if (!newest || timestamp >= newestTimestamp) {
      newest = dataset;
      newestTimestamp = timestamp;
    }
  }

  return newest;
}

export function newestUsableGeneratedDataset<T extends GeneratedDataset>(
  ...datasets: Array<T | null | undefined>
): T | null {
  const healthy = newestGeneratedDataset(...datasets.filter((dataset) => !dataset?.degraded));
  return healthy ?? newestGeneratedDataset(...datasets);
}

export function createTimeoutSignal(timeoutMs = DEFAULT_TIMEOUT_MS): {
  signal: AbortSignal;
  cancel: () => void;
  clear: () => void;
} {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const clear = () => window.clearTimeout(timeoutId);

  return {
    signal: controller.signal,
    cancel: () => {
      clear();
      controller.abort();
    },
    clear,
  };
}

function generatedAtMs(dataset: GeneratedDataset | null | undefined): number {
  const value = dataset?.generatedAt;
  if (!value) return 0;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}
