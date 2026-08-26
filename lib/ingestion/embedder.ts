import { prisma } from "@/lib/db/prisma";
import { markChunkEmbeddingFailed, updateChunkEmbedding } from "@/lib/db/vector";

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

type EmbedPass = {
  embedded: number;
  failed: number;
  firstError: string | null;
};

/**
 * Embed each chunk independently so one bad chunk does not discard the
 * vectors of the chunks that succeeded alongside it.
 */
async function embedChunksIndividually(
  chunks: { id: string; text: string }[],
): Promise<EmbedPass> {
  let embedded = 0;
  let failed = 0;
  let firstError: string | null = null;

  for (let offset = 0; offset < chunks.length; offset += EMBED_CONCURRENCY) {
    const slice = chunks.slice(offset, offset + EMBED_CONCURRENCY);
    const outcomes = await Promise.allSettled(slice.map((chunk) => embedOneText(chunk.text)));

    for (let i = 0; i < outcomes.length; i++) {
      const outcome = outcomes[i];
      if (outcome.status === "fulfilled") {
        await updateChunkEmbedding(slice[i].id, outcome.value);
        embedded += 1;
      } else {
        await markChunkEmbeddingFailed(slice[i].id);
        failed += 1;
        firstError ??= failureMessage(outcome.reason);
      }
    }
  }

  return { embedded, failed, firstError };
}

/** Derive Topic.status from the chunks rather than from the last pass alone. */
async function settleTopicStatus(topicId: string, firstError: string | null) {
  const [failedChunks, pendingChunks] = await Promise.all([
    prisma.chunk.count({ where: { topicId, embeddingStatus: "failed" } }),
    prisma.chunk.count({ where: { topicId, embeddingStatus: "pending" } }),
  ]);

  if (failedChunks > 0) {
    const detail = firstError ?? "Embedding failed";
    await updateTopicStatus(
      topicId,
      "failed",
      `${failedChunks} chunk${failedChunks === 1 ? "" : "s"} failed to embed. ${detail}`,
    );
    return;
  }

  if (pendingChunks > 0) {
    await updateTopicStatus(topicId, "chunked", null);
    return;
  }

  await updateTopicStatus(topicId, "embedded", null);
}

/**
 * Embed pending (and previously failed) chunks for a topic and write vectors
 * via pgvector raw SQL. Only chunks that still need work are touched, so an
 * edited chunk re-embeds on its own. Topic.status is derived from the chunks
 * afterwards: failed if any chunk failed, embedded once all are done.
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

  let pass: EmbedPass;
  try {
    pass = await embedChunksIndividually(chunks);
  } catch (error) {
    await markTopicFailed(topicId, error);
    throw error;
  }

  await settleTopicStatus(topicId, pass.firstError);

  // A total failure is almost always Ollama being down, so surface it to the
  // caller. Partial failures are reported through Topic.failureReason instead.
  if (pass.embedded === 0 && pass.failed > 0) {
    throw new Error(pass.firstError ?? "Embedding failed");
  }

  return { topicId, embedded: pass.embedded, failed: pass.failed };
}
