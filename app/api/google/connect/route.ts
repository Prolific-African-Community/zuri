import { authorizationUrl, googleConfigured } from "@/lib/google";
import { requireSession } from "@/lib/session";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await requireSession();

  if (!googleConfigured()) {
    return NextResponse.redirect(
      new URL("/dashboard/search?google=not-configured", request.url),
    );
  }

  const origin = new URL(request.url).origin;
  const state = randomUUID();

  const response = NextResponse.redirect(authorizationUrl(origin, state));
  // Round-tripped through Google and checked on the way back.
  response.cookies.set("zuri_google_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return response;
}
