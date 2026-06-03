type AnalyticsEventParams = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    umami?: {
      track?: (name: string, params?: Record<string, string | number | boolean>) => void;
    };
  }
}

export function trackAnalyticsEvent(name: string, params: AnalyticsEventParams = {}) {
  if (typeof window === "undefined") return;

  const compacted = compactParams(params);

  if (typeof window.gtag === "function") {
    window.gtag("event", name, compacted);
  }

  if (typeof window.umami?.track === "function") {
    window.umami.track(name, compacted);
  }
}

function compactParams(params: AnalyticsEventParams): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string | number | boolean] => {
      const value = entry[1];
      return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
    }),
  );
}
