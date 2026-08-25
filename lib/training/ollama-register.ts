import { type ChildProcessByStdio, spawn } from "node:child_process";
import type { Readable } from "node:stream";
import path from "node:path";
import type { TrainingJob } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

type RegisterProcess = ChildProcessByStdio<null, Readable, Readable>;

const LOG_FLUSH_MS = 500;
const MODEL_TAG_DONE_RE = /\[done\]\s+model_tag=(.+)/;

const HF_TO_OLLAMA: Record<string, string> = {
  "Qwen/Qwen2.5-7B-Instruct": "qwen2.5:7b-instruct",
  "qwen/qwen2.5-7b-instruct": "qwen2.5:7b-instruct",
};

export type RegisterOllamaMode = "adapter" | "gguf";

export type RegisterOllamaInput = {
  jobId: string;
  /** Ollama model name to create. Defaults to env / pathtrain-ft-<jobId>. */
  modelTag?: string;
  /** adapter = FROM+ADAPTER Modelfile (default); gguf = Unsloth merge. */
  mode?: RegisterOllamaMode;
  quantization?: string;
};

function pythonBin(): string {
  return process.env.PYTHON_PATH?.trim() || process.env.PYTHON?.trim() || "python";
}

function defaultModelTag(jobId: string): string {
  const fromEnv = process.env.OLLAMA_FINETUNED_MODEL?.trim();
  if (fromEnv) return fromEnv;
  const short = jobId.slice(0, 8);
  return `pathtrain-ft-${short}`;
}

/** Map HF ids / aliases to the Ollama tag used as FROM in the Modelfile. */
export function resolveOllamaBaseModel(name: string): string {
  const key = name.trim();
  return HF_TO_OLLAMA[key] ?? HF_TO_OLLAMA[key.toLowerCase()] ?? key;
}

/**
 * Write a Modelfile and register the job's LoRA adapter as a named Ollama model.
 * Returns immediately; register_ollama.py runs in the background and updates
 * TrainingJob.modelTag + logs when finished.
 */
export async function registerJobInOllama(
  input: RegisterOllamaInput,
): Promise<TrainingJob> {
  const job = await prisma.trainingJob.findUniqueOrThrow({
    where: { id: input.jobId },
  });

  if (job.status !== "completed") {
    throw new Error(`Job must be completed before Ollama register (status=${job.status})`);
  }
  if (!job.adapterPath) {
    throw new Error("Job has no adapterPath — train must finish successfully first");
  }

  const modelTag = (input.modelTag?.trim() || defaultModelTag(job.id)).trim();
  const mode: RegisterOllamaMode = input.mode ?? "adapter";
  const baseModel = resolveOllamaBaseModel(job.baseModel);
  const script = path.join(process.cwd(), "training-service", "register_ollama.py");
  const workdir = path.join(
    process.cwd(),
    "data",
    "ollama",
    modelTag.replace(/:/g, "_"),
  );

  const args = [
    script,
    "--adapter",
    job.adapterPath,
    "--base-model",
    baseModel,
    "--model-name",
    modelTag,
    "--mode",
    mode,
    "--workdir",
    workdir,
  ];
  if (mode === "gguf" && input.quantization) {
    args.push("--quantization", input.quantization);
  }

  const header = `\n[register] starting Ollama register model=${modelTag} mode=${mode}\n`;
  const logsWithHeader = `${job.logs ?? ""}${header}`;

  let child: RegisterProcess;
  try {
    child = spawn(pythonBin(), args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return prisma.trainingJob.update({
      where: { id: job.id },
      data: {
        logs: `${logsWithHeader}[error] failed to spawn register_ollama.py: ${message}\n`,
      },
    });
  }

  const updated = await prisma.trainingJob.update({
    where: { id: job.id },
    data: { logs: logsWithHeader },
  });

  watchRegisterProcess(job.id, child, logsWithHeader, modelTag);

  return updated;
}

function watchRegisterProcess(
  jobId: string,
  child: RegisterProcess,
  initialLogs: string,
  expectedTag: string,
): void {
  let logs = initialLogs;
  let modelTag: string | null = null;
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
        console.error(`[ollama-register] failed to flush logs for ${jobId}:`, err);
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
      const match = line.match(MODEL_TAG_DONE_RE);
      if (match?.[1]) {
        modelTag = match[1].trim();
      }
    }

    scheduleFlush();
  };

  child.stdout.on("data", onChunk);
  child.stderr.on("data", onChunk);

  child.on("error", (error) => {
    void finalize(false, `[error] register spawn error: ${error.message}\n`);
  });

  child.on("close", (code, signal) => {
    if (code === 0) {
      void finalize(true);
      return;
    }
    const reason =
      signal != null
        ? `[error] register_ollama.py killed by signal ${signal}\n`
        : `[error] register_ollama.py exited with code ${code ?? "unknown"}\n`;
    void finalize(false, reason);
  });

  async function finalize(ok: boolean, extraLog?: string) {
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
          logs,
          ...(ok ? { modelTag: modelTag ?? expectedTag } : {}),
        },
      });
    } catch (err) {
      console.error(`[ollama-register] failed to finalize ${jobId}:`, err);
    }
  }
}
