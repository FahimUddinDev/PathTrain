import { NextResponse } from "next/server";
import { generateExamplesForTopic } from "@/lib/training/example-generator";

export async function POST(request: Request) {
  const body = (await request.json()) as { topicId?: string; topicIds?: string[] };
  const topicIds = body.topicIds ?? (body.topicId ? [body.topicId] : []);
  if (topicIds.length === 0) {
    return NextResponse.json({ error: "topicId or topicIds is required" }, { status: 400 });
  }

  try {
    const results = [];
    for (const topicId of topicIds) {
      results.push({
        topicId,
        examples: await generateExamplesForTopic(topicId),
      });
    }
    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
