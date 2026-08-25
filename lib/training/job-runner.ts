import { type ChildProcessByStdio, spawn } from "node:child_process";
import type { Readable } from "node:stream";
import path from "node:path";
import type { TrainingJob } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

type TrainProcess = ChildProcessByStdio<null, Readable, Readable>;

const LOG_FLUSH_MS = 500;
const ADAPTER_DONE_RE = /\[done\]\s+adapter_path=(.+)/;

function pythonBin(): string {
  return process.env.PYTHON_PATH?.trim() || process.env.PYTHON?.trim() || "python";
}

function adapterDir(jobId: string): string {
  return path.join(process.cwd(), "data", "adapters", jobId);
}

/**
 * Start an Unsloth QLoRA job for an exported dataset.
 * Returns immediately (job is `running`); train.py runs in the background.
 * Stdout/stderr are appended to TrainingJob.logs; status ends as completed|failed.
 */
export async function startTrainingJob(
  datasetId: string,
  baseModel = "qwen2.5:7b-instruct",
): Promise<TrainingJob> {
  const dataset = await prisma.trainingDataset.findUniqueOrThrow({
    where: { id: datasetId },
  });

  if (!dataset.jsonlPath) {
    throw new Error("Dataset has no JSONL path — export approved examples first");
  }

  const job = await prisma.trainingJob.create({
    data: {
      datasetId,
      baseModel,
      status: "queued",
      logs: "",
    },
  });

  const script = path.join(process.cwd(), "training-service", "train.py");
  const output = adapterDir(job.id);

  let child: TrainProcess;
  try {
    child = spawn(
      pythonBin(),
      [
        script,
        "--dataset",
        dataset.jsonlPath,
        "--base-model",
        baseModel,
        "--output",
        output,
        "--job-id",
        job.id,
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return prisma.trainingJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        logs: `[error] failed to spawn train.py: ${message}\n`,
        completedAt: new Date(),
      },
    });
  }

  const running = await prisma.trainingJob.update({
    where: { id: job.id },
    data: { status: "running", startedAt: new Date() },
  });

  // Do not await — route returns 202 while training continues.
  watchTrainingProcess(job.id, child, output);

  return running;
}

/** Fields returned by the job status API (includes M8 modelTag). */
export type TrainingJobStatus = {
  id: string;
  datasetId: string;
  baseModel: string;
  status: string;
  adapterPath: string | null;
  modelTag: string | null;
  logs: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

export async function getJobStatus(jobId: string): Promise<TrainingJobStatus> {
  const job = await prisma.trainingJob.findUniqueOrThrow({
    where: { id: jobId },
  });

  // modelTag is on TrainingJob in schema; cast keeps status API typed even if
  // a stale Prisma Client generate is still loaded by the language service.
  const row = job as typeof job & { modelTag?: string | null };

  return {
    id: row.id,
    datasetId: row.datasetId,
    baseModel: row.baseModel,
    status: row.status,
    adapterPath: row.adapterPath,
    modelTag: row.modelTag ?? null,
    logs: row.logs,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
  };
}

function watchTrainingProcess(
  jobId: string,
  child: TrainProcess,
  expectedAdapterPath: string,
): void {
  let logs = "";
  let adapterPath: string | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let finished = false;

  const flushLogs = () => {
    const snapshot = logs;
    chain = chain
      .then(() =>
        prisma.trainingJob.update({
          where: { id: jobId },
          data: { logs: snapshot },
        }),
      )
      .then(() => undefined)
      .catch((err: unknown) => {
        console.error(`[job-runner] failed to flush logs for ${jobId}:`, err);
      });
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushLogs();
    }, LOG_FLUSH_MS);
  };

  const onChunk = (buf: Buffer) => {
    const text = buf.toString("utf8");
    logs += text;

    for (const line of text.split(/\r?\n/)) {
      const match = line.match(ADAPTER_DONE_RE);
      if (match?.[1]) {
        adapterPath = match[1].trim();
      }
    }

    scheduleFlush();
  };

  child.stdout.on("data", onChunk);
  child.stderr.on("data", onChunk);

  child.on("error", (error) => {
    void finalize("failed", `[error] spawn error: ${error.message}\n`);
  });

  child.on("close", (code, signal) => {
    if (code === 0) {
      void finalize("completed");
      return;
    }
    const reason =
      signal != null
        ? `[error] train.py killed by signal ${signal}\n`
        : `[error] train.py exited with code ${code ?? "unknown"}\n`;
    void finalize("failed", reason);
  });

  async function finalize(status: "completed" | "failed", extraLog?: string) {
    if (finished) return;
    finished = true;

    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    if (extraLog) {
      logs += extraLog;
    }

    await chain.catch(() => undefined);

    try {
      await prisma.trainingJob.update({
        where: { id: jobId },
        data: {
          status,
          logs,
          completedAt: new Date(),
          ...(status === "completed"
            ? { adapterPath: adapterPath ?? expectedAdapterPath }
            : {}),
        },
      });
    } catch (err) {
      console.error(`[job-runner] failed to finalize job ${jobId}:`, err);
    }
  }
}
