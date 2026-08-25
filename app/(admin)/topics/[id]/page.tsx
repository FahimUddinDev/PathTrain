import Link from "next/link";
import { notFound } from "next/navigation";
import { TopicStatusBadge } from "@/components/topics/topic-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTopicPath, getTopicWithChunks } from "@/lib/topics/queries";

export const dynamic = "force-dynamic";

export default async function TopicDetailPage({ params }: { params: { id: string } }) {
  let topic: Awaited<ReturnType<typeof getTopicWithChunks>> | null = null;
  let dbError: string | null = null;

  try {
    topic = await getTopicWithChunks(params.id);
  } catch {
    dbError =
      "Database is not available. Set DATABASE_URL in .env and run `pnpm prisma migrate deploy`.";
  }

  if (!dbError && !topic) {
    notFound();
  }

  return (
    <section className="space-y-6">
      <div>
        <Link href="/topics" className="text-sm text-muted-foreground hover:text-foreground">
          ← Topics
        </Link>
        {topic ? (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{topic.name}</h1>
              <TopicStatusBadge status={topic.status} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{formatTopicPath(topic)}</p>
            {topic.status === "failed" && topic.failureReason ? (
              <p className="mt-2 text-sm text-destructive">{topic.failureReason}</p>
            ) : null}
          </>
        ) : (
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Topic</h1>
        )}
      </div>

      {dbError ? <p className="text-sm text-destructive">{dbError}</p> : null}

      {topic ? (
        <div className="space-y-3">
          <h2 className="text-sm font-medium">
            Chunks{" "}
            <span className="font-normal text-muted-foreground">({topic.chunks.length})</span>
          </h2>
          {topic.chunks.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                This topic has no chunks yet.
              </CardContent>
            </Card>
          ) : (
            topic.chunks.map((chunk) => (
              <Card key={chunk.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    Chunk {chunk.chunkOrder + 1}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {chunk.tokenCount} tokens
                      {chunk.page != null ? ` · page ${chunk.page}` : ""}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{chunk.text}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
