import { z } from "zod";
import { generateWithCloudLlm, type LlmMessage } from "@/lib/llm/client";
import { prisma } from "@/lib/db/prisma";

export const EXAMPLE_TYPES = [
  "qna",
  "mcq",
  "srijonsil",
  "evaluation",
  "multi_explain",
] as const;

export type ExampleType = (typeof EXAMPLE_TYPES)[number];

export type GeneratedExample = {
  type: ExampleType;
  instruction: string;
  input: string;
  output: string;
};

export type TopicContext = {
  topicId: string;
  topicName: string;
  rawText: string;
  className: string;
  subjectName: string;
  chapterName: string;
};

export type EvaluationScenario = "correct" | "partial" | "wrong";

const generatedExampleSchema = z.object({
  instruction: z.string().min(1),
  input: z.string(),
  output: z.string().min(1),
});

const DATASET_SYSTEM_PROMPT = `You are a curriculum dataset author for school textbook fine-tuning.

Rules:
- Ground every example strictly in the provided topic text. Do not invent facts beyond the text.
- Use clear, age-appropriate language for the class level.
- Return ONLY valid JSON with keys: instruction, input, output (no markdown fences, no commentary).
- instruction: the task shown to the fine-tuned model.
- input: the user-side content (may be empty string when not needed).
- output: the ideal model response.`;

const JSON_OUTPUT_SUFFIX = `Respond with a single JSON object:
{"instruction":"...","input":"...","output":"..."}`;

function formatCurriculumHeader(context: TopicContext): string {
  return `Class: ${context.className}
Subject: ${context.subjectName}
Chapter: ${context.chapterName}
Topic: ${context.topicName}`;
}

function formatTopicText(context: TopicContext): string {
  return `${formatCurriculumHeader(context)}

Topic text:
${context.rawText.trim()}`;
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseLlmExample(raw: string, type: ExampleType): GeneratedExample {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    throw new Error(`Failed to parse ${type} example: invalid JSON from LLM`);
  }

  const result = generatedExampleSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Failed to parse ${type} example: ${result.error.message}`);
  }

  return { type, ...result.data };
}

async function runGenerator(messages: LlmMessage[], type: ExampleType): Promise<GeneratedExample> {
  const raw = await generateWithCloudLlm({ messages, maxTokens: 2048 });
  return parseLlmExample(raw, type);
}

// --- Prompt templates ---

export function buildQnAPrompt(context: TopicContext): LlmMessage[] {
  return [
    { role: "system", content: DATASET_SYSTEM_PROMPT },
    {
      role: "user",
      content: `${formatTopicText(context)}

Create one concept-explanation Q&A pair for fine-tuning.

Requirements:
- instruction: ask the model to answer a question about this topic (mention the topic name).
- input: a clear, specific question a student might ask about the topic.
- output: a grounded answer using only the topic text; use simple language and 2-4 sentences.

${JSON_OUTPUT_SUFFIX}`,
    },
  ];
}

export function buildMCQPrompt(context: TopicContext): LlmMessage[] {
  return [
    { role: "system", content: DATASET_SYSTEM_PROMPT },
    {
      role: "user",
      content: `${formatTopicText(context)}

Create one multiple-choice question (MCQ) for fine-tuning.

Requirements:
- instruction: ask the model to answer the multiple-choice question and explain briefly.
- input: include the question stem and four labeled options (A–D) on separate lines.
- output: state the correct option letter, then give a 1-2 sentence rationale grounded in the topic text.

${JSON_OUTPUT_SUFFIX}`,
    },
  ];
}

export function buildSrijonsilPrompt(context: TopicContext): LlmMessage[] {
  return [
    { role: "system", content: DATASET_SYSTEM_PROMPT },
    {
      role: "user",
      content: `${formatTopicText(context)}

Create one srijonsil (creative / open-ended) example for fine-tuning.

Requirements:
- instruction: ask the model to respond creatively while staying curriculum-grounded (e.g. apply the concept, compare, or extend with original thinking).
- input: an open-ended prompt that requires original thinking, not a simple recall question.
- output: a thoughtful model answer that demonstrates the expected quality; mention key ideas from the topic text.

${JSON_OUTPUT_SUFFIX}`,
    },
  ];
}

export function buildEvaluationPrompt(
  context: TopicContext,
  scenario: EvaluationScenario,
): LlmMessage[] {
  const scenarioGuide: Record<EvaluationScenario, string> = {
    correct:
      "The student answer is mostly correct (score 8–10/10). Praise what is right; optionally note a small refinement.",
    partial:
      "The student answer is partially correct (score 4–7/10). Identify the gap or misconception and explain how to improve.",
    wrong:
      "The student answer is incorrect (score 0–3/10). Clearly name the mistake and give concrete improvement steps grounded in the topic text.",
  };

  return [
    { role: "system", content: DATASET_SYSTEM_PROMPT },
    {
      role: "user",
      content: `${formatTopicText(context)}

Create one answer-evaluation example for fine-tuning.

Scenario: ${scenario} — ${scenarioGuide[scenario]}

Requirements:
- instruction: "Evaluate the student's answer and explain any mistakes."
- input: two lines — "Question: ..." then "Student's answer: ..." (the student answer must match the ${scenario} scenario).
- output: start with "Score: X/10." then explain mistakes (when score is low) and give improvement guidance referencing the topic text (include page number only if present in the topic text).

${JSON_OUTPUT_SUFFIX}`,
    },
  ];
}

export function buildMultiExplainPrompt(context: TopicContext): LlmMessage[] {
  return [
    { role: "system", content: DATASET_SYSTEM_PROMPT },
    {
      role: "user",
      content: `${formatTopicText(context)}

Create one multi-explanation example for fine-tuning.

Requirements:
- instruction: ask the model to explain the topic in multiple ways (simple language + real-life example).
- input: empty string.
- output: 2–3 distinct explanation approaches separated by blank lines, for example:
  1) simple plain-language definition,
  2) an analogy or step-by-step breakdown,
  3) at least one real-life example tied to the topic.
  Label each section briefly (e.g. "Simply put:", "Analogy:", "Real-life example:").

