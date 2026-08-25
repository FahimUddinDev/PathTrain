import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/curriculum/http";
import { streamWithOllama } from "@/lib/llm/ollama";
import { buildRagPrompt } from "@/lib/rag/prompt-builder";
import {
  optionalString,
  retrieve,
  retrieveInputFromFields,
} from "@/lib/rag/retriever";

export const maxDuration = 120;

function ndjsonLine(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(payload)}\n`);
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

  let chunks;
  let prompt;
  try {
    chunks = await retrieve(input);
    prompt = buildRagPrompt({
      query: input.query,
      chunks,
      systemPrompt: optionalString(record.systemPrompt),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Retrieval failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(ndjsonLine({ type: "meta", chunks, prompt }));

        for await (const token of streamWithOllama({
          system: prompt.system,
          prompt: prompt.user,
          model: optionalString(record.model),
        })) {
          controller.enqueue(ndjsonLine({ type: "token", delta: token }));
        }

        controller.enqueue(ndjsonLine({ type: "done" }));
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Chat failed";
        controller.enqueue(ndjsonLine({ type: "error", error: message }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
