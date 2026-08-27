"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const POLL_MS = 2500;

export type DatasetOptionRow = {
  id: string;
  name: string;
  exampleCount: number;
  exportedAt: string | null;
};

export type JobStatusPayload = {
  id: string;
  datasetId: string;
  baseModel: string;
  status: string;
  adapterPath: string | null;
  modelTag: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  datasetName?: string;
};

type TrainingJobsPanelProps = {
  datasets: DatasetOptionRow[];
  initialJob: JobStatusPayload | null;
};

const JOB_STATUSES = ["queued", "running", "completed", "failed"] as const;
type JobStatus = (typeof JOB_STATUSES)[number];

const STATUS_BADGE: Record<
  JobStatus,
  { variant: NonNullable<BadgeProps["variant"]>; className?: string }
> = {
  queued: { variant: "outline" },
  running: { variant: "default" },
  completed: {
    variant: "default",
    className:
      "border-transparent bg-emerald-600 text-white hover:bg-emerald-600",
  },
  failed: { variant: "destructive" },
};

function isActiveStatus(status: string): boolean {
  return status === "queued" || status === "running";
}

function JobStatusBadge({ status }: { status: string }) {
  const known = (JOB_STATUSES as readonly string[]).includes(status);
  const key: JobStatus = known ? (status as JobStatus) : "queued";
  const config = STATUS_BADGE[key];

  return (
    <Badge
      variant={config.variant}
      className={cn("capitalize", config.className)}
    >
      {status}
    </Badge>
  );
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function TrainingJobsPanel({
  datasets,
  initialJob,
}: TrainingJobsPanelProps) {
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? "");
  const [job, setJob] = useState<JobStatusPayload | null>(initialJob);
  const [logs, setLogs] = useState("");
  const [starting, setStarting] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLPreElement>(null);
  const logsLenRef = useRef(0);

  // Finished jobs never poll, so their logs have to be fetched once on load —
  // otherwise a failed job shows the "waiting for output" placeholder forever.
  useEffect(() => {
    const jobId = job?.id;
    if (!jobId) return;

    const controller = new AbortController();
    fetch(`/api/training/jobs/${jobId}/logs`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ logs?: string }>) : null))
      .then((body) => {
        if (!controller.signal.aborted && body) setLogs(body.logs ?? "");
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [job?.id]);

  useEffect(() => {
    if (!job || !isActiveStatus(job.status)) return;

    let cancelled = false;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const [statusRes, logsRes] = await Promise.all([
          fetch(`/api/training/jobs/${job.id}/status`, {
            signal: controller.signal,
          }),
          fetch(`/api/training/jobs/${job.id}/logs`, {
            signal: controller.signal,
          }),
        ]);

        if (!statusRes.ok) {
          const body = (await statusRes.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `Status failed (${statusRes.status})`);
        }
        if (!logsRes.ok) {
          const body = (await logsRes.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `Logs failed (${logsRes.status})`);
        }

        const statusBody = (await statusRes.json()) as JobStatusPayload;
        const logsBody = (await logsRes.json()) as { logs?: string };

        if (cancelled) return;

        setJob((prev) => ({
          ...statusBody,
          datasetName: prev?.datasetName,
        }));
        setLogs(logsBody.logs ?? "");
        setError(null);
      } catch (err) {
        if (
          cancelled ||
          (err instanceof DOMException && err.name === "AbortError")
        )
          return;
        setError(err instanceof Error ? err.message : "Polling failed");
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [job?.id, job?.status, job]);

  useEffect(() => {
    if (logs.length > logsLenRef.current && logsEndRef.current) {
      logsEndRef.current.scrollTop = logsEndRef.current.scrollHeight;
    }
    logsLenRef.current = logs.length;
  }, [logs]);

  async function startJob() {
    if (!datasetId) {
      setError("Select a dataset first");
      return;
    }

    setStarting(true);
    setError(null);

    try {
      const res = await fetch("/api/training/jobs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId }),
      });
      const body = (await res.json().catch(() => null)) as
        | (JobStatusPayload & { error?: string })
        | null;

      if (!res.ok) {
        throw new Error(body?.error ?? `Failed to start job (${res.status})`);
      }
      if (!body?.id) {
        throw new Error("Start job returned an empty response");
      }

      const selected = datasets.find((d) => d.id === datasetId);
      setLogs("");
      logsLenRef.current = 0;
      setJob({
        id: body.id,
        datasetId: body.datasetId,
        baseModel: body.baseModel,
        status: body.status,
        adapterPath: body.adapterPath ?? null,
        modelTag: body.modelTag ?? null,
        startedAt: body.startedAt ?? null,
        completedAt: body.completedAt ?? null,
        createdAt: body.createdAt,
        datasetName: selected?.name,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start job");
    } finally {
      setStarting(false);
    }
  }

  async function registerOllama() {
    if (!job || job.status !== "completed" || !job.adapterPath) {
      setError("A completed job with an adapter is required to register in Ollama");
      return;
    }

    setRegistering(true);
    setError(null);

    try {
      const res = await fetch(`/api/training/jobs/${job.id}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "adapter" }),
      });
      const body = (await res.json().catch(() => null)) as
        | (JobStatusPayload & { error?: string; logs?: string })
        | null;

      if (!res.ok) {
        throw new Error(body?.error ?? `Register failed (${res.status})`);
      }

      // Poll until the latest register run finishes (done line or error after start marker).
      const jobId = job.id;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const [statusRes, logsRes] = await Promise.all([
          fetch(`/api/training/jobs/${jobId}/status`),
          fetch(`/api/training/jobs/${jobId}/logs`),
        ]);
        if (!statusRes.ok || !logsRes.ok) continue;

        const statusBody = (await statusRes.json()) as JobStatusPayload;
        const logsBody = (await logsRes.json()) as { logs?: string };
        const nextLogs = logsBody.logs ?? "";
        setLogs(nextLogs);
        setJob((prev) =>
          prev
            ? {
                ...prev,
                ...statusBody,
                datasetName: prev.datasetName,
              }
            : prev,
        );

        const startIdx = nextLogs.lastIndexOf("[register] starting Ollama register");
        if (startIdx < 0) continue;
        const afterStart = nextLogs.slice(startIdx);
        if (/\[done\]\s+model_tag=/.test(afterStart)) break;
        if (
          afterStart.includes("[error] register") ||
          afterStart.includes("register_ollama.py exited") ||
          afterStart.includes("failed to spawn register_ollama.py")
        ) {
          throw new Error("Ollama register failed — see job logs");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register Ollama model");
    } finally {
      setRegistering(false);
    }
  }

  const busy = starting || (job != null && isActiveStatus(job.status));
  const canRegister =
    job?.status === "completed" && Boolean(job.adapterPath) && !registering && !busy;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Start training</CardTitle>
          <CardDescription>
            Pick an exported JSONL dataset and run Unsloth QLoRA via the
            training service.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {datasets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No exported datasets yet. Export approved examples from{" "}
              <Link
                href="/training/datasets"
                className="underline hover:text-foreground"
              >
                Datasets
              </Link>{" "}
              first.
            </p>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="dataset">Dataset</Label>
                <Select
                  value={datasetId}
                  onValueChange={setDatasetId}
                  disabled={busy}
                >
                  <SelectTrigger id="dataset">
                    <SelectValue placeholder="Select a dataset" />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} ({d.exampleCount} examples)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => void startJob()}
                disabled={!datasetId || busy}
              >
                {starting
                  ? "Starting…"
                  : busy
                    ? "Job running…"
                    : "Start training"}
              </Button>
            </div>
          )}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      {job ? (
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Job status</CardTitle>
              <JobStatusBadge status={job.status} />
            </div>
            <CardDescription className="space-y-1 font-mono text-xs">
              <div>ID: {job.id}</div>
              <div>
                Dataset: {job.datasetName ?? job.datasetId} · Model:{" "}
                {job.baseModel}
              </div>
              <div>
                Started: {formatWhen(job.startedAt)} · Completed:{" "}
                {formatWhen(job.completedAt)}
              </div>
              {job.adapterPath ? <div>Adapter: {job.adapterPath}</div> : null}
              {job.modelTag ? <div>Ollama model: {job.modelTag}</div> : null}
              {isActiveStatus(job.status) ? (
                <div className="text-muted-foreground">
                  Polling every {POLL_MS / 1000}s…
                </div>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {job.status === "completed" && job.adapterPath ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => void registerOllama()}
                  disabled={!canRegister}
                >
                  {registering
                    ? "Registering…"
                    : job.modelTag
                      ? "Re-register in Ollama"
                      : "Register in Ollama"}
                </Button>
                {job.modelTag ? (
                  <span className="text-xs text-muted-foreground">
                    Available as <span className="font-mono">{job.modelTag}</span>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Writes a Modelfile (FROM + ADAPTER) and runs{" "}
                    <span className="font-mono">ollama create</span>.
                  </span>
                )}
              </div>
            ) : null}
            <div>
            <Label className="mb-2 block">Logs</Label>
            <pre
              ref={logsEndRef}
              className="max-h-[28rem] overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap"
            >
              {logs.trim() ? logs : "Waiting for training output…"}
            </pre>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
