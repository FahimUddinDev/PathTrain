import { prisma } from "@/lib/db/prisma";

const topicPathInclude = {
  chapter: { include: { subject: { include: { class: true } } } },
} as const;

export function formatTopicPath(topic: {
  chapter: { name: string; subject: { name: string; class: { name: string } } };
}) {
  return `${topic.chapter.subject.class.name} / ${topic.chapter.subject.name} / ${topic.chapter.name}`;
}

export async function listTopics() {
  return prisma.topic.findMany({
    include: {
      ...topicPathInclude,
      _count: { select: { chunks: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getTopicWithChunks(id: string) {
  return prisma.topic.findUnique({
    where: { id },
    include: {
      ...topicPathInclude,
      chunks: { orderBy: { chunkOrder: "asc" } },
    },
  });
}
