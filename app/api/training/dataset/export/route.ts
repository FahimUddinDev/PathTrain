import { NextResponse } from "next/server";
import { z } from "zod";
import { exportApprovedDataset } from "@/lib/training/dataset-exporter";

const bodySchema = z.object({
  name: z.string().min(1),
  classId: z.string().min(1).optional(),
  subjectId: z.string().min(1).optional(),
  chapterId: z.string().min(1).optional(),
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
      {
        error: "name is required; classId, subjectId, chapterId are optional filters",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { name, classId, subjectId, chapterId } = parsed.data;

  try {
    const dataset = await exportApprovedDataset(name, {
      classId,
      subjectId,
      chapterId,
    });
    return NextResponse.json(
      {
        id: dataset.id,
        name: dataset.name,
        exampleCount: dataset.exampleCount,
        jsonlPath: dataset.jsonlPath,
        filterCriteria: dataset.filterCriteria,
        log: dataset.log,
        exportedAt: dataset.exportedAt?.toISOString() ?? null,
        createdAt: dataset.createdAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    const clientError =
      message.includes("No approved") || message.includes("required");
    return NextResponse.json(
      { error: message },
      { status: clientError ? 400 : 500 },
    );
  }
}
