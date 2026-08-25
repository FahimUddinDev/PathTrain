import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  EXAMPLE_TYPES,
  generateExamplesByTypes,
} from "@/lib/training/example-generator";

const bodySchema = z.object({
  topicId: z.string().min(1),
  types: z.array(z.enum(EXAMPLE_TYPES)).min(1),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "topicId and types[] are required", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { topicId, types } = parsed.data;

  try {
    const generated = await generateExamplesByTypes(topicId, types);

    const saved = await prisma.$transaction(
      generated.map((example) =>
        prisma.trainingExample.create({
          data: {
            topicId,
            type: example.type,
            instruction: example.instruction,
            input: example.input,
            output: example.output,
            status: "generated",
          },
        }),
      ),
    );

    return NextResponse.json({ topicId, examples: saved }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
