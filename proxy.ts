import { SESSION_COOKIE, authConfigured, isValidSessionToken } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Gate for everything under /dashboard, including the Server Action POSTs those
 * pages issue. Actions re-check the session themselves as well.
 */
export async function proxy(request: NextRequest) {
  // Misconfiguration must lock the app, never open it.
  if (!authConfigured()) {
    return NextResponse.redirect(new URL("/login?error=config", request.url));
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSessionToken(token)) return NextResponse.next();

  if (request.method !== "GET") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = new URL("/login", request.url);
  url.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/google/:path*"],
};
