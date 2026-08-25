import { NextResponse } from "next/server";
import { errorResponse, parseJsonBody, stringField } from "@/lib/curriculum/http";
import { createTopicSchema } from "@/lib/curriculum/schemas";
import { prisma } from "@/lib/db/prisma";
import { createAndChunkTopic } from "@/lib/ingestion/ingest-topic";

export async function GET() {
  try {
    const topics = await prisma.topic.findMany({
      include: {
        chapter: { include: { subject: { include: { class: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(topics);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const body = await parseJsonBody(request);
  const parsed = createTopicSchema.safeParse({
    chapterId: stringField(body, "chapterId"),
    name: stringField(body, "name"),
    text: stringField(body, "text") || stringField(body, "rawText"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  try {
    const created = await createAndChunkTopic(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
