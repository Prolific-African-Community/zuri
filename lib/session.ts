import { SESSION_COOKIE, authConfigured, isValidSessionToken } from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Server-side guard for Server Actions. `proxy.ts` already blocks unauthenticated
 * requests to /dashboard; this is the second lock, so an action can never run
 * without a session even if it is reached some other way.
 */
export async function requireSession() {
  if (!authConfigured()) redirect("/login?error=config");

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await isValidSessionToken(token))) redirect("/login");
}
