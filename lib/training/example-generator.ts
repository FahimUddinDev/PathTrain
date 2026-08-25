import { generateWithCloudLlm } from "@/lib/llm/client";
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

export async function generateExamplesForTopic(topicId: string): Promise<GeneratedExample[]> {
  const topic = await prisma.topic.findUniqueOrThrow({
    where: { id: topicId },
    include: {
      chapter: { include: { subject: { include: { class: true } } } },
    },
  });

  void generateWithCloudLlm;
  void topic;
  throw new Error("example generation is not implemented yet (Milestone 6)");
}
