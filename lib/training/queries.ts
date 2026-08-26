import { prisma } from "@/lib/db/prisma";

export type DatasetOption = {
  id: string;
  name: string;
  exampleCount: number;
  jsonlPath: string | null;
  exportedAt: Date | null;
  createdAt: Date;
  filterCriteria?: unknown;
  log?: string | null;
};

export type JobSummary = {
  id: string;
  datasetId: string;
  baseModel: string;
  status: string;
  adapterPath: string | null;
  modelTag: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  dataset: { id: string; name: string };
};

/** Exported datasets available to start a training job (must have JSONL). */
export async function listExportableDatasets(): Promise<DatasetOption[]> {
  return prisma.trainingDataset.findMany({
    where: { jsonlPath: { not: null } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      exampleCount: true,
      jsonlPath: true,
      exportedAt: true,
      createdAt: true,
      filterCriteria: true,
      log: true,
    },
  });
}

/** Count approved TrainingExamples matching optional curriculum filters. */
export async function countApprovedExamples(filters: {
  classId?: string;
  subjectId?: string;
  chapterId?: string;
}): Promise<number> {
  const chapterFilter: {
    id?: string;
    subjectId?: string;
    subject?: { classId: string };
  } = {};
  if (filters.chapterId) chapterFilter.id = filters.chapterId;
  if (filters.subjectId) chapterFilter.subjectId = filters.subjectId;
  if (filters.classId) chapterFilter.subject = { classId: filters.classId };

  return prisma.trainingExample.count({
    where: {
      status: "approved",
      ...(Object.keys(chapterFilter).length > 0
        ? { topic: { chapter: chapterFilter } }
        : {}),
    },
  });
}

/** Most recent queued/running job, if any — so the UI can resume polling. */
export async function getActiveTrainingJob(): Promise<JobSummary | null> {
  const job = await prisma.trainingJob.findFirst({
    where: { status: { in: ["queued", "running"] } },
    orderBy: { createdAt: "desc" },
    include: { dataset: { select: { id: true, name: true } } },
  });
  return job ? toJobSummary(job) : null;
}

/** A specific job, so `/training/jobs?job=<id>` can open the one just started. */
export async function getTrainingJobById(id: string): Promise<JobSummary | null> {
  const job = await prisma.trainingJob.findUnique({
    where: { id },
    include: { dataset: { select: { id: true, name: true } } },
  });
  return job ? toJobSummary(job) : null;
}

function toJobSummary(job: {
  id: string;
  datasetId: string;
  baseModel: string;
  status: string;
  adapterPath: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  dataset: { id: string; name: string };
}): JobSummary {
  const row = job as typeof job & { modelTag?: string | null };
  return {
    id: row.id,
    datasetId: row.datasetId,
    baseModel: row.baseModel,
    status: row.status,
    adapterPath: row.adapterPath,
    modelTag: row.modelTag ?? null,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    dataset: row.dataset,
  };
}
