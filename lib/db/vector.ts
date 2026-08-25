import { prisma } from "./prisma";

export type VectorFilter = {
  classId?: string;
  subjectId?: string;
  topicId?: string;
};

export type RetrievedChunk = {
  id: string;
  topicId: string;
  text: string;
  chunkOrder: number;
  score: number;
};

/**
 * Cosine similarity search over Chunk.embedding (pgvector).
 * Raw SQL only — Prisma has no native vector operators.
 */
export async function searchSimilarChunks(
  queryEmbedding: number[],
  filter: VectorFilter = {},
  limit = 8,
): Promise<RetrievedChunk[]> {
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  return prisma.$queryRaw<RetrievedChunk[]>`
    SELECT
      c.id,
      c."topicId",
      c.text,
      c."chunkOrder",
      1 - (c.embedding <=> ${vectorLiteral}::vector) AS score
    FROM "Chunk" c
    INNER JOIN "Topic" t ON t.id = c."topicId"
    INNER JOIN "Chapter" ch ON ch.id = t."chapterId"
    INNER JOIN "Subject" s ON s.id = ch."subjectId"
    WHERE c.embedding IS NOT NULL
      AND (${filter.classId ?? null}::text IS NULL OR s."classId" = ${filter.classId ?? null})
      AND (${filter.subjectId ?? null}::text IS NULL OR s.id = ${filter.subjectId ?? null})
      AND (${filter.topicId ?? null}::text IS NULL OR t.id = ${filter.topicId ?? null})
    ORDER BY c.embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `;
}

export async function updateChunkEmbedding(chunkId: string, embedding: number[]) {
  const vectorLiteral = `[${embedding.join(",")}]`;
  await prisma.$executeRaw`
    UPDATE "Chunk"
    SET embedding = ${vectorLiteral}::vector,
        "embeddingStatus" = 'embedded'
    WHERE id = ${chunkId}
  `;
}
