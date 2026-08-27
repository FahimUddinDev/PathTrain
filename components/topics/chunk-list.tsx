"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { MAX_TOKENS, MIN_TOKENS } from "@/lib/ingestion/chunk-constants";
import type { TopicChunk } from "@/lib/topics/queries";

async function readError(response: Response) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "Request failed";
}

export function ChunkList({ topicId, chunks }: { topicId: string; chunks: TopicChunk[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium">
        Chunks <span className="font-normal text-muted-foreground">({chunks.length})</span>
      </h2>
      {chunks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            This topic has no chunks yet.
          </CardContent>
        </Card>
      ) : (
        chunks.map((chunk) => <ChunkCard key={chunk.id} topicId={topicId} chunk={chunk} />)
      )}
    </div>
  );
}

function ChunkCard({ topicId, chunk }: { topicId: string; chunk: TopicChunk }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(chunk.text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(chunk.text);
  }, [chunk.text]);

  async function onSave() {
    if (!text.trim()) {
      setError("Chunk text cannot be empty.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const response = await fetch(`/api/topics/${topicId}/chunks/${chunk.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }

      const embedResponse = await fetch(`/api/topics/${topicId}/embed`, { method: "POST" });
      if (!embedResponse.ok) {
        setError(`Saved, but re-embedding failed: ${await readError(embedResponse)}`);
      } else {
        setEditing(false);
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const outOfRange = chunk.tokenCount > MAX_TOKENS || chunk.tokenCount < MIN_TOKENS;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">
          Chunk {chunk.chunkOrder + 1}
          <span className="ml-2 font-normal text-muted-foreground">
            <span className={outOfRange ? "text-amber-600" : undefined}>
              {chunk.tokenCount} tokens
            </span>
            {chunk.page != null ? ` · page ${chunk.page}` : ""}
            {chunk.embeddingStatus !== "embedded" ? ` · ${chunk.embeddingStatus}` : ""}
          </span>
        </CardTitle>
        {editing ? null : (
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-3">
            <Textarea
              className="min-h-[180px]"
              value={text}
              onChange={(event) => setText(event.target.value)}
              disabled={saving}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex gap-3">
              <Button type="button" size="sm" onClick={() => void onSave()} disabled={saving}>
                {saving ? "Saving & re-embedding…" : "Save & re-embed"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setText(chunk.text);
                  setError(null);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{chunk.text}</p>
        )}
      </CardContent>
    </Card>
  );
}
