const CHUNK_LOAD_PATTERN =
  /ChunkLoadError|Loading chunk \d+ failed|CSS_CHUNK_LOAD_FAILED|failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|\/_next\/static\/chunks\//i;

const RELOAD_GUARD_KEY = "priceai:chunk-load-reload";
const RELOAD_GUARD_MS = 10_000;

export function isChunkLoadFailure(input: unknown): boolean {
  return CHUNK_LOAD_PATTERN.test(errorText(input));
}

export function reloadOnceForChunkLoadFailure(input: unknown): boolean {
  if (!isChunkLoadFailure(input) || typeof window === "undefined") return false;

  try {
    const now = Date.now();
    const url = window.location.href;
    const previous = window.sessionStorage.getItem(RELOAD_GUARD_KEY);

    if (previous) {
      const [previousUrl, previousTime] = previous.split("|");
      const age = now - Number(previousTime || 0);
      if (previousUrl === url && Number.isFinite(age) && age >= 0 && age < RELOAD_GUARD_MS) {
        return false;
      }
    }

    window.sessionStorage.setItem(RELOAD_GUARD_KEY, `${url}|${now}`);
  } catch {
    // If storage is unavailable, still try one hard reload. A stale chunk means
    // the current client bundle cannot safely continue rendering.
  }

  window.location.reload();
  return true;
}

export function errorText(input: unknown): string {
  if (!input) return "";
  if (typeof input === "string") return input;

  if (input instanceof Error) {
    return [input.name, input.message, input.stack].filter(Boolean).join(" ");
  }

  if (typeof input === "object") {
    const record = input as Record<string, unknown>;
    return [
      record.name,
      record.message,
      record.stack,
      record.reason,
      record.filename,
      record.src,
      record.href,
    ]
      .map(errorText)
      .filter(Boolean)
      .join(" ");
  }

  return String(input);
}
