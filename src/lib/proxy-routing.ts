export const PRICEAI_PROXY_MATCHER = [
  "/_next/static/css/:path*",
  "/auth/:path*",
  "/login",
  "/account/:path*",
  "/api/account/:path*",
  "/api/api-transit/detector/:path*",
];

export function shouldRefreshAuthSession(pathname: string): boolean {
  return pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname === "/account" ||
    pathname.startsWith("/account/") ||
    pathname.startsWith("/api/account/") ||
    pathname.startsWith("/api/api-transit/detector/");
}
