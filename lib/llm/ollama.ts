const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct";

export type OllamaGenerateInput = {
  prompt?: string;
  system?: string;
  model?: string;
};

/**
 * Local Ollama wrapper. Playground full answers use this from Milestone 5.
 */
export async function generateWithOllama(input: OllamaGenerateInput): Promise<string> {
  const model = input.model ?? OLLAMA_MODEL;
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: input.prompt ?? "",
      system: input.system,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed (${response.status}) at ${OLLAMA_BASE_URL}`);
  }

  const data = (await response.json()) as { response?: string };
  return data.response ?? "";
}
