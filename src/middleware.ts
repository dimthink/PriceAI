import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthCookieOptions, getAuthCookieWriteOptions } from "@/lib/auth-cookie-options";
import { priceAiCanonicalOrigin } from "@/lib/auth-paths";
import { shouldRefreshAuthSession } from "@/lib/proxy-routing";

const ACTIVE_DEPLOYMENT_ID = process.env.NEXT_DEPLOYMENT_ID;
const STALE_CSS_BROWSER_SECONDS = 86_400;
const STALE_CSS_EDGE_SECONDS = 604_800;

// OpenNext 1.20.x does not yet support Next.js 16 Node Proxy bundles.
// Keep this narrowly-scoped Edge middleware until the adapter supports src/proxy.ts.
export async function middleware(request: NextRequest) {
  if (isStaleDeploymentCssRequest(request)) return staleDeploymentCssResponse();

  if (request.nextUrl.hostname.toLowerCase() === "www.priceai.cc") {
    const destination = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, priceAiCanonicalOrigin);
    return NextResponse.redirect(destination, 308);
  }

  if (!shouldRefreshAuthSession(request.nextUrl.pathname)) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookieOptions: getAuthCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, getAuthCookieWriteOptions(name, options));
        });
      },
    },
  });

  await supabase.auth.getClaims().catch(() => null);
  return response;
}

function isStaleDeploymentCssRequest(request: NextRequest): boolean {
  if (!request.nextUrl.pathname.startsWith("/_next/static/css/")) return false;
  const requestedDeploymentId = request.nextUrl.searchParams.get("dpl");
  return Boolean(ACTIVE_DEPLOYMENT_ID && requestedDeploymentId && requestedDeploymentId !== ACTIVE_DEPLOYMENT_ID);
}

function staleDeploymentCssResponse(): Response {
  return new Response("", {
    status: 200,
    headers: {
      "Cache-Control": `public, max-age=${STALE_CSS_BROWSER_SECONDS}, s-maxage=${STALE_CSS_EDGE_SECONDS}, stale-while-revalidate=${STALE_CSS_EDGE_SECONDS}`,
      "Content-Type": "text/css; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-PriceAI-Static-Fallback": "stale-deployment-css",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export const config = {
  matcher: [
    "/_next/static/css/:path*",
    "/auth/:path*",
    "/login",
    "/account/:path*",
    "/api/account/:path*",
    "/api/api-transit/detector/:path*",
  ],
};
