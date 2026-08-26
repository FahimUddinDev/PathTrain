"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ANY = "all";

type Option = { id: string; name: string };

export type DatasetRow = {
  id: string;
  name: string;
  exampleCount: number;
  jsonlPath: string | null;
  exportedAt: string | null;
  createdAt: string;
  filterCriteria?: unknown;
  log?: string | null;
};

type TrainingDatasetsPanelProps = {
  initialDatasets: DatasetRow[];
};

function optionalId(value: string): string | undefined {
  return value === ANY ? undefined : value;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatFilters(criteria: unknown): string {
  if (!criteria || typeof criteria !== "object") return "All approved";
  const entries = Object.entries(criteria as Record<string, unknown>).filter(
    ([, v]) => typeof v === "string" && v.length > 0,
  );
  if (entries.length === 0) return "All approved";
  return entries.map(([k, v]) => `${k}=${v}`).join(", ");
}

async function fetchOptions(url: string, signal: AbortSignal): Promise<Option[]> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return [];
    const data: unknown = await response.json();
    if (!Array.isArray(data)) return [];
    return data.filter(
      (item): item is Option =>
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        "name" in item &&
        typeof (item as Option).id === "string" &&
        typeof (item as Option).name === "string",
    );
  } catch {
    return [];
  }
}

