-- Alter Chunk.embedding from vector(1536) to vector(768) for Ollama nomic-embed-text.
-- Dev DB: drop and recreate column + ivfflat index (no data conversion).

DROP INDEX IF EXISTS "Chunk_embedding_idx";
ALTER TABLE "Chunk" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "Chunk" ADD COLUMN "embedding" vector(768);
CREATE INDEX "Chunk_embedding_idx" ON "Chunk" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
