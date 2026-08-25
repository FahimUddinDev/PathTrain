import Link from "next/link";

export default function TopicsPage() {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Topics</h1>
        <Link href="/topics/new" className="text-sm underline">
          New topic
        </Link>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Topic list and status: draft, chunked, embedding, embedded, failed.
      </p>
    </section>
  );
}
