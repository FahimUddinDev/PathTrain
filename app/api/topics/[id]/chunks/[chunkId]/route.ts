import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { markChunkPending } from "@/lib/db/vector";
import { countTokens } from "@/lib/ingestion/chunker";

type RouteContext = { params: Promise<{ id: string; chunkId: string }> };

const bodySchema = z.object({
  text: z.string().trim().min(1, "text is required"),
});

export async function PATCH(request: Request, context: RouteContext) {
  const { id, chunkId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const existing = await prisma.chunk.findFirst({ where: { id: chunkId, topicId: id } });
  if (!existing) {
    return NextResponse.json({ error: "Chunk not found for this topic" }, { status: 404 });
  }

  const text = parsed.data.text;
  await prisma.chunk.update({
    where: { id: chunkId },
    data: { text, tokenCount: countTokens(text), editable: true },
  });
  await markChunkPending(chunkId);

  // A hand-edited chunk needs re-embedding, so the topic is no longer fully embedded.
  await prisma.topic.update({
    where: { id },
    data: { status: "chunked", failureReason: null },
  });

  const chunk = await prisma.chunk.findUnique({
    where: { id: chunkId },
    select: {
      id: true,
      text: true,
      chunkOrder: true,
      tokenCount: true,
      embeddingStatus: true,
      editable: true,
    },
  });

  return NextResponse.json(chunk);
}
