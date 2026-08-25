import { NextResponse } from "next/server";
import { errorResponse, parseJsonBody } from "@/lib/curriculum/http";
import { createClassSchema } from "@/lib/curriculum/schemas";
import { createClass, listClasses } from "@/lib/curriculum/service";

export async function GET() {
  try {
    const classes = await listClasses();
    return NextResponse.json(classes);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const body = await parseJsonBody(request);
  const parsed = createClassSchema.safeParse({
    name:
      typeof (body as { name?: unknown } | null)?.name === "string"
        ? (body as { name: string }).name
        : "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  try {
    const created = await createClass(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
