import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthCookieOptions, getAuthCookieWriteOptions } from "@/lib/auth-cookie-options";
import { priceAiCanonicalOrigin } from "@/lib/auth-paths";
import { shouldRefreshAuthSession } from "@/lib/proxy-routing";

// OpenNext 1.20.x does not yet support Next.js 16 Node Proxy bundles.
// Keep this narrowly-scoped Edge middleware until the adapter supports src/proxy.ts.
export async function middleware(request: NextRequest) {
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

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
