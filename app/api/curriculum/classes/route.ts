import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const classes = await prisma.class.findMany({
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(classes);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const created = await prisma.class.create({ data: { name: body.name.trim() } });
  return NextResponse.json(created, { status: 201 });
}
