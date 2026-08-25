import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma, TrainingDataset } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export type ExportFilters = {
  classId?: string;
  subjectId?: string;
  chapterId?: string;
};

export type JsonlRecord = {
  instruction: string;
  input: string;
  output: string;
  metadata: {
    class: string;
    subject: string;
    topic: string;
    type: string;
  };
};

function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function compactFilters(filters: ExportFilters): ExportFilters {
  const compact: ExportFilters = {};
  if (filters.classId) compact.classId = filters.classId;
  if (filters.subjectId) compact.subjectId = filters.subjectId;
  if (filters.chapterId) compact.chapterId = filters.chapterId;
  return compact;
}

function buildWhere(filters: ExportFilters): Prisma.TrainingExampleWhereInput {
  const chapterFilter: Prisma.ChapterWhereInput = {};
  if (filters.chapterId) chapterFilter.id = filters.chapterId;
  if (filters.subjectId) chapterFilter.subjectId = filters.subjectId;
  if (filters.classId) chapterFilter.subject = { classId: filters.classId };

  return {
    status: "approved",
    ...(Object.keys(chapterFilter).length > 0
      ? { topic: { chapter: chapterFilter } }
      : {}),
  };
}

function toJsonlRecord(
  example: {
    instruction: string;
    input: string;
    output: string;
    type: string;
    topic: {
      name: string;
      chapter: {
        subject: {
          name: string;
          class: { name: string };
        };
      };
    };
  },
): JsonlRecord {
  return {
    instruction: example.instruction,
    input: example.input,
    output: example.output,
    metadata: {
      class: example.topic.chapter.subject.class.name,
      subject: example.topic.chapter.subject.name,
      topic: example.topic.name,
      type: example.type,
    },
  };
}

function buildLog(params: {
  name: string;
  filters: ExportFilters;
  exampleCount: number;
  jsonlPath: string;
}): string {
  const filterSummary =
    Object.keys(params.filters).length === 0
      ? "none (all approved)"
      : Object.entries(params.filters)
          .map(([key, value]) => `${key}=${value}`)
          .join(", ");

  return [
    `Exported dataset "${params.name}"`,
    `Filters: ${filterSummary}`,
    `Approved examples: ${params.exampleCount}`,
    `JSONL: ${params.jsonlPath}`,
    `At: ${new Date().toISOString()}`,
  ].join("\n");
}

/**
 * Select approved TrainingExamples (optionally filtered by class / subject / chapter),
 * write instruction/input/output JSONL, and create a TrainingDataset row.
 */
export async function exportApprovedDataset(
  name: string,
  filters: ExportFilters = {},
): Promise<TrainingDataset> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Dataset name is required");
  }

  const compact = compactFilters(filters);

  const examples = await prisma.trainingExample.findMany({
    where: buildWhere(compact),
    include: {
      topic: {
        include: {
          chapter: {
            include: {
              subject: { include: { class: true } },
            },
          },
        },
      },
    },
    // Deterministic export given the same approved set + filters (NFR-06).
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (examples.length === 0) {
    throw new Error(
      "No approved training examples match the given filters. Approve examples before exporting.",
    );
  }

  const records = examples.map(toJsonlRecord);
  const body = `${records.map((row) => JSON.stringify(row)).join("\n")}\n`;

  const dir = path.join(process.cwd(), "data", "exports");
  await mkdir(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = sanitizeFilename(trimmedName) || "dataset";
  const jsonlPath = path.join(dir, `${base}-${stamp}.jsonl`);
  await writeFile(jsonlPath, body, "utf8");

  const log = buildLog({
    name: trimmedName,
    filters: compact,
    exampleCount: records.length,
    jsonlPath,
  });

  const data = {
    name: trimmedName,
    filterCriteria: compact as Prisma.InputJsonValue,
    exampleCount: records.length,
    jsonlPath,
    log,
    exportedAt: new Date(),
  };

  return prisma.trainingDataset.create({ data });
}
