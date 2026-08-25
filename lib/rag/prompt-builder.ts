import type { RetrievedChunk } from "@/lib/db/vector";

export type BuiltPrompt = {
  system: string;
  user: string;
};

const DEFAULT_SYSTEM = `You are a curriculum tutor. Answer only from the provided textbook chunks.
If the chunks do not contain the answer, say you do not know.
When helpful, explain in simple language and give a real-life example.`;

export function buildRagPrompt(options: {
  systemPrompt?: string;
  query: string;
  chunks: RetrievedChunk[];
}): BuiltPrompt {
  const context = options.chunks
    .map((chunk, i) => `[Chunk ${i + 1} | score ${chunk.score.toFixed(3)}]\n${chunk.text}`)
    .join("\n\n---\n\n");

  return {
    system: options.systemPrompt?.trim() || DEFAULT_SYSTEM,
    user: `Context:\n${context}\n\nQuestion:\n${options.query}`,
  };
}
