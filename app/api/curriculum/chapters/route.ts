import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const subjectId = new URL(request.url).searchParams.get("subjectId");
  const chapters = await prisma.chapter.findMany({
    where: subjectId ? { subjectId } : undefined,
    orderBy: { order: "asc" },
  });
  return NextResponse.json(chapters);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    subjectId?: string;
    name?: string;
    order?: number;
  };
  if (!body.subjectId || !body.name?.trim()) {
    return NextResponse.json({ error: "subjectId and name are required" }, { status: 400 });
  }
  const created = await prisma.chapter.create({
    data: {
      subjectId: body.subjectId,
      name: body.name.trim(),
      order: body.order ?? 0,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
