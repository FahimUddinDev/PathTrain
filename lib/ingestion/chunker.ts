const MIN_TOKENS = 300;
const MAX_TOKENS = 500;

/** Rough token estimate (~4 chars per token). Replace with a tokenizer if needed. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.trim().length / 4);
}

export type ChunkDraft = {
  chunkOrder: number;
  text: string;
  tokenCount: number;
};

/**
 * Split topic text into 300–500 token chunks.
 * Each chunk is prefixed with the topic name. Splits on paragraphs, never mid-word.
 */
export function chunkText(topicName: string, rawText: string): ChunkDraft[] {
  const prefix = `Topic: ${topicName}\n\n`;
  const prefixTokens = estimateTokens(prefix);
  const paragraphs = rawText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: ChunkDraft[] = [];
  let buffer = "";

  const flush = () => {
    const body = buffer.trim();
    if (!body) return;
    const text = `${prefix}${body}`;
    chunks.push({
      chunkOrder: chunks.length,
      text,
      tokenCount: estimateTokens(text),
    });
    buffer = "";
  };

  for (const paragraph of paragraphs) {
    const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    const nextTokens = prefixTokens + estimateTokens(next);

    if (buffer && nextTokens > MAX_TOKENS) {
      flush();
      buffer = paragraph;
      continue;
    }

    buffer = next;

    if (prefixTokens + estimateTokens(buffer) >= MIN_TOKENS) {
      const remaining = paragraphs.slice(paragraphs.indexOf(paragraph) + 1);
      const wouldOverflow =
        remaining.length > 0 &&
        prefixTokens + estimateTokens(`${buffer}\n\n${remaining[0]}`) > MAX_TOKENS;
      if (wouldOverflow) flush();
    }
  }

  flush();
  return chunks;
}
