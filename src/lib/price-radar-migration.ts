export const PRICE_RADAR_DOCUMENTATION_URL = "https://priceai.cc/price-radar-api.md";
export const PRICE_RADAR_LATEST_URL = "https://data.priceai.cc/latest.json";
export const PRICE_RADAR_SCHEMA_URL = "https://priceai.cc/price-radar-v1.schema.json";

export const PRICE_RADAR_MIGRATION_HEADERS = {
  Link: [
    `<${PRICE_RADAR_LATEST_URL}>; rel="alternate"; type="application/json"`,
    `<${PRICE_RADAR_DOCUMENTATION_URL}>; rel="describedby"; type="text/markdown"`,
    `<${PRICE_RADAR_SCHEMA_URL}>; rel="describedby"; type="application/schema+json"`,
  ].join(", "),
  "X-PriceAI-Migration": "price-radar-v1",
  "X-PriceAI-Public-Data": PRICE_RADAR_LATEST_URL,
} as const;

export function withPriceRadarMigrationHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(PRICE_RADAR_MIGRATION_HEADERS)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