${JSON_OUTPUT_SUFFIX}`,
    },
  ];
}

// --- Per-type generators ---

export async function generateQnA(context: TopicContext): Promise<GeneratedExample> {
  return runGenerator(buildQnAPrompt(context), "qna");
}

export async function generateMCQ(context: TopicContext): Promise<GeneratedExample> {
  return runGenerator(buildMCQPrompt(context), "mcq");
}

export async function generateSrijonsil(context: TopicContext): Promise<GeneratedExample> {
  return runGenerator(buildSrijonsilPrompt(context), "srijonsil");
}

export async function generateEvaluation(
  context: TopicContext,
  scenario: EvaluationScenario = "partial",
): Promise<GeneratedExample> {
  return runGenerator(buildEvaluationPrompt(context, scenario), "evaluation");
}

export async function generateMultiExplain(context: TopicContext): Promise<GeneratedExample> {
  return runGenerator(buildMultiExplainPrompt(context), "multi_explain");
}

// --- Topic loading & orchestration ---

export async function loadTopicContext(topicId: string): Promise<TopicContext> {
  const topic = await prisma.topic.findUniqueOrThrow({
    where: { id: topicId },
    include: {
      chapter: { include: { subject: { include: { class: true } } } },
    },
  });

  return {
    topicId: topic.id,
    topicName: topic.name,
    rawText: topic.rawText,
    className: topic.chapter.subject.class.name,
    subjectName: topic.chapter.subject.name,
    chapterName: topic.chapter.name,
  };
}

const EVALUATION_SCENARIOS: EvaluationScenario[] = ["correct", "partial", "wrong"];

function pickEvaluationScenario(): EvaluationScenario {
  return EVALUATION_SCENARIOS[Math.floor(Math.random() * EVALUATION_SCENARIOS.length)];
}

async function generateByType(
  context: TopicContext,
  type: ExampleType,
): Promise<GeneratedExample> {
  switch (type) {
    case "qna":
      return generateQnA(context);
    case "mcq":
      return generateMCQ(context);
    case "srijonsil":
      return generateSrijonsil(context);
    case "evaluation":
      return generateEvaluation(context, pickEvaluationScenario());
    case "multi_explain":
      return generateMultiExplain(context);
  }
}

/** Generate selected example types for a topic (one LLM call per type). */
export async function generateExamplesByTypes(
  topicId: string,
  types: ExampleType[],
): Promise<GeneratedExample[]> {
  const context = await loadTopicContext(topicId);
  return Promise.all(types.map((type) => generateByType(context, type)));
}

/** Generate all five example types for a topic (one call per type). */
export async function generateExamplesForTopic(topicId: string): Promise<GeneratedExample[]> {
  return generateExamplesByTypes(topicId, [...EXAMPLE_TYPES]);
}
