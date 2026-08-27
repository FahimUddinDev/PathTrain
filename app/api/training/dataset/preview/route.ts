import { NextResponse } from "next/server";
import { countApprovedExamples } from "@/lib/training/queries";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const classId = params.get("classId") ?? undefined;
  const subjectId = params.get("subjectId") ?? undefined;
  const chapterId = params.get("chapterId") ?? undefined;

  try {
    const count = await countApprovedExamples({ classId, subjectId, chapterId });
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json(
      { error: "Failed to count approved examples" },
      { status: 500 },
    );
  }
}
