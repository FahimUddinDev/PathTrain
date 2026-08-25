import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const topics = await prisma.topic.findMany({
    include: {
      chapter: { include: { subject: { include: { class: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(topics);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    chapterId?: string;
    name?: string;
    rawText?: string;
  };
  if (!body.chapterId || !body.name?.trim() || !body.rawText?.trim()) {
    return NextResponse.json(
      { error: "chapterId, name, and rawText are required" },
      { status: 400 },
    );
  }
  const created = await prisma.topic.create({
    data: {
      chapterId: body.chapterId,
      name: body.name.trim(),
      rawText: body.rawText,
      status: "draft",
    },
  });
  return NextResponse.json(created, { status: 201 });
}
