"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

type PendingAction = "retrieve" | "chat" | null;

function formatScore(score: number) {
  const value = Number(score);
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function optionalId(value: string): string | undefined {
  return value && value !== ANY ? value : undefined;
}

export function PlaygroundPanel() {
  const [query, setQuery] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);

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

  async function runChat() {
    const payload = filterPayload();
    if (!payload.query) {
      setError("Enter a question first.");
      return;
    }

    setPending("chat");
    setError(null);
    setAnswer("");
    try {
      const response = await fetch("/api/test/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          systemPrompt: systemPrompt.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await readJson(response);
        setChunks(null);
        setAnswer(null);
        setError(errorMessage(data, "Chat failed"));
        return;
      }

      if (!response.body) {
        setAnswer(null);
        setError("Chat returned an empty response.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
            setChunks(asChunks(event));
          } else if (event.type === "token" && typeof event.delta === "string") {
            setAnswer((current) => (current ?? "") + event.delta);
          } else if (event.type === "error") {
            setAnswer(null);
            setError(errorMessage(event, "Chat failed"));
          }
        }
      }

      const trailing = parseStreamEvent(buffer);
      if (trailing?.type === "token" && typeof trailing.delta === "string") {
        setAnswer((current) => (current ?? "") + trailing.delta);
      } else if (trailing?.type === "error") {
        setAnswer(null);
        setError(errorMessage(trailing, "Chat failed"));
      }
    } catch (err) {
      setChunks(null);
      setAnswer(null);
      setError(err instanceof Error ? err.message : "Chat failed");
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

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              Used only for Full AI answer. Changing it does not re-embed topics.
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
          </div>
        </CardContent>
      </Card>

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
            {chunks === null ? (
              <p className="text-sm text-muted-foreground">Run a query to retrieve chunks.</p>
            ) : chunks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No matching chunks. Embed topics first, or widen the filters.
              </p>
            ) : (
              chunks.map((chunk, index) => (
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
              ))
            )}
          </CardContent>
        </Card>

        <Card className="flex min-h-[420px] flex-col">
          <CardHeader>
            <CardTitle>AI answer</CardTitle>
            <CardDescription>Generated from retrieved chunks and the system prompt</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            {pending === "chat" && !answer ? (
              <p className="text-sm text-muted-foreground">Waiting for the local model…</p>
            ) : answer === null ? (
              <p className="text-sm text-muted-foreground">
                Run Full AI answer to generate a response from the retrieved chunks.
              </p>
            ) : answer.trim() ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {answer}
                {pending === "chat" ? (
                  <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground align-text-bottom" />
                ) : null}
              </p>
            ) : pending === "chat" ? (
              <p className="text-sm text-muted-foreground">
                Generating…
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-muted-foreground align-text-bottom" />
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">The model returned an empty answer.</p>
            )}
          </CardContent>
        </Card>
      </div>
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
