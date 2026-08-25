import { NextResponse } from "next/server";
import { getJobStatus } from "@/lib/training/job-runner";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const job = await getJobStatus(id);
    return NextResponse.json({
      id: job.id,
      status: job.status,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      adapterPath: job.adapterPath,
    });
  } catch {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
}
