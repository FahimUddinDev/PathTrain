"use client";

import { useCallback, useEffect, useState } from "react";
import { ExampleReview, type TrainingExampleRow } from "@/components/training/example-review";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EXAMPLE_TYPES } from "@/lib/training/example-generator";

const ANY = "all";

const TYPE_LABELS: Record<string, string> = {
  qna: "Q&A",
  mcq: "MCQ",
  srijonsil: "Srijonsil",
  evaluation: "Evaluation",
  multi_explain: "Multi-explain",
};

type TopicOption = { id: string; name: string };

export function TrainingExamplesPanel() {
  const [examples, setExamples] = useState<TrainingExampleRow[]>([]);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [typeFilter, setTypeFilter] = useState(ANY);
  const [statusFilter, setStatusFilter] = useState(ANY);
  const [topicFilter, setTopicFilter] = useState(ANY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [generateTopicId, setGenerateTopicId] = useState(ANY);
  const [generateTypes, setGenerateTypes] = useState<string[]>([...EXAMPLE_TYPES]);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const loadExamples = useCallback(async (signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (typeFilter !== ANY) params.set("type", typeFilter);
    if (statusFilter !== ANY) params.set("status", statusFilter);
    if (topicFilter !== ANY) params.set("topicId", topicFilter);

    const res = await fetch(`/api/training/examples?${params.toString()}`, { signal });
    if (!res.ok) throw new Error(`Failed to load examples (${res.status})`);
    return res.json() as Promise<TrainingExampleRow[]>;
  }, [typeFilter, statusFilter, topicFilter]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadExamples(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setExamples(data);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Failed to load examples");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadExamples]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/topics", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load topics");
        return res.json() as Promise<TopicOption[]>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setTopics(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setTopics([]);
      });
    return () => controller.abort();
  }, []);

  function handleUpdated(updated: TrainingExampleRow) {
    setExamples((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
  }

  function toggleGenerateType(type: string) {
    setGenerateTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  async function handleGenerate() {
    if (generateTopicId === ANY || generateTypes.length === 0) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/training/generate-examples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: generateTopicId, types: generateTypes }),
      });
      const body = (await res.json()) as { error?: string; examples?: TrainingExampleRow[] };
      if (!res.ok) throw new Error(body.error ?? `Generation failed (${res.status})`);

      const fresh = await loadExamples();
      setExamples(fresh);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm font-medium">Generate examples</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Topic</Label>
              <Select value={generateTopicId} onValueChange={setGenerateTopicId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select topic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY} disabled>
                    Select topic
                  </SelectItem>
                  {topics.map((topic) => (
                    <SelectItem key={topic.id} value={topic.id}>
                      {topic.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Types</Label>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_TYPES.map((type) => {
                  const selected = generateTypes.includes(type);
                  return (
                    <Button
                      key={type}
                      type="button"
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      onClick={() => toggleGenerateType(type)}
                    >
                      {TYPE_LABELS[type] ?? type}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
          {generateError ? <p className="text-sm text-destructive">{generateError}</p> : null}
          <Button
            type="button"
            disabled={generating || generateTopicId === ANY || generateTypes.length === 0}
            onClick={handleGenerate}
          >
            {generating ? "Generating…" : "Generate"}
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All types</SelectItem>
              {EXAMPLE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {TYPE_LABELS[type] ?? type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All statuses</SelectItem>
              <SelectItem value="generated">Generated</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Topic</Label>
          <Select value={topicFilter} onValueChange={setTopicFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All topics</SelectItem>
              {topics.map((topic) => (
                <SelectItem key={topic.id} value={topic.id}>
                  {topic.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Badge variant="secondary" className="mb-2">
          {examples.length} example{examples.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading examples…</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!loading && !error && examples.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No examples match the current filters. Generate some above or adjust filters.
          </CardContent>
        </Card>
      ) : null}
      {!loading && !error && examples.length > 0 ? (
        <div className="space-y-4">
          {examples.map((example) => (
            <ExampleReview key={example.id} example={example} onUpdated={handleUpdated} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
