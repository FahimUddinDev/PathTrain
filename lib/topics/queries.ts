import { prisma } from "@/lib/db/prisma";

export type TopicListRow = {
  id: string;
  name: string;
  status: string;
  chapter: {
    name: string;
    subject: { name: string; class: { name: string } };
  };
  _count: { chunks: number };
};

export type TopicWithChunks = {
  id: string;
  name: string;
  rawText: string;
  status: string;
  failureReason: string | null;
  chapter: {
    name: string;
    subject: { name: string; class: { name: string } };
  };
  chunks: TopicChunk[];
};

export type TopicChunk = {
  id: string;
  text: string;
  chunkOrder: number;
  tokenCount: number;
  page: number | null;
  embeddingStatus: string;
};

export function formatTopicPath(topic: {
  chapter: { name: string; subject: { name: string; class: { name: string } } };
}) {
  return `${topic.chapter.subject.class.name} / ${topic.chapter.subject.name} / ${topic.chapter.name}`;
}

export async function listTopics(): Promise<TopicListRow[]> {
  const topics = await prisma.topic.findMany({
    include: {
      chapter: { include: { subject: { include: { class: true } } } },
      _count: { select: { chunks: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return topics.map((topic) => ({
    id: topic.id,
    name: topic.name,
    status: topic.status,
    chapter: {
      name: topic.chapter.name,
      subject: {
        name: topic.chapter.subject.name,
        class: { name: topic.chapter.subject.class.name },
      },
    },
    _count: { chunks: topic._count.chunks },
  }));
}

export async function getTopicWithChunks(id: string): Promise<TopicWithChunks | null> {
  const topic = await prisma.topic.findUnique({
    where: { id },
    include: {
      chapter: { include: { subject: { include: { class: true } } } },
      chunks: { orderBy: { chunkOrder: "asc" } },
    },
  });
  if (!topic) return null;

  return {
    id: topic.id,
    name: topic.name,
    rawText: topic.rawText,
    status: topic.status,
    failureReason: readNullableString(topic, "failureReason"),
    chapter: {
      name: topic.chapter.name,
      subject: {
        name: topic.chapter.subject.name,
        class: { name: topic.chapter.subject.class.name },
      },
    },
    chunks: topic.chunks.map((chunk) => ({
      id: chunk.id,
      text: chunk.text,
      chunkOrder: chunk.chunkOrder,
      tokenCount: chunk.tokenCount,
      page: readNullableNumber(chunk, "page"),
      embeddingStatus: chunk.embeddingStatus,
    })),
  };
}

function readNullableString(record: object, key: string): string | null {
  const value = (record as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function readNullableNumber(record: object, key: string): number | null {
  const value = (record as Record<string, unknown>)[key];
  return typeof value === "number" ? value : null;
}