export function TrainingDatasetsPanel({
  initialDatasets,
}: TrainingDatasetsPanelProps) {
  const [datasets, setDatasets] = useState(initialDatasets);
  const [name, setName] = useState("");
  const [classId, setClassId] = useState(ANY);
  const [subjectId, setSubjectId] = useState(ANY);
  const [chapterId, setChapterId] = useState(ANY);

  const [classes, setClasses] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [chapters, setChapters] = useState<Option[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingChapters, setLoadingChapters] = useState(false);

  const [approvedCount, setApprovedCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<DatasetRow | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingClasses(true);
    fetchOptions("/api/curriculum/classes", controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setClasses(data);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingClasses(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (classId === ANY) {
      setSubjects([]);
      setChapters([]);
      setSubjectId(ANY);
      setChapterId(ANY);
      setLoadingSubjects(false);
      setLoadingChapters(false);
      return;
    }

    const controller = new AbortController();
    setLoadingSubjects(true);
    setSubjectId(ANY);
    setChapterId(ANY);
    setChapters([]);
    fetchOptions(
      `/api/curriculum/subjects?classId=${encodeURIComponent(classId)}`,
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setSubjects(data);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSubjects(false);
      });
    return () => controller.abort();
  }, [classId]);

  useEffect(() => {
    if (subjectId === ANY) {
      setChapters([]);
      setChapterId(ANY);
      setLoadingChapters(false);
      return;
    }

    const controller = new AbortController();
    setLoadingChapters(true);
    setChapterId(ANY);
    fetchOptions(
      `/api/curriculum/chapters?subjectId=${encodeURIComponent(subjectId)}`,
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setChapters(data);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingChapters(false);
      });
    return () => controller.abort();
  }, [subjectId]);

  useEffect(() => {
    const controller = new AbortController();
    setCounting(true);
    const params = new URLSearchParams();
    const c = optionalId(classId);
    const s = optionalId(subjectId);
    const ch = optionalId(chapterId);
    if (c) params.set("classId", c);
    if (s) params.set("subjectId", s);
    if (ch) params.set("chapterId", ch);

    fetch(`/api/training/dataset/preview?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to count");
        return res.json() as Promise<{ count: number }>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setApprovedCount(data.count);
      })
      .catch(() => {
        if (!controller.signal.aborted) setApprovedCount(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCounting(false);
      });

    return () => controller.abort();
  }, [classId, subjectId, chapterId]);

  async function handleExport() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Dataset name is required");
      return;
    }

    setExporting(true);
    setError(null);
    setLastExport(null);

    try {
      const res = await fetch("/api/training/dataset/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          classId: optionalId(classId),
          subjectId: optionalId(subjectId),
          chapterId: optionalId(chapterId),
        }),
      });
      const body = (await res.json()) as DatasetRow & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Export failed (${res.status})`);

      const row: DatasetRow = {
        id: body.id,
        name: body.name,
        exampleCount: body.exampleCount,
        jsonlPath: body.jsonlPath,
        exportedAt: body.exportedAt,
        createdAt: body.createdAt,
        filterCriteria: body.filterCriteria,
        log: body.log,
      };
      setDatasets((prev) => [row, ...prev]);
      setLastExport(row);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const canExport =
    name.trim().length > 0 &&
    !exporting &&
    (approvedCount === null || approvedCount > 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Build dataset</CardTitle>
          <CardDescription>
            Select approved examples by class / subject / chapter and export
            instruction JSONL for fine-tuning.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dataset-name">Dataset name</Label>
            <Input
              id="dataset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Class 6 Science — pollination"
              disabled={exporting}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FilterSelect
              label="Class"
              value={classId}
              options={classes}
              anyLabel="All classes"
              disabled={exporting || loadingClasses}
              loading={loadingClasses}
              onChange={setClassId}
            />
            <FilterSelect
              label="Subject"
              value={subjectId}
              options={subjects}
              anyLabel="All subjects"
              locked={classId === ANY}
              lockedLabel="Select a class first"
              emptyLabel="No subjects"
              disabled={exporting || classId === ANY || loadingSubjects}
              loading={loadingSubjects}
              onChange={setSubjectId}
            />
            <FilterSelect
              label="Chapter"
              value={chapterId}
              options={chapters}
              anyLabel="All chapters"
              locked={subjectId === ANY}
              lockedLabel="Select a subject first"
              emptyLabel="No chapters"
              disabled={exporting || subjectId === ANY || loadingChapters}
              loading={loadingChapters}
              onChange={setChapterId}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">
              {counting
                ? "Counting approved…"
                : approvedCount === null
                  ? "Approved count unavailable"
                  : `${approvedCount} approved example${approvedCount === 1 ? "" : "s"}`}
            </Badge>
            <Button type="button" onClick={() => void handleExport()} disabled={!canExport}>
              {exporting ? "Exporting…" : "Export JSONL"}
            </Button>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {lastExport ? (
            <div className="rounded-md border bg-muted/40 px-3 py-3 text-sm">
              <p>
                Exported <span className="font-medium">{lastExport.name}</span> (
                {lastExport.exampleCount} examples).
              </p>
              {lastExport.jsonlPath ? (
                <p className="mt-1 break-all text-muted-foreground">
                  {lastExport.jsonlPath}
                </p>
              ) : null}
              <p className="mt-2">
                <Link
                  href="/training/jobs"
                  className="underline hover:text-foreground"
                >
                  Start a training job
                </Link>{" "}
                with this dataset.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exported datasets</CardTitle>
          <CardDescription>
            Records created when approved examples are exported to JSONL.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {datasets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No datasets yet. Export approved examples above.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {datasets.map((d) => (
                <li key={d.id} className="space-y-1 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{d.name}</p>
                    <Badge variant="outline">{d.exampleCount} examples</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Filters: {formatFilters(d.filterCriteria)} · Exported{" "}
                    {formatWhen(d.exportedAt ?? d.createdAt)}
                  </p>
                  {d.jsonlPath ? (
                    <p className="break-all text-xs text-muted-foreground">
                      {d.jsonlPath}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  anyLabel,
  emptyLabel,
  lockedLabel,
  locked,
  disabled,
  loading,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  anyLabel: string;
  emptyLabel?: string;
  lockedLabel?: string;
  locked?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onChange: (value: string) => void;
}) {
  const placeholder = locked
    ? (lockedLabel ?? anyLabel)
    : loading
      ? "Loading…"
      : options.length === 0
        ? (emptyLabel ?? anyLabel)
        : anyLabel;

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select disabled={disabled} value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{anyLabel}</SelectItem>
          {options.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
