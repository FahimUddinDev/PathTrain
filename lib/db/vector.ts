import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type VectorFilter = {
  classId?: string;
  subjectId?: string;
  chapterId?: string;
  topicId?: string;
};

export type RetrievedChunk = {
  id: string;
  topicId: string;
  text: string;
  chunkOrder: number;
  score: number;
};

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

function eqIfPresent(column: Prisma.Sql, value?: string): Prisma.Sql | undefined {
  const id = value?.trim();
  if (!id) return undefined;
  return Prisma.sql`${column} = ${id}`;
}

/**
 * Cosine similarity search over Chunk.embedding (pgvector).
 * Raw SQL only — Prisma has no native vector operators.
 */
export async function searchSimilarChunks(
  queryEmbedding: number[],
  filters: VectorFilter = {},
  topK = 8,
): Promise<RetrievedChunk[]> {
  const queryVector = toVectorLiteral(queryEmbedding);
  const limit = topK > 0 ? Math.floor(topK) : 8;

  const whereParts = [
    Prisma.sql`c.embedding IS NOT NULL`,
    eqIfPresent(Prisma.sql`s."classId"`, filters.classId),
    eqIfPresent(Prisma.sql`s.id`, filters.subjectId),
    eqIfPresent(Prisma.sql`ch.id`, filters.chapterId),
    eqIfPresent(Prisma.sql`t.id`, filters.topicId),
  ].filter((part): part is Prisma.Sql => part !== undefined);

  const rows = await prisma.$queryRaw<RetrievedChunk[]>`
    SELECT
      c.id,
      c."topicId",
      c.text,
      c."chunkOrder",
      1 - (c.embedding <=> ${queryVector}::vector) AS score
    FROM "Chunk" c
    INNER JOIN "Topic" t ON t.id = c."topicId"
    INNER JOIN "Chapter" ch ON ch.id = t."chapterId"
    INNER JOIN "Subject" s ON s.id = ch."subjectId"
    WHERE ${Prisma.join(whereParts, " AND ")}
    ORDER BY c.embedding <=> ${queryVector}::vector
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    ...row,
    score: Number(row.score),
  }));
}

export async function updateChunkEmbedding(chunkId: string, embedding: number[]) {
  const vectorLiteral = toVectorLiteral(embedding);
  await prisma.$executeRaw`
    UPDATE "Chunk"
    SET embedding = ${vectorLiteral}::vector,
        "embeddingStatus" = 'embedded'
    WHERE id = ${chunkId}
  `;
}

/**
 * Drop a stale vector when chunk text changes, so retrieval cannot return
 * text that no longer matches its embedding before the re-embed lands.
 */
export async function markChunkPending(chunkId: string) {
  await prisma.$executeRaw`
    UPDATE "Chunk"
    SET embedding = NULL,
        "embeddingStatus" = 'pending'
    WHERE id = ${chunkId}
  `;
}

export async function markChunkEmbeddingFailed(chunkId: string) {
  await prisma.$executeRaw`
    UPDATE "Chunk"
    SET "embeddingStatus" = 'failed'
    WHERE id = ${chunkId}
  `;
}
