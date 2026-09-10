import { exchangeCodeForTokens } from "@/lib/google";
import { requireSession } from "@/lib/session";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function back(request: NextRequest, status: string) {
  const response = NextResponse.redirect(
    new URL(`/dashboard/search?google=${status}`, request.url),
  );
  response.cookies.delete("zuri_google_state");
  return response;
}

export async function GET(request: NextRequest) {
  await requireSession();

  const url = new URL(request.url);
  if (url.searchParams.get("error")) return back(request, "denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = request.cookies.get("zuri_google_state")?.value;

  if (!code || !state || !expected || state !== expected) {
    return back(request, "state-mismatch");
  }

  try {
    await exchangeCodeForTokens(code, url.origin);
    return back(request, "connected");
  } catch (error) {
    console.error("Google callback failed", error);
    return back(request, "failed");
  }
}
