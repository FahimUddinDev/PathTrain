import { prisma } from "@/lib/db/prisma";
import { updateChunkEmbedding } from "@/lib/db/vector";

const EMBEDDING_DIM = 768;
const EMBED_CONCURRENCY = 6;
const EMBEDDING_STATUS_VISIBLE_MS = 250;
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_EMBEDDING_MODEL = "nomic-embed-text";

export type EmbedTopicResult = {
  topicId: string;
  embedded: number;
  failed: number;
};

function ollamaBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL;
}

function embeddingModel(): string {
  return process.env.OLLAMA_EMBEDDING_MODEL?.trim() || DEFAULT_OLLAMA_EMBEDDING_MODEL;
}

function failureMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Embedding failed";
}

function ollamaUnreachableError(): Error {
  return new Error(
    `Ollama is not reachable at ${ollamaBaseUrl()}. Start Ollama and pull ${embeddingModel()}.`,
  );
}

type OllamaEmbeddingResponse = {
  embedding?: number[];
  error?: string;
};

async function embedOneText(text: string): Promise<number[]> {
  const model = embeddingModel();
  let response: Response;
  try {
    response = await fetch(`${ollamaBaseUrl()}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
    });
  } catch {
    throw ollamaUnreachableError();
  }

  const payload = (await response.json().catch(() => ({}))) as OllamaEmbeddingResponse;

  if (!response.ok) {
    const detail = payload.error ?? `HTTP ${response.status}`;
    throw new Error(`Ollama embedding request failed (${response.status}): ${detail}`);
  }

  const embedding = payload.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("Ollama embedding response missing embedding vector");
  }
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Expected ${EMBEDDING_DIM}-d embedding from ${model}, got ${embedding.length}`,
    );
  }
  return embedding;
}

/**
 * Embed texts with Ollama nomic-embed-text (768-d, matches Chunk.embedding / pgvector).
 * One prompt per /api/embeddings call; requests run with limited concurrency.
 * Exported so the retriever can embed queries with the same model.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const results: number[][] = new Array(texts.length);

  for (let offset = 0; offset < texts.length; offset += EMBED_CONCURRENCY) {
    const slice = texts.slice(offset, offset + EMBED_CONCURRENCY);
    const vectors = await Promise.all(slice.map((text) => embedOneText(text)));
    for (let i = 0; i < vectors.length; i++) {
      results[offset + i] = vectors[i];
    }
  }

  return results;
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
  // Give UI polls a window to observe the intermediate status.
  await new Promise((resolve) => setTimeout(resolve, EMBEDDING_STATUS_VISIBLE_MS));

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
    const vectors = await embedTexts(chunks.map((chunk) => chunk.text));
    for (let i = 0; i < chunks.length; i++) {
      await updateChunkEmbedding(chunks[i].id, vectors[i]);
      embedded += 1;
    }

    await updateTopicStatus(topicId, "embedded", null);
  } catch (error) {
    await markTopicFailed(topicId, error);
    throw error;
  }

  return { topicId, embedded, failed: 0 };
}
