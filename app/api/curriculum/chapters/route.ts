import { NextResponse } from "next/server";
import { errorResponse, parseJsonBody, stringField } from "@/lib/curriculum/http";
import { createChapterSchema } from "@/lib/curriculum/schemas";
import { createChapter, listChapters } from "@/lib/curriculum/service";

export async function GET(request: Request) {
  const subjectId = new URL(request.url).searchParams.get("subjectId") ?? undefined;
  try {
    const chapters = await listChapters(subjectId);
    return NextResponse.json(chapters);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const body = await parseJsonBody(request);
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const parsed = createChapterSchema.safeParse({
    subjectId: stringField(body, "subjectId"),
    name: stringField(body, "name"),
    ...(record && "order" in record ? { order: record.order } : {}),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  try {
    const created = await createChapter(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
