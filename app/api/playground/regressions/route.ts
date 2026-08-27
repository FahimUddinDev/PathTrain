import { NextResponse } from "next/server";
import {
  createRegressionNote,
  createRegressionSchema,
  listRegressionNotes,
} from "@/lib/playground/regressions";

export async function GET(request: Request) {
  const topicId = new URL(request.url).searchParams.get("topicId")?.trim();
  try {
    return NextResponse.json({ notes: await listRegressionNotes(topicId || undefined) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load regression notes" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createRegressionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  try {
    const note = await createRegressionNote(parsed.data);
    return NextResponse.json({ id: note.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save regression note" },
      { status: 500 },
    );
  }
}
