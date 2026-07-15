import { ADMIN_SESSION_COOKIE } from "@/lib/env";

export async function POST(request: Request) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return new Response(null, {
    status: 303,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Location: new URL("/admin", request.url).toString(),
      "Set-Cookie": `${ADMIN_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure}`,
    },
  });
}
