import { NextResponse } from "next/server";
import { embedTopicChunks } from "@/lib/ingestion/embedder";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const result = await embedTopicChunks(id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Embed failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
