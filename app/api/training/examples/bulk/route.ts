import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { EXAMPLE_STATUSES } from "@/lib/training/example-types";

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "ids must contain at least one example id"),
  status: z.enum(EXAMPLE_STATUSES),
});

/** Approve or reject many hand-written examples in one pass. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const { ids, status } = parsed.data;
  const result = await prisma.trainingExample.updateMany({
    where: { id: { in: ids } },
    data: { status },
  });

  return NextResponse.json({ updated: result.count, status });
}
