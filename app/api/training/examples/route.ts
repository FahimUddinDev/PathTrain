import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { EXAMPLE_TYPES } from "@/lib/training/example-generator";

const createSchema = z.object({
  topicId: z.string().min(1),
  type: z.enum(EXAMPLE_TYPES),
  instruction: z.string().min(1),
  input: z.string().optional().default(""),
  output: z.string().min(1),
  status: z.enum(["generated", "approved", "rejected"]).optional().default("generated"),
});

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

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "topicId, type, instruction, and output are required; input and status are optional",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { topicId, type, instruction, input, output, status } = parsed.data;

  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: {
      chapter: { include: { subject: { include: { class: true } } } },
    },
  });

  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  const example = await prisma.trainingExample.create({
    data: {
      topicId,
      type,
      instruction: instruction.trim(),
      input: input ?? "",
      output: output.trim(),
      status,
      metadata: {
        class: topic.chapter.subject.class.name,
        subject: topic.chapter.subject.name,
        topic: topic.name,
        type,
      },
    },
    include: { topic: true },
  });

  return NextResponse.json(example, { status: 201 });
}
