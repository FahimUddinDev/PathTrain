import { NextResponse } from "next/server";
import { errorResponse, parseJsonBody } from "@/lib/curriculum/http";
import { updateSubjectSchema } from "@/lib/curriculum/schemas";
import { countDescendants, deleteSubject, updateSubject } from "@/lib/curriculum/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    return NextResponse.json(await countDescendants("subject", id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsed = updateSubjectSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await updateSubject(id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    await deleteSubject(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
