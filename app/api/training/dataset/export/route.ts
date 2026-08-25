import { NextResponse } from "next/server";
import { exportApprovedDataset } from "@/lib/training/dataset-exporter";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    classId?: string;
    subjectId?: string;
    chapterId?: string;
  };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const dataset = await exportApprovedDataset(body.name.trim(), {
      classId: body.classId,
      subjectId: body.subjectId,
      chapterId: body.chapterId,
    });
    return NextResponse.json(dataset, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
