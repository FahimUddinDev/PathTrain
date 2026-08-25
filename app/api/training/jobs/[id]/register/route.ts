import { NextResponse } from "next/server";
import { z } from "zod";
import { registerJobInOllama } from "@/lib/training/ollama-register";

const bodySchema = z.object({
  modelTag: z.string().min(1).max(128).optional(),
  mode: z.enum(["adapter", "gguf"]).optional(),
  quantization: z.string().min(1).max(32).optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  let body: unknown = {};
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid body: modelTag, mode (adapter|gguf), quantization are optional",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const job = await registerJobInOllama({
      jobId: id,
      modelTag: parsed.data.modelTag,
      mode: parsed.data.mode,
      quantization: parsed.data.quantization,
    });
    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to register Ollama model";
    const notFound =
      message.includes("No TrainingJob found") ||
      message.includes("Record to find does not exist");
    const clientError =
      notFound ||
      message.includes("must be completed") ||
      message.includes("no adapterPath") ||
      message.includes("adapterPath");
    return NextResponse.json(
      { error: message },
      { status: notFound ? 404 : clientError ? 400 : 500 },
    );
  }
}
