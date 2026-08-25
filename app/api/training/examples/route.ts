import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const status = new URL(request.url).searchParams.get("status");
  const examples = await prisma.trainingExample.findMany({
    where: status ? { status } : undefined,
    include: { topic: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(examples);
}
