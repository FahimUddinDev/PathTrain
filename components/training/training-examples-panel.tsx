"use client";

import { useCallback, useEffect, useState } from "react";
import { ExampleReview, type TrainingExampleRow } from "@/components/training/example-review";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

const emptyForm = {
  topicId: ANY,
  type: "qna" as (typeof EXAMPLE_TYPES)[number],
  instruction: "",
  input: "",
  output: "",
  status: "approved" as "generated" | "approved" | "rejected",
};

export function TrainingExamplesPanel() {
  const [examples, setExamples] = useState<TrainingExampleRow[]>([]);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [typeFilter, setTypeFilter] = useState(ANY);
  const [statusFilter, setStatusFilter] = useState(ANY);
  const [topicFilter, setTopicFilter] = useState(ANY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadExamples = useCallback(
    async (signal?: AbortSignal) => {
      const params = new URLSearchParams();
      if (typeFilter !== ANY) params.set("type", typeFilter);
      if (statusFilter !== ANY) params.set("status", statusFilter);
      if (topicFilter !== ANY) params.set("topicId", topicFilter);

      const res = await fetch(`/api/training/examples?${params.toString()}`, { signal });
      if (!res.ok) throw new Error(`Failed to load examples (${res.status})`);
      return res.json() as Promise<TrainingExampleRow[]>;
    },
    [typeFilter, statusFilter, topicFilter],
  );

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

  async function handleCreate() {
    if (form.topicId === ANY) {
      setFormError("Select a topic");
      return;
    }
    if (!form.instruction.trim() || !form.output.trim()) {
      setFormError("Instruction and output are required");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/training/examples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId: form.topicId,
          type: form.type,
          instruction: form.instruction.trim(),
          input: form.input,
          output: form.output.trim(),
          status: form.status,
        }),
      });
      const body = (await res.json()) as TrainingExampleRow & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Create failed (${res.status})`);

      setForm((prev) => ({
        ...emptyForm,
        topicId: prev.topicId,
        type: prev.type,
        status: prev.status,
      }));

      const fresh = await loadExamples();
      setExamples(fresh);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  const canSave =
    form.topicId !== ANY &&
    form.instruction.trim().length > 0 &&
    form.output.trim().length > 0 &&
    !saving;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add example</CardTitle>
          <CardDescription>
            Enter instruction / input / output manually. No AI generation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Topic</Label>
              <Select
                value={form.topicId}
                onValueChange={(topicId) => setForm((prev) => ({ ...prev, topicId }))}
                disabled={saving}
              >
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
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(type) =>
                  setForm((prev) => ({
                    ...prev,
                    type: type as (typeof EXAMPLE_TYPES)[number],
                  }))
                }
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
              <Select
                value={form.status}
                onValueChange={(status) =>
                  setForm((prev) => ({
                    ...prev,
                    status: status as "generated" | "approved" | "rejected",
                  }))
                }
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="generated">Generated</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-instruction">Instruction</Label>
            <Textarea
              id="new-instruction"
              value={form.instruction}
              onChange={(e) => setForm((prev) => ({ ...prev, instruction: e.target.value }))}
              placeholder="Task shown to the fine-tuned model"
              rows={2}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-input">Input</Label>
            <Textarea
              id="new-input"
              value={form.input}
              onChange={(e) => setForm((prev) => ({ ...prev, input: e.target.value }))}
              placeholder="Optional — leave empty when not needed"
              rows={3}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-output">Output</Label>
            <Textarea
              id="new-output"
              value={form.output}
              onChange={(e) => setForm((prev) => ({ ...prev, output: e.target.value }))}
              placeholder="Ideal model response"
              rows={4}
              disabled={saving}
            />
          </div>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <Button type="button" onClick={() => void handleCreate()} disabled={!canSave}>
            {saving ? "Saving…" : "Add example"}
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
            No examples match the current filters. Add one above or adjust filters.
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
