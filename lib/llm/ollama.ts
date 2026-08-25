const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct";

export type OllamaGenerateInput = {
  prompt?: string;
  system?: string;
  model?: string;
};

type OllamaGenerateChunk = {
  response?: string;
  done?: boolean;
};

function ollamaUnreachableError(model: string): Error {
  return new Error(
    `Ollama is not reachable at ${OLLAMA_BASE_URL}. Start Ollama and pull ${model}.`,
  );
}

function ollamaRequestFailedError(status: number): Error {
  return new Error(`Ollama request failed (${status}) at ${OLLAMA_BASE_URL}`);
}

function generateRequestBody(input: OllamaGenerateInput, stream: boolean) {
  return {
    model: input.model ?? OLLAMA_MODEL,
    prompt: input.prompt ?? "",
    ...(input.system ? { system: input.system } : {}),
    stream,
  };
}

async function postGenerate(input: OllamaGenerateInput, stream: boolean): Promise<Response> {
  const model = input.model ?? OLLAMA_MODEL;

  try {
    return await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(generateRequestBody(input, stream)),
    });
  } catch {
    throw ollamaUnreachableError(model);
  }
}

function parseStreamLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let chunk: OllamaGenerateChunk;
  try {
    chunk = JSON.parse(trimmed) as OllamaGenerateChunk;
  } catch {
    return null;
  }

  return chunk.response ?? null;
}

/**
 * Local Ollama wrapper. Playground full answers use this from Milestone 5.
 */
export async function generateWithOllama(input: OllamaGenerateInput): Promise<string> {
  const response = await postGenerate(input, false);

  if (!response.ok) {
    throw ollamaRequestFailedError(response.status);
  }

  const data = (await response.json()) as OllamaGenerateChunk;
  return data.response ?? "";
}

/**
 * Stream token deltas from Ollama's /api/generate endpoint (NDJSON over HTTP).
 */
export async function* streamWithOllama(input: OllamaGenerateInput): AsyncGenerator<string> {
  const response = await postGenerate(input, true);

  if (!response.ok) {
    throw ollamaRequestFailedError(response.status);
  }

  if (!response.body) {
    throw new Error(`Ollama returned an empty stream at ${OLLAMA_BASE_URL}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const token = parseStreamLine(line);
        if (token) yield token;
      }
    }

    const trailing = parseStreamLine(buffer);
    if (trailing) yield trailing;
  } finally {
    reader.releaseLock();
  }
}
