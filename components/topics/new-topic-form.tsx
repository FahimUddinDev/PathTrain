"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CascadeSelect } from "@/components/curriculum/cascade-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const newTopicSchema = z.object({
  classId: z.string().min(1, "Class is required"),
  subjectId: z.string().min(1, "Subject is required"),
  chapterId: z.string().min(1, "Chapter is required"),
  name: z.string().trim().min(1, "Name is required"),
  text: z.string().trim().min(1, "Text is required"),
});

type NewTopicValues = z.infer<typeof newTopicSchema>;

async function readError(response: Response) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "Request failed";
}

export function NewTopicForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<NewTopicValues>({
    resolver: zodResolver(newTopicSchema),
    defaultValues: { classId: "", subjectId: "", chapterId: "", name: "", text: "" },
  });

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
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : "Create topic"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
