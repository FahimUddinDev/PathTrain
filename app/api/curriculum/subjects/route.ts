import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const classId = new URL(request.url).searchParams.get("classId");
  const subjects = await prisma.subject.findMany({
    where: classId ? { classId } : undefined,
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(subjects);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { classId?: string; name?: string };
  if (!body.classId || !body.name?.trim()) {
    return NextResponse.json({ error: "classId and name are required" }, { status: 400 });
  }
  const created = await prisma.subject.create({
    data: { classId: body.classId, name: body.name.trim() },
  });
  return NextResponse.json(created, { status: 201 });
}
