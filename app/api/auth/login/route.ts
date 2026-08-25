import { NextResponse } from "next/server";
import { credentialsMatch, getAdminCredentials } from "@/lib/auth/credentials";
import {
  createSessionToken,
  sessionCookieOptions,
  SESSION_COOKIE,
} from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    getAdminCredentials();
  } catch {
    return NextResponse.json(
      { error: "Admin login is not configured. Set ADMIN_PASSWORD in .env." },
      { status: 500 },
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = (await request.json()) as { username?: string; password?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!credentialsMatch(username, password)) {
    return NextResponse.json(
      { error: "Invalid username or password" },
      { status: 401 },
    );
  }

  const token = await createSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
