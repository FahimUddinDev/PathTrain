import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { REGRESSION_VERDICTS } from "./regression-types";
import type { RegressionNoteSummary, RegressionVerdict } from "./regression-types";

export const createRegressionSchema = z.object({
  query: z.string().trim().min(1, "query is required"),
  topicId: z.string().min(1).optional(),
  baseModel: z.string().trim().min(1, "baseModel is required"),
  fineTunedModel: z.string().trim().min(1, "fineTunedModel is required"),
  baseAnswer: z.string().default(""),
  fineTunedAnswer: z.string().default(""),
  verdict: z.enum(REGRESSION_VERDICTS, { message: "Pick a verdict before saving" }),
  notes: z.string().trim().max(4000).optional(),
});

export type CreateRegressionInput = z.infer<typeof createRegressionSchema>;

const LIST_LIMIT = 20;

export async function createRegressionNote(input: CreateRegressionInput) {
  return prisma.regressionNote.create({
    data: {
      query: input.query,
      topicId: input.topicId ?? null,
      baseModel: input.baseModel,
      fineTunedModel: input.fineTunedModel,
      baseAnswer: input.baseAnswer,
      fineTunedAnswer: input.fineTunedAnswer,
      verdict: input.verdict,
      notes: input.notes?.trim() ? input.notes.trim() : null,
    },
  });
}

/** Most recent notes first, optionally narrowed to one topic. */
export async function listRegressionNotes(topicId?: string): Promise<RegressionNoteSummary[]> {
  const notes = await prisma.regressionNote.findMany({
    where: topicId ? { topicId } : undefined,
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  const topicIds = [...new Set(notes.flatMap((note) => (note.topicId ? [note.topicId] : [])))];
  const topics = topicIds.length
    ? await prisma.topic.findMany({
        where: { id: { in: topicIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(topics.map((topic) => [topic.id, topic.name]));

  return notes.map((note) => ({
    id: note.id,
    query: note.query,
    topicId: note.topicId,
    topicName: note.topicId ? (nameById.get(note.topicId) ?? null) : null,
    baseModel: note.baseModel,
    fineTunedModel: note.fineTunedModel,
    verdict: note.verdict as RegressionVerdict,
    notes: note.notes,
    createdAt: note.createdAt.toISOString(),
  }));
}
