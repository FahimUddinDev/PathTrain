import { searchSimilarChunks, type VectorFilter, type RetrievedChunk } from "@/lib/db/vector";

export type RetrieveInput = {
  query: string;
  filter?: VectorFilter;
  limit?: number;
};

async function embedQuery(_query: string): Promise<number[]> {
  void _query;
  throw new Error("query embedding is not configured yet (Milestone 3/4)");
}

export async function retrieve(input: RetrieveInput): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embedQuery(input.query);
  return searchSimilarChunks(queryEmbedding, input.filter ?? {}, input.limit ?? 8);
}
