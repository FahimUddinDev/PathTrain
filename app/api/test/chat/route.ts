import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/curriculum/http";
import { generateWithOllama } from "@/lib/llm/ollama";
import { buildRagPrompt } from "@/lib/rag/prompt-builder";
import {
  optionalString,
  retrieve,
  retrieveInputFromFields,
} from "@/lib/rag/retriever";

export const maxDuration = 120;

function isOllamaUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ollama|fetch failed|econnrefused|enotfound/i.test(message);
}

export async function POST(request: Request) {
  const body = await parseJsonBody(request);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const input = retrieveInputFromFields(record);
  if (!input.query.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const chunks = await retrieve(input);
    const prompt = buildRagPrompt({
      query: input.query,
      chunks,
      systemPrompt: optionalString(record.systemPrompt),
    });
    const answer = await generateWithOllama({
      system: prompt.system,
      prompt: prompt.user,
      model: optionalString(record.model),
    });
    return NextResponse.json({ chunks, answer, prompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat failed";
    if (isOllamaUnavailable(error)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
