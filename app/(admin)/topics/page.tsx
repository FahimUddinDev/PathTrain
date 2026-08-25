import Link from "next/link";
import { TopicsTable } from "@/components/topics/topics-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatTopicPath, listTopics, type TopicListRow } from "@/lib/topics/queries";

export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  let topics: TopicListRow[] = [];
  let dbError: string | null = null;

  try {
    topics = await listTopics();
  } catch {
    dbError =
      "Database is not available. Set DATABASE_URL in .env and run `pnpm prisma migrate deploy`.";
  }

  const rows = topics.map((topic) => ({
    id: topic.id,
    name: topic.name,
    status: topic.status,
    path: formatTopicPath(topic),
    chunkCount: topic._count.chunks,
  }));

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Topics</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            All ingested topics with status: draft, chunked, embedding, embedded, or failed.
          </p>
        </div>
        <Button asChild>
          <Link href="/topics/new">New topic</Link>
        </Button>
      </div>
      {dbError ? <p className="text-sm text-destructive">{dbError}</p> : null}
      {!dbError && rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No topics yet.{" "}
            <Link href="/topics/new" className="underline hover:text-foreground">
              Create one
            </Link>{" "}
            to paste textbook text and generate chunks.
          </CardContent>
        </Card>
      ) : null}
      {!dbError && rows.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <TopicsTable topics={rows} />
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
