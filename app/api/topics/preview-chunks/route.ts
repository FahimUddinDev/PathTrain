import { NextResponse } from "next/server";
import { z } from "zod";
import { chunkText } from "@/lib/ingestion/chunker";

const bodySchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  text: z.string().trim().min(1, "text is required"),
});

/** Chunk preview before the topic is created — nothing is persisted. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const chunks = chunkText(parsed.data.name, parsed.data.text);
  return NextResponse.json({ chunks });
}
