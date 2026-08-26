import Link from "next/link";
import { notFound } from "next/navigation";
import { ChunkList } from "@/components/topics/chunk-list";
import { TopicActions } from "@/components/topics/topic-actions";
import { formatTopicPath, getTopicWithChunks, type TopicWithChunks } from "@/lib/topics/queries";

export const dynamic = "force-dynamic";

export default async function TopicDetailPage({ params }: { params: { id: string } }) {
  let topic: TopicWithChunks | null = null;
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
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{topic.name}</h1>
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
        <>
          <TopicActions
            topicId={topic.id}
            initialName={topic.name}
            initialRawText={topic.rawText}
            initialStatus={topic.status}
            chunkCount={topic.chunks.length}
          />

          <ChunkList topicId={topic.id} chunks={topic.chunks} />
        </>
      ) : null}
    </section>
  );
}
