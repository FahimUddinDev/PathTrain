import { spawn } from "node:child_process";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";

export async function startTrainingJob(datasetId: string, baseModel = "qwen2.5:7b-instruct") {
  const dataset = await prisma.trainingDataset.findUniqueOrThrow({
    where: { id: datasetId },
  });

  if (!dataset.jsonlPath) {
    throw new Error("Dataset has no JSONL path");
  }

  const job = await prisma.trainingJob.create({
    data: {
      datasetId,
      baseModel,
      status: "queued",
    },
  });

  const script = path.join(process.cwd(), "training-service", "train.py");
  const child = spawn("python", [script, "--dataset", dataset.jsonlPath, "--job-id", job.id], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  await prisma.trainingJob.update({
    where: { id: job.id },
    data: { status: "running", startedAt: new Date() },
  });

  return job;
}

export async function getJobStatus(jobId: string) {
  return prisma.trainingJob.findUniqueOrThrow({ where: { id: jobId } });
}
