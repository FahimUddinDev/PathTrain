import { prisma } from "@/lib/db/prisma";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

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

export async function exportApprovedDataset(name: string, filters: ExportFilters) {
  const examples = await prisma.trainingExample.findMany({
    where: {
      status: "approved",
      topic: {
        chapter: {
          ...(filters.chapterId ? { id: filters.chapterId } : {}),
          ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
          ...(filters.classId
            ? { subject: { classId: filters.classId } }
            : {}),
        },
      },
    },
    include: {
      topic: {
        include: {
          chapter: { include: { subject: { include: { class: true } } } },
        },
      },
    },
  });

  const records: JsonlRecord[] = examples.map((example) => ({
    instruction: example.instruction,
    input: example.input,
    output: example.output,
    metadata: {
      class: example.topic.chapter.subject.class.name,
      subject: example.topic.chapter.subject.name,
      topic: example.topic.name,
      type: example.type,
    },
  }));

  const dir = path.join(process.cwd(), "data", "exports");
  await mkdir(dir, { recursive: true });
  const jsonlPath = path.join(dir, `${name.replace(/\s+/g, "-")}.jsonl`);
  const body = records.map((row) => JSON.stringify(row)).join("\n");
  await writeFile(jsonlPath, body, "utf8");

  return prisma.trainingDataset.create({
    data: {
      name,
      filterCriteria: filters,
      exampleCount: records.length,
      jsonlPath,
      exportedAt: new Date(),
    },
  });
}
