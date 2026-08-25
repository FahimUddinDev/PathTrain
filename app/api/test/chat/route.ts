import { NextResponse } from "next/server";
import { retrieve } from "@/lib/rag/retriever";
import { buildRagPrompt } from "@/lib/rag/prompt-builder";
import { generateWithOllama } from "@/lib/llm/ollama";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    query?: string;
    classId?: string;
    subjectId?: string;
    topicId?: string;
    systemPrompt?: string;
  };

  if (!body.query?.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const chunks = await retrieve({
      query: body.query,
      filter: {
        classId: body.classId,
        subjectId: body.subjectId,
        topicId: body.topicId,
      },
    });
    const prompt = buildRagPrompt({
      query: body.query,
      chunks,
      systemPrompt: body.systemPrompt,
    });
    const answer = await generateWithOllama({
      system: prompt.system,
      prompt: prompt.user,
    });
    return NextResponse.json({ chunks, answer, prompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
