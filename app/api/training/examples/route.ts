import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const type = params.get("type");
  const topicId = params.get("topicId");

  const examples = await prisma.trainingExample.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(topicId ? { topicId } : {}),
    },
    include: { topic: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(examples);
}
