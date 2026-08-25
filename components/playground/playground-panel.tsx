"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PlaygroundModelKey, PlaygroundModels } from "@/lib/llm/models";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/rag/prompt-builder";

const ANY = "all";

type Option = { id: string; name: string };

type RetrievedChunk = {
  id: string;
  topicId: string;
  text: string;
  chunkOrder: number;
  score: number;
};

type PendingAction = "retrieve" | "chat" | "compare" | null;

type RegressionVerdict = "unset" | "better" | "worse" | "same" | "mixed";

type StreamChatResult = {
  chunks: RetrievedChunk[] | null;
  answer: string;
  error: string | null;
};

type PlaygroundPanelProps = {
  models: PlaygroundModels;
};

function formatScore(score: number) {
  const value = Number(score);
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function optionalId(value: string): string | undefined {
  return value && value !== ANY ? value : undefined;
}

export function PlaygroundPanel({ models }: PlaygroundPanelProps) {
  const [query, setQuery] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [modelKey, setModelKey] = useState<PlaygroundModelKey>("base");
  const [classId, setClassId] = useState(ANY);
  const [subjectId, setSubjectId] = useState(ANY);
  const [chapterId, setChapterId] = useState(ANY);
  const [topicId, setTopicId] = useState(ANY);

  const [classes, setClasses] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [chapters, setChapters] = useState<Option[]>([]);
  const [topics, setTopics] = useState<Option[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);

  const [chunks, setChunks] = useState<RetrievedChunk[] | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [compareBaseAnswer, setCompareBaseAnswer] = useState<string | null>(null);
  const [compareFineTunedAnswer, setCompareFineTunedAnswer] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [regressionVerdict, setRegressionVerdict] = useState<RegressionVerdict>("unset");
  const [regressionNotes, setRegressionNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);

  const selectedModel =
    modelKey === "fine-tuned" ? models.fineTuned : models.base;
  const fineTunedReady = models.fineTuned.available;

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
      setTopics([]);
      setLoadingSubjects(false);
      setLoadingChapters(false);
      setLoadingTopics(false);
      return;
    }

    const controller = new AbortController();
    setLoadingSubjects(true);
    setChapters([]);
    setTopics([]);
    fetchOptions(`/api/curriculum/subjects?classId=${encodeURIComponent(classId)}`, controller.signal)
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
      setTopics([]);
      setLoadingChapters(false);
      setLoadingTopics(false);
      return;
    }

    const controller = new AbortController();
    setLoadingChapters(true);
    setTopics([]);
    fetchOptions(`/api/curriculum/chapters?subjectId=${encodeURIComponent(subjectId)}`, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setChapters(data);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingChapters(false);
      });
    return () => controller.abort();
  }, [subjectId]);

  useEffect(() => {
    if (chapterId === ANY) {
      setTopics([]);
      setLoadingTopics(false);
      return;
    }

    const controller = new AbortController();
    setLoadingTopics(true);
    fetchOptions(`/api/topics?chapterId=${encodeURIComponent(chapterId)}`, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setTopics(data);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingTopics(false);
      });
    return () => controller.abort();
  }, [chapterId]);

  function filterPayload() {
    return {
      query: query.trim(),
      classId: optionalId(classId),
      subjectId: optionalId(subjectId),
      chapterId: optionalId(chapterId),
      topicId: optionalId(topicId),
    };
  }

  async function runRetrieve() {
    const payload = filterPayload();
    if (!payload.query) {
      setError("Enter a question first.");
      return;
    }

    setPending("retrieve");
    setError(null);
    setAnswer(null);
    setCompareMode(false);
    setCompareBaseAnswer(null);
    setCompareFineTunedAnswer(null);
    try {
      const response = await fetch("/api/test/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJson(response);
      if (!response.ok) {
        setChunks(null);
        setError(errorMessage(data, "Retrieval failed"));
        return;
      }
      setChunks(asChunks(data));
    } catch (err) {
      setChunks(null);
      setError(err instanceof Error ? err.message : "Retrieval failed");
    } finally {
      setPending(null);
    }
  }

  async function streamChat(args: {
    model: string;
    onMeta?: (chunks: RetrievedChunk[]) => void;
    onToken?: (delta: string) => void;
  }): Promise<StreamChatResult> {
    const payload = filterPayload();
    const response = await fetch("/api/test/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        systemPrompt: systemPrompt.trim() || undefined,
        model: args.model,
      }),
    });

    if (!response.ok) {
      const data = await readJson(response);
      return {
        chunks: null,
        answer: "",
        error: errorMessage(data, "Chat failed"),
      };
    }

    if (!response.body) {
      return { chunks: null, answer: "", error: "Chat returned an empty response." };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answerText = "";
    let chunksResult: RetrievedChunk[] | null = null;
    let streamError: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const event = parseStreamEvent(line);
        if (!event) continue;

        if (event.type === "meta") {
          chunksResult = asChunks(event);
          args.onMeta?.(chunksResult);
        } else if (event.type === "token" && typeof event.delta === "string") {
          answerText += event.delta;
          args.onToken?.(event.delta);
        } else if (event.type === "error") {
          streamError = errorMessage(event, "Chat failed");
        }
      }
    }

    const trailing = parseStreamEvent(buffer);
    if (trailing?.type === "token" && typeof trailing.delta === "string") {
      answerText += trailing.delta;
      args.onToken?.(trailing.delta);
    } else if (trailing?.type === "error") {
      streamError = errorMessage(trailing, "Chat failed");
    }

    return { chunks: chunksResult, answer: answerText, error: streamError };
  }

  async function runChat() {
    const payload = filterPayload();
    if (!payload.query) {
      setError("Enter a question first.");
      return;
    }

    if (modelKey === "fine-tuned" && !fineTunedReady) {
      setError(
        "No fine-tuned model registered yet. Complete a training job and register it in Ollama first.",
      );
      return;
    }

    setPending("chat");
    setError(null);
    setCompareMode(false);
    setCompareBaseAnswer(null);
    setCompareFineTunedAnswer(null);
    setAnswer("");

    try {
      const result = await streamChat({
        model: selectedModel.ollamaModel,
        onMeta: (nextChunks) => setChunks(nextChunks),
        onToken: (delta) => setAnswer((current) => (current ?? "") + delta),
      });

      if (result.error) {
        setAnswer(null);
        setError(result.error);
        if (result.chunks) setChunks(result.chunks);
        return;
      }

      if (result.chunks) setChunks(result.chunks);
      setAnswer(result.answer);
    } catch (err) {
      setChunks(null);
      setAnswer(null);
      setError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setPending(null);
    }
  }

  async function runCompare() {
    const payload = filterPayload();
    if (!payload.query) {
      setError("Enter a question first.");
      return;
    }

    if (!fineTunedReady) {
      setError(
        "No fine-tuned model registered yet. Complete a training job and register it in Ollama first.",
      );
      return;
    }

    setPending("compare");
    setError(null);
    setCompareMode(true);
    setAnswer(null);
    setCompareBaseAnswer("");
    setCompareFineTunedAnswer("");

    try {
      const [baseResult, fineTunedResult] = await Promise.all([
        streamChat({
          model: models.base.ollamaModel,
          onMeta: (nextChunks) => setChunks(nextChunks),
          onToken: (delta) =>
            setCompareBaseAnswer((current) => (current ?? "") + delta),
        }),
        streamChat({
          model: models.fineTuned.ollamaModel,
          onToken: (delta) =>
            setCompareFineTunedAnswer((current) => (current ?? "") + delta),
        }),
      ]);

      if (baseResult.chunks) setChunks(baseResult.chunks);
      else if (fineTunedResult.chunks) setChunks(fineTunedResult.chunks);

      setCompareBaseAnswer(baseResult.answer);
      setCompareFineTunedAnswer(fineTunedResult.answer);

      const errors = [baseResult.error, fineTunedResult.error].filter(Boolean);
      if (errors.length > 0) {
        setError(errors.join(" · "));
      }
    } catch (err) {
      setCompareBaseAnswer(null);
      setCompareFineTunedAnswer(null);
      setError(err instanceof Error ? err.message : "Compare failed");
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Query</CardTitle>
          <CardDescription>
            Narrow retrieval with class → subject → chapter → topic. Leave a level on Any
            to search more broadly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="playground-query">Question</Label>
            <Textarea
              id="playground-query"
              className="min-h-[96px]"
              placeholder="What is pollination?"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={busy}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="playground-model">Model</Label>
              <Select
                disabled={busy}
                value={modelKey}
                onValueChange={(value) => setModelKey(value as PlaygroundModelKey)}
              >
                <SelectTrigger id="playground-model">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="base">
                    Base ({models.base.ollamaModel})
                  </SelectItem>
                  <SelectItem value="fine-tuned" disabled={!fineTunedReady}>
                    Fine-tuned ({models.fineTuned.ollamaModel})
                    {!fineTunedReady ? " — not registered" : ""}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used for Full AI answer. Compare always runs both models.
              </p>
            </div>
            <FilterSelect
              label="Class"
              value={classId}
              options={classes}
              anyLabel="Any class"
              disabled={busy || loadingClasses}
              loading={loadingClasses}
              onChange={(value) => {
                setClassId(value);
                setSubjectId(ANY);
                setChapterId(ANY);
                setTopicId(ANY);
              }}
            />
            <FilterSelect
              label="Subject"
              value={subjectId}
              options={subjects}
              anyLabel="Any subject"
              emptyLabel="No subjects in this class"
              lockedLabel="Select a class first"
              locked={classId === ANY}
              disabled={busy || classId === ANY || loadingSubjects}
              loading={loadingSubjects}
              onChange={(value) => {
                setSubjectId(value);
                setChapterId(ANY);
                setTopicId(ANY);
              }}
            />
            <FilterSelect
              label="Chapter"
              value={chapterId}
              options={chapters}
              anyLabel="Any chapter"
              emptyLabel="No chapters in this subject"
              lockedLabel="Select a subject first"
              locked={subjectId === ANY}
              disabled={busy || subjectId === ANY || loadingChapters}
              loading={loadingChapters}
              onChange={(value) => {
                setChapterId(value);
                setTopicId(ANY);
              }}
            />
            <FilterSelect
              label="Topic"
              value={topicId}
              options={topics}
              anyLabel="Any topic"
              emptyLabel="No topics in this chapter"
              lockedLabel="Select a chapter first"
              locked={chapterId === ANY}
              disabled={busy || chapterId === ANY || loadingTopics}
              loading={loadingTopics}
              onChange={setTopicId}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="playground-system-prompt">System prompt</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || systemPrompt === DEFAULT_SYSTEM_PROMPT}
                onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
              >
                Reset to default
              </Button>
            </div>
            <Textarea
              id="playground-system-prompt"
              className="min-h-[140px] font-mono text-sm"
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">
              Used for Full AI answer and Compare. Changing it does not re-embed topics.
            </p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => void runRetrieve()}>
              {pending === "retrieve" ? "Retrieving…" : "Retrieve chunks"}
            </Button>
            <Button type="button" disabled={busy} onClick={() => void runChat()}>
              {pending === "chat" ? "Generating…" : "Full AI answer"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !fineTunedReady}
              onClick={() => void runCompare()}
            >
              {pending === "compare" ? "Comparing…" : "Compare both"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {compareMode ? (
        <>
          <Card className="flex min-h-[320px] flex-col">
            <CardHeader>
              <CardTitle>Retrieved chunks</CardTitle>
              <CardDescription>
                {chunks
                  ? `${chunks.length} result${chunks.length === 1 ? "" : "s"} with similarity score`
                  : "Raw chunks and scores shared by both models"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-3 overflow-auto">
              <ChunkList chunks={chunks} />
            </CardContent>
          </Card>

          <Card className="flex min-h-[420px] flex-col">
            <CardHeader>
              <CardTitle>Side-by-side compare</CardTitle>
              <CardDescription>
                Same question, retrieval filters, and system prompt — different models
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid flex-1 gap-4 md:grid-cols-2">
                <AnswerColumn
                  title="Base"
                  modelTag={models.base.ollamaModel}
                  answer={compareBaseAnswer}
                  streaming={pending === "compare"}
                />
                <AnswerColumn
                  title="Fine-tuned"
                  modelTag={models.fineTuned.ollamaModel}
                  answer={compareFineTunedAnswer}
                  streaming={pending === "compare"}
                />
              </div>

              <div className="space-y-4 border-t pt-4">
                <div>
                  <CardTitle className="text-base">Regression notes</CardTitle>
                  <CardDescription className="mt-1">
                    Record whether the fine-tuned model did better or worse on this
                    topic/question so you can track regressions across evals.
                  </CardDescription>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="regression-verdict">Fine-tuned vs base</Label>
                    <Select
                      disabled={busy}
                      value={regressionVerdict}
                      onValueChange={(value) =>
                        setRegressionVerdict(value as RegressionVerdict)
                      }
                    >
                      <SelectTrigger id="regression-verdict">
                        <SelectValue placeholder="Pick a verdict" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">Not rated</SelectItem>
                        <SelectItem value="better">Better</SelectItem>
                        <SelectItem value="worse">Worse</SelectItem>
                        <SelectItem value="same">About the same</SelectItem>
                        <SelectItem value="mixed">Mixed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="regression-notes">Notes</Label>
                    <Textarea
                      id="regression-notes"
                      className="min-h-[96px]"
                      placeholder="e.g. Topic: Pollination — fine-tuned explains insect role better; still weak on MCQ distractors."
                      value={regressionNotes}
                      onChange={(event) => setRegressionNotes(event.target.value)}
                      disabled={busy}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex min-h-[420px] flex-col">
            <CardHeader>
              <CardTitle>Retrieved chunks</CardTitle>
              <CardDescription>
                {chunks
                  ? `${chunks.length} result${chunks.length === 1 ? "" : "s"} with similarity score`
                  : "Raw chunks and scores, without calling the model"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-3 overflow-auto">
              <ChunkList chunks={chunks} />
            </CardContent>
          </Card>

          <Card className="flex min-h-[420px] flex-col">
            <CardHeader>
              <CardTitle>AI answer</CardTitle>
              <CardDescription>
                {selectedModel.label} · {selectedModel.ollamaModel}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              <AnswerBody
                answer={answer}
                streaming={pending === "chat"}
                emptyHint="Run Full AI answer to generate a response from the retrieved chunks."
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function ChunkList({ chunks }: { chunks: RetrievedChunk[] | null }) {
  if (chunks === null) {
    return <p className="text-sm text-muted-foreground">Run a query to retrieve chunks.</p>;
  }

  if (chunks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No matching chunks. Embed topics first, or widen the filters.
      </p>
    );
  }

  return (
    <>
      {chunks.map((chunk, index) => (
        <div key={chunk.id} className="rounded-lg border p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">
              Chunk {typeof chunk.chunkOrder === "number" ? chunk.chunkOrder + 1 : index + 1}
            </p>
            <Badge variant="secondary" className="tabular-nums">
              {formatScore(chunk.score)}
            </Badge>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{chunk.text}</p>
        </div>
      ))}
    </>
  );
}

function AnswerColumn({
  title,
  modelTag,
  answer,
  streaming,
}: {
  title: string;
  modelTag: string;
  answer: string | null;
  streaming: boolean;
}) {
  return (
    <div className="flex min-h-[280px] flex-col rounded-lg border p-3">
      <div className="mb-3 space-y-1 border-b pb-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="font-mono text-xs text-muted-foreground">{modelTag}</p>
      </div>
      <div className="flex-1 overflow-auto">
        <AnswerBody
          answer={answer}
          streaming={streaming}
          emptyHint="Waiting for compare…"
        />
      </div>
    </div>
  );
}

function AnswerBody({
  answer,
  streaming,
  emptyHint,
}: {
  answer: string | null;
  streaming: boolean;
  emptyHint: string;
}) {
  if (streaming && !answer) {
    return <p className="text-sm text-muted-foreground">Waiting for the local model…</p>;
  }

  if (answer === null) {
    return <p className="text-sm text-muted-foreground">{emptyHint}</p>;
  }

  if (answer.trim()) {
    return (
      <p className="whitespace-pre-wrap text-sm leading-relaxed">
        {answer}
        {streaming ? (
          <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground align-text-bottom" />
        ) : null}
      </p>
    );
  }

  if (streaming) {
    return (
      <p className="text-sm text-muted-foreground">
        Generating…
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-muted-foreground align-text-bottom" />
      </p>
    );
  }

  return <p className="text-sm text-muted-foreground">The model returned an empty answer.</p>;
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

async function fetchOptions(url: string, signal: AbortSignal): Promise<Option[]> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return [];
    const data: unknown = await response.json();
    if (!Array.isArray(data)) return [];
    return data.flatMap((item) => {
      if (
        item &&
        typeof item === "object" &&
        "id" in item &&
        "name" in item &&
        typeof item.id === "string" &&
        typeof item.name === "string"
      ) {
        return [{ id: item.id, name: item.name }];
      }
      return [];
    });
  } catch (error) {
    if (signal.aborted) return [];
    console.error(error);
    return [];
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const data = (await response.json().catch(() => null)) as unknown;
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return {};
}

function errorMessage(data: Record<string, unknown>, fallback: string) {
  return typeof data.error === "string" && data.error.trim() ? data.error : fallback;
}

function parseStreamEvent(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const data = JSON.parse(trimmed) as unknown;
    if (data && typeof data === "object") return data as Record<string, unknown>;
  } catch {
    return null;
  }

  return null;
}

function asChunks(data: Record<string, unknown>): RetrievedChunk[] {
  if (!Array.isArray(data.chunks)) return [];
  return data.chunks.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.text !== "string") return [];
    return [
      {
        id: row.id,
        topicId: typeof row.topicId === "string" ? row.topicId : "",
        text: row.text,
        chunkOrder: typeof row.chunkOrder === "number" ? row.chunkOrder : Number(row.chunkOrder) || 0,
        score: Number(row.score),
      },
    ];
  });
}
