import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    instruction?: string;
    input?: string;
    output?: string;
    status?: string;
  };
  const example = await prisma.trainingExample.update({
    where: { id },
    data: {
      ...(body.instruction !== undefined ? { instruction: body.instruction } : {}),
      ...(body.input !== undefined ? { input: body.input } : {}),
      ...(body.output !== undefined ? { output: body.output } : {}),
      ...(body.status ? { status: body.status } : {}),
    },
  });
  return NextResponse.json(example);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  const existing = await prisma.trainingExample.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Example not found" }, { status: 404 });
  }

  await prisma.trainingExample.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
