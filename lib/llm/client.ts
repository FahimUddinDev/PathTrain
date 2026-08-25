export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmGenerateInput = {
  messages: LlmMessage[];
  maxTokens?: number;
};

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";

function anthropicModel(): string {
  return process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
}

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

type AnthropicResponse = {
  content?: Array<{ type?: string; text?: string }>;
  error?: { message?: string };
};

/**
 * Cloud LLM wrapper for dataset generation and evaluation (Anthropic or OpenAI).
 * Not used for Playground answers after Milestone 5.
 */
export async function generateWithCloudLlm(input: LlmGenerateInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const systemParts: string[] = [];
  const messages: AnthropicMessage[] = [];

  for (const message of input.messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
    } else {
      messages.push({ role: message.role, content: message.content });
    }
  }

  const body: Record<string, unknown> = {
    model: anthropicModel(),
    max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages,
  };

  if (systemParts.length > 0) {
    body.system = systemParts.join("\n\n");
  }

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as AnthropicResponse;

  if (!response.ok) {
    const detail = payload.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`Anthropic request failed: ${detail}`);
  }

  const text = payload.content?.[0]?.text;
  if (!text) {
    throw new Error("Anthropic response missing text content");
  }

  return text;
}
