function getOllamaBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434";
}

function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL?.trim() || "qwen2.5:7b-instruct";
}

export type OllamaGenerateInput = {
  prompt?: string;
  system?: string;
  model?: string;
};

type OllamaGenerateChunk = {
  response?: string;
  done?: boolean;
};

function ollamaUnreachableError(baseUrl: string, model: string): Error {
  return new Error(
    `Ollama is not reachable at ${baseUrl}. Start Ollama and pull ${model}.`,
  );
}

function ollamaRequestFailedError(baseUrl: string, status: number, detail?: string): Error {
  return new Error(
    `Ollama request failed (${status}) at ${baseUrl}${detail ? `: ${detail}` : ""}`,
  );
}

function generateRequestBody(input: OllamaGenerateInput, stream: boolean) {
  return {
    model: input.model ?? getOllamaModel(),
    prompt: input.prompt ?? "",
    ...(input.system ? { system: input.system } : {}),
    stream,
  };
}

async function postGenerate(input: OllamaGenerateInput, stream: boolean): Promise<Response> {
  const model = input.model ?? getOllamaModel();
  const baseUrl = getOllamaBaseUrl();
  const body = JSON.stringify(generateRequestBody(input, stream));

  // Try configured base URL first
  try {
    return await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch (error) {
    // If localhost failed on Windows, fallback to 127.0.0.1
    if (baseUrl.includes("localhost")) {
      const fallbackUrl = baseUrl.replace("localhost", "127.0.0.1");
      try {
        return await fetch(`${fallbackUrl}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      } catch {
        // Ignored, throw primary error below
      }
    }
    throw ollamaUnreachableError(baseUrl, model);
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
    throw ollamaRequestFailedError(getOllamaBaseUrl(), response.status);
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
    throw ollamaRequestFailedError(getOllamaBaseUrl(), response.status);
  }

  if (!response.body) {
    throw new Error(`Ollama returned an empty stream at ${getOllamaBaseUrl()}`);
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
