import type { RetrievedChunk } from "@/lib/rag/retriever";

export type BuildRagPromptInput = {
  query: string;
  chunks: RetrievedChunk[];
  /** Editable Playground system prompt. Whitespace-only falls back to the default. */
  systemPrompt?: string;
};

export type BuiltPrompt = {
  system: string;
  user: string;
};

export const DEFAULT_SYSTEM_PROMPT = `You are a curriculum tutor for school textbook content.

Answer using only the provided textbook excerpts.
If the excerpts do not contain enough information, say you do not know. Do not invent facts.
When it helps the student, explain in simple language and include a real-life example.`;

function resolveSystemPrompt(systemPrompt?: string): string {
  const trimmed = systemPrompt?.trim();
  return trimmed || DEFAULT_SYSTEM_PROMPT;
}

function formatChunk(chunk: RetrievedChunk, index: number): string {
  const orderLabel =
    typeof chunk.chunkOrder === "number" ? ` | order ${chunk.chunkOrder}` : "";
  return `[Excerpt ${index + 1}${orderLabel}]\n${chunk.text.trim()}`;
}

function formatContext(chunks: RetrievedChunk[]): string {
  const usable = chunks.filter((chunk) => chunk.text?.trim());
  if (usable.length === 0) {
    return "(No textbook excerpts were retrieved for this question.)";
  }
  return usable.map((chunk, index) => formatChunk(chunk, index)).join("\n\n---\n\n");
}

/**
 * Combine retrieved chunks, an editable system prompt, and the user query
 * into the final LLM prompt. Similarity scores stay out of the prompt —
 * they are for Playground display, not the model.
 */
export function buildRagPrompt(input: BuildRagPromptInput): BuiltPrompt {
  const query = input.query.trim();
  if (!query) {
    throw new Error("query is required");
  }

  return {
    system: resolveSystemPrompt(input.systemPrompt),
    user: `Textbook excerpts:\n${formatContext(input.chunks)}\n\nQuestion:\n${query}`,
  };
}
