import { NextResponse } from "next/server";
import { errorResponse, parseJsonBody } from "@/lib/curriculum/http";
import { updateChapterSchema } from "@/lib/curriculum/schemas";
import { countDescendants, deleteChapter, updateChapter } from "@/lib/curriculum/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    return NextResponse.json(await countDescendants("chapter", id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsed = updateChapterSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await updateChapter(id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    await deleteChapter(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
