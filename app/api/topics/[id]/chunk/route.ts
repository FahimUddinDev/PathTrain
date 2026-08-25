import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { chunkText } from "@/lib/ingestion/chunker";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const topic = await prisma.topic.findUnique({ where: { id } });
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  const drafts = chunkText(topic.name, topic.rawText);

  await prisma.$transaction([
    prisma.chunk.deleteMany({ where: { topicId: id } }),
    prisma.chunk.createMany({
      data: drafts.map((draft) => ({
        topicId: id,
        text: draft.text,
        chunkOrder: draft.chunkOrder,
        tokenCount: draft.tokenCount,
      })),
    }),
    prisma.topic.update({
      where: { id },
      data: { status: "chunked" },
    }),
  ]);

  const chunks = await prisma.chunk.findMany({
    where: { topicId: id },
    orderBy: { chunkOrder: "asc" },
  });

  return NextResponse.json({ topicId: id, chunks });
}
