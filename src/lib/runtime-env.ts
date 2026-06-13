import "server-only";

type CloudflareContext = {
  env?: Record<string, unknown>;
};

const cloudflareContextSymbol = Symbol.for("__cloudflare-context__");

export function getRuntimeEnv(name: string): string | undefined {
  const processValue = process.env[name];
  if (typeof processValue === "string" && processValue.length > 0) {
    return processValue;
  }

  const context = (globalThis as unknown as Record<symbol, CloudflareContext | undefined>)[
    cloudflareContextSymbol
  ];
  const cloudflareValue = context?.env?.[name];

  return typeof cloudflareValue === "string" && cloudflareValue.length > 0
    ? cloudflareValue
    : undefined;
}
