import { prisma } from "@/lib/db/prisma";
import { updateChunkEmbedding } from "@/lib/db/vector";

const EMBEDDING_DIM = 1536;

export type EmbedTopicResult = {
  topicId: string;
  embedded: number;
  failed: number;
};

async function embedText(_text: string): Promise<number[]> {
  // Wire to OpenAI/Anthropic embeddings or a local embedder in Milestone 3.
  void _text;
  throw new Error("embedder is not configured yet (Milestone 3)");
}

export async function embedTopicChunks(topicId: string): Promise<EmbedTopicResult> {
  await prisma.topic.update({
    where: { id: topicId },
    data: { status: "embedding" },
  });

  const chunks = await prisma.chunk.findMany({
    where: { topicId },
    orderBy: { chunkOrder: "asc" },
  });

  let embedded = 0;
  let failed = 0;

  try {
    for (const chunk of chunks) {
      try {
        const vector = await embedText(chunk.text);
        if (vector.length !== EMBEDDING_DIM) {
          throw new Error(`Expected ${EMBEDDING_DIM}-d embedding, got ${vector.length}`);
        }
        await updateChunkEmbedding(chunk.id, vector);
        embedded += 1;
      } catch {
        failed += 1;
        await prisma.chunk.update({
          where: { id: chunk.id },
          data: { embeddingStatus: "failed" },
        });
      }
    }

    await prisma.topic.update({
      where: { id: topicId },
      data: { status: failed > 0 && embedded === 0 ? "failed" : "embedded" },
    });
  } catch (error) {
    await prisma.topic.update({
      where: { id: topicId },
      data: { status: "failed" },
    });
    throw error;
  }

  return { topicId, embedded, failed };
}
