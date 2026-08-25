import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const topic = await prisma.topic.findUnique({
    where: { id },
    include: { chunks: { orderBy: { chunkOrder: "asc" } } },
  });
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }
  return NextResponse.json(topic);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as { name?: string; rawText?: string };
  const topic = await prisma.topic.update({
    where: { id },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.rawText ? { rawText: body.rawText, status: "draft" } : {}),
    },
  });
  return NextResponse.json(topic);
}
