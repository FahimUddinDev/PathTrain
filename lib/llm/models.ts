import { prisma } from "@/lib/db/prisma";

const DEFAULT_BASE_MODEL = "qwen2.5:7b-instruct";
const DEFAULT_FINETUNED_MODEL = "pathtrain-ft";

export type PlaygroundModelKey = "base" | "fine-tuned";

export type PlaygroundModelOption = {
  key: PlaygroundModelKey;
  label: string;
  /** Ollama model tag passed to /api/test/chat */
  ollamaModel: string;
  available: boolean;
};

export type PlaygroundModels = {
  base: PlaygroundModelOption;
  fineTuned: PlaygroundModelOption;
};

export function getBaseOllamaModel(): string {
  return process.env.OLLAMA_MODEL?.trim() || DEFAULT_BASE_MODEL;
}

export function getConfiguredFinetunedOllamaModel(): string {
  return process.env.OLLAMA_FINETUNED_MODEL?.trim() || DEFAULT_FINETUNED_MODEL;
}

type JobWithOptionalModelTag = {
  modelTag?: string | null;
};

/**
 * Resolve playground model options: base from env, fine-tuned from env or
 * the most recently completed job that registered an Ollama tag.
 */
export async function getPlaygroundModels(): Promise<PlaygroundModels> {
  const baseModel = getBaseOllamaModel();
  const envFineTuned = process.env.OLLAMA_FINETUNED_MODEL?.trim();

  let fineTunedTag = envFineTuned || null;
  if (!fineTunedTag) {
    const recentCompleted = await prisma.trainingJob.findMany({
      where: { status: "completed" },
      orderBy: { completedAt: "desc" },
      take: 20,
    });
    const tagged = recentCompleted.find((job) => {
      const tag = (job as JobWithOptionalModelTag).modelTag;
      return typeof tag === "string" && tag.trim().length > 0;
    }) as JobWithOptionalModelTag | undefined;
    fineTunedTag = tagged?.modelTag?.trim() || null;
  }

  const ollamaFineTuned = fineTunedTag || getConfiguredFinetunedOllamaModel();

  return {
    base: {
      key: "base",
      label: "Base",
      ollamaModel: baseModel,
      available: true,
    },
    fineTuned: {
      key: "fine-tuned",
      label: "Fine-tuned",
      ollamaModel: ollamaFineTuned,
      available: Boolean(fineTunedTag),
    },
  };
}
