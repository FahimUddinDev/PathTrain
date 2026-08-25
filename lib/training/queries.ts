import { prisma } from "@/lib/db/prisma";

export type DatasetOption = {
  id: string;
  name: string;
  exampleCount: number;
  jsonlPath: string | null;
  exportedAt: Date | null;
  createdAt: Date;
};

export type JobSummary = {
  id: string;
  datasetId: string;
  baseModel: string;
  status: string;
  adapterPath: string | null;
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
    },
  });
}

/** Most recent queued/running job, if any — so the UI can resume polling. */
export async function getActiveTrainingJob(): Promise<JobSummary | null> {
  return prisma.trainingJob.findFirst({
    where: { status: { in: ["queued", "running"] } },
    orderBy: { createdAt: "desc" },
    include: { dataset: { select: { id: true, name: true } } },
  });
}
