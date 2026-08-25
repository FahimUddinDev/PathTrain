import { NextResponse } from "next/server";
import { retrieve } from "@/lib/rag/retriever";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    query?: string;
    classId?: string;
    subjectId?: string;
    topicId?: string;
  };

  if (!body.query?.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const chunks = await retrieve({
      query: body.query,
      filter: {
        classId: body.classId,
        subjectId: body.subjectId,
        topicId: body.topicId,
      },
    });
    return NextResponse.json({ chunks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Retrieval failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
