"use server";

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  authConfigured,
  checkPassword,
  createSessionToken,
} from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type LoginState = { error: string };

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (!authConfigured()) {
    return { error: "Auth is not configured. Set AUTH_SECRET and AUTH_PASSWORD." };
  }

  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Enter your password." };

  if (!(await checkPassword(password))) {
    return { error: "Incorrect password." };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  const raw = String(formData.get("from") ?? "");
  // Only ever follow an in-app path, never an attacker-supplied absolute URL.
  const destination = raw.startsWith("/dashboard") ? raw : "/dashboard";
  redirect(destination);
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
