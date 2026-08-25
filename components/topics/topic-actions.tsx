"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TopicStatusBadge } from "@/components/topics/topic-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type TopicActionsProps = {
  topicId: string;
  initialName: string;
  initialRawText: string;
  initialStatus: string;
  chunkCount: number;
};

async function readError(response: Response) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "Request failed";
}

export function TopicActions({
  topicId,
  initialName,
  initialRawText,
  initialStatus,
  chunkCount,
}: TopicActionsProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [rawText, setRawText] = useState(initialRawText);
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [embedding, setEmbedding] = useState(false);
  const [saving, setSaving] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setName(initialName);
    setRawText(initialRawText);
    setStatus(initialStatus);
  }, [initialName, initialRawText, initialStatus]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startStatusPolling() {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/topics/${topicId}`);
        if (!response.ok) return;
        const topic = (await response.json()) as { status?: string };
        if (typeof topic.status === "string") {
          setStatus(topic.status);
        }
      } catch {
        // Ignore transient poll errors while embed/save runs.
      }
    }, 300);
  }

  async function waitForEmbedSettled(request: Promise<Response>) {
    startStatusPolling();
    try {
      const response = await request;
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const latest = await fetch(`/api/topics/${topicId}`);
      if (latest.ok) {
        const body = (await latest.json()) as { status?: string };
        if (typeof body.status === "string") setStatus(body.status);
      }
    } finally {
      stopPolling();
    }
  }

  async function onEmbed() {
    setError(null);
    setEmbedding(true);
    try {
      await waitForEmbedSettled(fetch(`/api/topics/${topicId}/embed`, { method: "POST" }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Embed failed");
      const latest = await fetch(`/api/topics/${topicId}`);
      if (latest.ok) {
        const body = (await latest.json()) as { status?: string };
        if (typeof body.status === "string") setStatus(body.status);
      }
      router.refresh();
    } finally {
      setEmbedding(false);
    }
  }

  async function onSave() {
    const trimmedName = name.trim();
    const trimmedText = rawText.trim();
    if (!trimmedName || !trimmedText) {
      setError("Name and text are required");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const patchResponse = await fetch(`/api/topics/${topicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, rawText: trimmedText }),
      });
      if (!patchResponse.ok) {
        throw new Error(await readError(patchResponse));
      }
      setStatus("draft");

      const chunkResponse = await fetch(`/api/topics/${topicId}/chunk`, { method: "POST" });
      if (!chunkResponse.ok) {
        throw new Error(await readError(chunkResponse));
      }
      setStatus("chunked");

      await waitForEmbedSettled(fetch(`/api/topics/${topicId}/embed`, { method: "POST" }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      const latest = await fetch(`/api/topics/${topicId}`);
      if (latest.ok) {
        const body = (await latest.json()) as { status?: string };
        if (typeof body.status === "string") setStatus(body.status);
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const busy = embedding || saving;
  const canEmbed =
    chunkCount > 0 && (status === "chunked" || status === "failed") && !busy;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <TopicStatusBadge status={status} />
        {canEmbed ? (
          <Button type="button" size="sm" onClick={onEmbed} disabled={busy}>
            {embedding ? "Embedding…" : "Embed"}
          </Button>
        ) : null}
        {embedding || status === "embedding" ? (
          <span className="text-sm text-muted-foreground">Embedding in progress…</span>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit topic</CardTitle>
          <CardDescription>
            Saving updates the text, re-chunks, then re-embeds with Ollama.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="topic-name">Topic name</Label>
            <Input
              id="topic-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="topic-text">Textbook text</Label>
            <Textarea
              id="topic-text"
              className="min-h-[200px]"
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              disabled={busy}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="button" onClick={onSave} disabled={busy}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
