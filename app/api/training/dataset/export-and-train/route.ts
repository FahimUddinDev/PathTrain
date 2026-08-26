import { NextResponse } from "next/server";
import { z } from "zod";
import { exportApprovedDataset } from "@/lib/training/dataset-exporter";
import { startTrainingJob } from "@/lib/training/job-runner";

const bodySchema = z.object({
  name: z.string().min(1),
  classId: z.string().min(1).optional(),
  subjectId: z.string().min(1).optional(),
  chapterId: z.string().min(1).optional(),
  baseModel: z.string().min(1).optional(),
});

/** One-click FR-M7-01: export the approved examples, then queue training on them. */
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
        error: "name is required; classId, subjectId, chapterId, baseModel are optional",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { name, classId, subjectId, chapterId, baseModel } = parsed.data;

  let dataset;
  try {
    dataset = await exportApprovedDataset(name, { classId, subjectId, chapterId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    const clientError = message.includes("No approved") || message.includes("required");
    return NextResponse.json({ error: message }, { status: clientError ? 400 : 500 });
  }

  try {
    const job = await startTrainingJob(dataset.id, baseModel);
    return NextResponse.json(
      {
        dataset: {
          id: dataset.id,
          name: dataset.name,
          exampleCount: dataset.exampleCount,
          jsonlPath: dataset.jsonlPath,
          exportedAt: dataset.exportedAt?.toISOString() ?? null,
        },
        job: { id: job.id, status: job.status, baseModel: job.baseModel },
      },
      { status: 202 },
    );
  } catch (error) {
    // The dataset exists either way, so report it alongside the failure rather
    // than making the admin guess whether the export survived.
    const message = error instanceof Error ? error.message : "Failed to start training";
    return NextResponse.json(
      { error: message, dataset: { id: dataset.id, name: dataset.name } },
      { status: 500 },
    );
  }
}
