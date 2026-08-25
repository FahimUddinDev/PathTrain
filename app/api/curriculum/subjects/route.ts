import { NextResponse } from "next/server";
import { errorResponse, parseJsonBody, stringField } from "@/lib/curriculum/http";
import { createSubjectSchema } from "@/lib/curriculum/schemas";
import { createSubject, listSubjects } from "@/lib/curriculum/service";

export async function GET(request: Request) {
  const classId = new URL(request.url).searchParams.get("classId") ?? undefined;
  try {
    const subjects = await listSubjects(classId);
    return NextResponse.json(subjects);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const body = await parseJsonBody(request);
  const parsed = createSubjectSchema.safeParse({
    classId: stringField(body, "classId"),
    name: stringField(body, "name"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  try {
    const created = await createSubject(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
