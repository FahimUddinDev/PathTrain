import { prisma } from "@/lib/db/prisma";
import { updateChunkEmbedding } from "@/lib/db/vector";

const EMBEDDING_DIM = 1536;
const EMBED_BATCH_SIZE = 64;
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

export type EmbedTopicResult = {
  topicId: string;
  embedded: number;
  failed: number;
};

function embeddingModel(): string {
  return process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
}

function failureMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Embedding failed";
}

type OpenAIEmbeddingResponse = {
  data?: Array<{ embedding: number[]; index: number }>;
  error?: { message?: string };
};

/**
 * Embed texts with OpenAI (1536-d, matches Chunk.embedding / pgvector).
 * Exported so the retriever can embed queries with the same model.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const response = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: embeddingModel(),
      input: texts,
    }),
  });

  const payload = (await response.json()) as OpenAIEmbeddingResponse;

  if (!response.ok) {
    const detail = payload.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`Embedding request failed: ${detail}`);
  }

  const items = [...(payload.data ?? [])].sort((a, b) => a.index - b.index);
  if (items.length !== texts.length) {
    throw new Error(`Expected ${texts.length} embeddings, got ${items.length}`);
  }

  return items.map((item) => {
    if (item.embedding.length !== EMBEDDING_DIM) {
      throw new Error(
        `Expected ${EMBEDDING_DIM}-d embedding from ${embeddingModel()}, got ${item.embedding.length}`,
      );
    }
    return item.embedding;
  });
}

export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}

function topicStatusUpdate(status: string, failureReason: string | null) {
  return { status, failureReason };
}

async function updateTopicStatus(
  topicId: string,
  status: string,
  failureReason: string | null,
) {
  await prisma.topic.update({
    where: { id: topicId },
    data: topicStatusUpdate(status, failureReason),
  });
}

async function markTopicFailed(topicId: string, error: unknown) {
  await updateTopicStatus(topicId, "failed", failureMessage(error));
}

/**
 * Embed pending (and previously failed) chunks for a topic, write vectors
 * via pgvector raw SQL, then set Topic.status to embedded.
 */
export async function embedTopicChunks(topicId: string): Promise<EmbedTopicResult> {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    select: { id: true },
  });
  if (!topic) {
    throw new Error("Topic not found");
  }

  await updateTopicStatus(topicId, "embedding", null);

  const chunks = await prisma.chunk.findMany({
    where: { topicId, embeddingStatus: { in: ["pending", "failed"] } },
    orderBy: { chunkOrder: "asc" },
    select: { id: true, text: true },
  });

  if (chunks.length === 0) {
    const existing = await prisma.chunk.count({ where: { topicId } });
    if (existing === 0) {
      const error = new Error("No chunks to embed. Chunk the topic first.");
      await markTopicFailed(topicId, error);
      throw error;
    }

    await updateTopicStatus(topicId, "embedded", null);
    return { topicId, embedded: 0, failed: 0 };
  }

  let embedded = 0;

  try {
    for (let offset = 0; offset < chunks.length; offset += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(offset, offset + EMBED_BATCH_SIZE);
      const vectors = await embedTexts(batch.map((chunk) => chunk.text));

      for (let i = 0; i < batch.length; i++) {
        await updateChunkEmbedding(batch[i].id, vectors[i]);
        embedded += 1;
      }
    }

    await updateTopicStatus(topicId, "embedded", null);
  } catch (error) {
    await markTopicFailed(topicId, error);
    throw error;
  }

  return { topicId, embedded, failed: 0 };
}
