import Link from "next/link";
import { NewTopicForm } from "@/components/topics/new-topic-form";

export default function NewTopicPage() {
  return (
    <section className="space-y-6">
      <div>
        <Link href="/topics" className="text-sm text-muted-foreground hover:text-foreground">
          ← Topics
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New topic</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose a chapter, name the topic, and paste textbook text. Submitting saves and chunks the topic.
        </p>
      </div>
      <NewTopicForm />
    </section>
  );
}
