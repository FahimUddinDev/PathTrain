import { NextResponse } from "next/server";
import { CurriculumError } from "@/lib/curriculum/service";

export function parseJsonBody(request: Request) {
  return request.json().catch(() => null);
}

export function stringField(body: unknown, key: string): string {
  if (!body || typeof body !== "object") {
    return "";
  }
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

export function errorResponse(error: unknown) {
  if (error instanceof CurriculumError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Database request failed" }, { status: 503 });
}
