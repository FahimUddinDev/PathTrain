import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/curriculum/http";
import { retrieve, retrieveInputFromFields } from "@/lib/rag/retriever";

async function retrievalResponse(record: Record<string, unknown>) {
  const input = retrieveInputFromFields(record);
  if (!input.query.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const chunks = await retrieve(input);
    return NextResponse.json({ chunks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Retrieval failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Retrieval only — raw chunks + similarity scores, no LLM. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return retrievalResponse(Object.fromEntries(searchParams.entries()));
}

export async function POST(request: Request) {
  const body = await parseJsonBody(request);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  return retrievalResponse(body as Record<string, unknown>);
}
