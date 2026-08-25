import { countTokens as countGptTokens } from "gpt-tokenizer/encoding/cl100k_base";

export const MIN_TOKENS = 300;
export const MAX_TOKENS = 500;

type PieceKind = "paragraph" | "line" | "sentence" | "word";

type Piece = {
  text: string;
  kind: PieceKind;
};

export type ChunkDraft = {
  chunkOrder: number;
  text: string;
  tokenCount: number;
};

/** cl100k_base token count (GPT-3.5 / GPT-4 / text-embedding-3). */
export function countTokens(text: string): number {
  if (!text) return 0;
  return countGptTokens(text);
}

function topicPrefix(topicName: string): string {
  return `Topic: ${topicName}\n\n`;
}

function separatorBefore(kind: PieceKind): string {
  if (kind === "paragraph") return "\n\n";
  if (kind === "line") return "\n";
  return " ";
}

function joinPieces(pieces: Piece[]): string {
  if (pieces.length === 0) return "";
  let out = pieces[0].text;
  for (let i = 1; i < pieces.length; i++) {
    out += separatorBefore(pieces[i].kind) + pieces[i].text;
  }
  return out;
}

function splitSentences(text: string): string[] {
  const parts: string[] = [];
  const re = /[.!?।]+(?:\s+|$)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const sentence = text.slice(last, match.index + match[0].length).trim();
    if (sentence) parts.push(sentence);
    last = match.index + match[0].length;
  }
  const tail = text.slice(last).trim();
  if (tail) parts.push(tail);
  return parts.length > 0 ? parts : [text.trim()];
}

function explode(text: string, maxTokens: number, kind: PieceKind): Piece[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (countTokens(trimmed) <= maxTokens) {
    return [{ text: trimmed, kind }];
  }

  if (kind === "paragraph") {
    const parts = trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      return parts.flatMap((part) => explode(part, maxTokens, "paragraph"));
    }
    return explode(trimmed, maxTokens, "line");
  }

  if (kind === "line") {
    const parts = trimmed.split(/\n/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      return parts.flatMap((part) => explode(part, maxTokens, "line"));
    }
    return explode(trimmed, maxTokens, "sentence");
  }

  if (kind === "sentence") {
    const parts = splitSentences(trimmed).filter(Boolean);
    if (parts.length > 1) {
      return parts.flatMap((part) => explode(part, maxTokens, "sentence"));
    }
    return explode(trimmed, maxTokens, "word");
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    return [{ text: trimmed, kind: "word" }];
  }
  return words.flatMap((word) => explode(word, maxTokens, "word"));
}

/**
 * Split topic text into 300–500 token chunks.
 * Each chunk is prefixed with the topic name. Splits on paragraph, line,
 * then sentence boundaries; never mid-word. A final remainder may be
 * under 300 tokens when there is not enough leftover text.
 */
export function chunkText(topicName: string, rawText: string): ChunkDraft[] {
  const prefix = topicPrefix(topicName);
  const body = rawText.trim();
  if (!body) return [];

  const maxBodyTokens = Math.max(1, MAX_TOKENS - countTokens(prefix));
  const pieces = explode(body, maxBodyTokens, "paragraph");
  const chunks: ChunkDraft[] = [];
  let buffer: Piece[] = [];

  const flush = () => {
    const chunkBody = joinPieces(buffer).trim();
    if (!chunkBody) return;
    const text = `${prefix}${chunkBody}`;
    chunks.push({
      chunkOrder: chunks.length,
      text,
      tokenCount: countTokens(text),
    });
    buffer = [];
  };

  for (const piece of pieces) {
    const candidate = joinPieces([...buffer, piece]);
    if (buffer.length > 0 && countTokens(`${prefix}${candidate}`) > MAX_TOKENS) {
      flush();
    }
    buffer.push(piece);
  }

  flush();
  return chunks;
}
