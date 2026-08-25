import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { embedTopicChunks } from "@/lib/ingestion/embedder";

type RouteContext = { params: Promise<{ id: string }> };

export const maxDuration = 60;

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  const topic = await prisma.topic.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  try {
    const result = await embedTopicChunks(id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Embed failed";
    const status =
      message === "No chunks to embed. Chunk the topic first." ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
