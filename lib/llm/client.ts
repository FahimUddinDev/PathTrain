export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmGenerateInput = {
  messages: LlmMessage[];
  maxTokens?: number;
};

/**
 * Cloud LLM wrapper for dataset generation and evaluation (Anthropic or OpenAI).
 * Not used for Playground answers after Milestone 5.
 */
export async function generateWithCloudLlm(_input: LlmGenerateInput): Promise<string> {
  void _input;
  throw new Error("Cloud LLM client is not configured yet (Milestone 6)");
}
