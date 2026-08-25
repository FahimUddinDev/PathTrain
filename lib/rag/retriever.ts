import {
  searchSimilarChunks,
  type RetrievedChunk,
  type VectorFilter,
} from "@/lib/db/vector";
import { embedText } from "@/lib/ingestion/embedder";

export type { RetrievedChunk, VectorFilter };

export const DEFAULT_TOP_K = 8;

export type RetrieveInput = {
  query: string;
  classId?: string;
  subjectId?: string;
  chapterId?: string;
  topicId?: string;
  filter?: VectorFilter;
  topK?: number;
  /** Alias for topK — used by existing API callers. */
  limit?: number;
};

export function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalTopK(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return undefined;
}

/** Parse retrieve fields from a JSON body or URL search-param map. */
export function retrieveInputFromFields(record: Record<string, unknown>): RetrieveInput {
  return {
    query: optionalString(record.query) ?? "",
    classId: optionalString(record.classId),
    subjectId: optionalString(record.subjectId),
    chapterId: optionalString(record.chapterId),
    topicId: optionalString(record.topicId),
    topK: optionalTopK(record.topK) ?? optionalTopK(record.limit),
  };
}

function mergeFilter(input: RetrieveInput): VectorFilter {
  return {
    classId: input.classId ?? input.filter?.classId,
    subjectId: input.subjectId ?? input.filter?.subjectId,
    chapterId: input.chapterId ?? input.filter?.chapterId,
    topicId: input.topicId ?? input.filter?.topicId,
  };
}

/**
 * Embed query text with the same model as stored chunks, then return the
 * top-k similar chunks (cosine similarity scores) from pgvector.
 */
export async function retrieve(input: RetrieveInput): Promise<RetrievedChunk[]> {
  const query = input.query.trim();
  if (!query) {
    throw new Error("query is required");
  }

  const queryEmbedding = await embedText(query);
  const topK = input.topK ?? input.limit ?? DEFAULT_TOP_K;

  return searchSimilarChunks(queryEmbedding, mergeFilter(input), topK);
}
