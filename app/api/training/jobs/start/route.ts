import { NextResponse } from "next/server";
import { startTrainingJob } from "@/lib/training/job-runner";

export async function POST(request: Request) {
  const body = (await request.json()) as { datasetId?: string; baseModel?: string };
  if (!body.datasetId) {
    return NextResponse.json({ error: "datasetId is required" }, { status: 400 });
  }

  try {
    const job = await startTrainingJob(body.datasetId, body.baseModel);
    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start job";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
