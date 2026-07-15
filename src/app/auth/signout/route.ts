import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/auth";

export async function POST(request: Request) {
  const supabase = await createSupabaseAuthServerClient();
  await supabase?.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
