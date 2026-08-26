"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CascadeSelect } from "@/components/curriculum/cascade-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX_TOKENS, MIN_TOKENS } from "@/lib/ingestion/chunk-constants";

const newTopicSchema = z.object({
  classId: z.string().min(1, "Class is required"),
  subjectId: z.string().min(1, "Subject is required"),
  chapterId: z.string().min(1, "Chapter is required"),
  name: z.string().trim().min(1, "Name is required"),
  text: z.string().trim().min(1, "Text is required"),
});

type NewTopicValues = z.infer<typeof newTopicSchema>;

type ChunkPreview = {
  chunkOrder: number;
  text: string;
  tokenCount: number;
};

async function readError(response: Response) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "Request failed";
}

export function NewTopicForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ChunkPreview[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const form = useForm<NewTopicValues>({
    resolver: zodResolver(newTopicSchema),
    defaultValues: { classId: "", subjectId: "", chapterId: "", name: "", text: "" },
  });

  const name = useWatch({ control: form.control, name: "name" }) ?? "";
  const text = useWatch({ control: form.control, name: "text" }) ?? "";

  async function onPreview() {
    const trimmedName = name.trim();
    const trimmedText = text.trim();
    if (!trimmedName || !trimmedText) {
      setError("Enter a topic name and text before previewing chunks.");
      return;
    }

    setError(null);
    setPreviewing(true);
    try {
      const response = await fetch("/api/topics/preview-chunks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, text: trimmedText }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const data = (await response.json()) as { chunks: ChunkPreview[] };
      setPreview(data.chunks);
    } finally {
      setPreviewing(false);
    }
  }

  async function onSubmit(values: NewTopicValues) {
    setError(null);
    const response = await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chapterId: values.chapterId,
        name: values.name,
        text: values.text,
      }),
    });
    if (!response.ok) {
      setError(await readError(response));
      return;
    }

    const created = (await response.json()) as { id?: string };
    router.push(created.id ? `/topics/${created.id}` : "/topics");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Topic details</CardTitle>
        <CardDescription>
          Class filters subjects, then chapters. Paste the full topic text below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            <CascadeSelect />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Topic name</FormLabel>
                  <FormControl>
                    <Input placeholder="Pollination" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Textbook text</FormLabel>
                  <FormControl>
                    <Textarea
                      className="min-h-[240px]"
                      placeholder="Paste the topic text from the book…"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {preview ? <ChunkPreviewList chunks={preview} /> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => void onPreview()}
                disabled={previewing || form.formState.isSubmitting}
              >
                {previewing ? "Chunking…" : "Preview chunks"}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting || previewing}>
                {form.formState.isSubmitting ? "Saving…" : "Create topic"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function ChunkPreviewList({ chunks }: { chunks: ChunkPreview[] }) {
  if (chunks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This text produces no chunks. Add more content.
      </p>
    );
  }

  const outOfRange = chunks.filter(
    (chunk, index) =>
      chunk.tokenCount > MAX_TOKENS ||
      // The last chunk is allowed to fall short — there is simply no text left.
      (index < chunks.length - 1 && chunk.tokenCount < MIN_TOKENS),
  ).length;

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
        <span className="font-medium">
          {chunks.length} chunk{chunks.length === 1 ? "" : "s"}
        </span>
        <span className="text-muted-foreground">
          Target {MIN_TOKENS}–{MAX_TOKENS} tokens each.
        </span>
        {outOfRange > 0 ? (
          <span className="text-destructive">{outOfRange} outside the target range.</span>
        ) : null}
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {chunks.map((chunk) => (
          <div key={chunk.chunkOrder} className="rounded-md bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Chunk {chunk.chunkOrder + 1} · {chunk.tokenCount} tokens
            </p>
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed">
              {chunk.text}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Chunks are regenerated on create; edit individual chunks afterwards on the topic page.
      </p>
    </div>
  );
}
