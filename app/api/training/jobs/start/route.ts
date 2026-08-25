import { NextResponse } from "next/server";
import { z } from "zod";
import { startTrainingJob } from "@/lib/training/job-runner";

const bodySchema = z.object({
  datasetId: z.string().min(1),
  baseModel: z.string().min(1).optional(),
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
        error: "datasetId is required; baseModel is optional",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { datasetId, baseModel } = parsed.data;

  try {
    const job = await startTrainingJob(datasetId, baseModel);
    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start job";
    const notFound =
      message.includes("No TrainingDataset found") ||
      message.includes("Record to find does not exist");
    const clientError =
      notFound ||
      message.includes("no JSONL") ||
      message.includes("export approved");
    return NextResponse.json(
      { error: message },
      { status: notFound ? 404 : clientError ? 400 : 500 },
    );
  }
}
