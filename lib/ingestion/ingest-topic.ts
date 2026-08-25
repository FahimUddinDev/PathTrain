import { prisma } from "@/lib/db/prisma";
import { CurriculumError } from "@/lib/curriculum/service";
import { chunkText } from "@/lib/ingestion/chunker";
import type { CreateTopicInput } from "@/lib/curriculum/schemas";

export async function createAndChunkTopic(input: CreateTopicInput) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: input.chapterId },
    select: { id: true },
  });
  if (!chapter) {
    throw new CurriculumError("Chapter not found", 400);
  }

  const drafts = chunkText(input.name, input.text);

  return prisma.$transaction(async (tx) => {
    const topic = await tx.topic.create({
      data: {
        chapterId: input.chapterId,
        name: input.name,
        rawText: input.text,
        status: "draft",
      },
    });

    if (drafts.length > 0) {
      await tx.chunk.createMany({
        data: drafts.map((draft) => ({
          topicId: topic.id,
          text: draft.text,
          chunkOrder: draft.chunkOrder,
          tokenCount: draft.tokenCount,
        })),
      });
    }

    return tx.topic.update({
      where: { id: topic.id },
      data: { status: "chunked" },
      include: {
        chunks: { orderBy: { chunkOrder: "asc" } },
      },
    });
  });
}
