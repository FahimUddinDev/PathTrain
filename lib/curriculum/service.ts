import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type {
  CreateChapterInput,
  CreateClassInput,
  CreateSubjectInput,
  UpdateChapterInput,
  UpdateClassInput,
  UpdateSubjectInput,
} from "./schemas";

export class CurriculumError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function listClasses() {
  return prisma.class.findMany({
    orderBy: { createdAt: "asc" },
  });
}

export async function listSubjects(classId?: string) {
  return prisma.subject.findMany({
    where: classId ? { classId } : undefined,
    orderBy: { createdAt: "asc" },
    include: { class: { select: { id: true, name: true } } },
  });
}

export async function listChapters(subjectId?: string) {
  return prisma.chapter.findMany({
    where: subjectId ? { subjectId } : undefined,
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: {
      subject: {
        select: {
          id: true,
          name: true,
          class: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function listCurriculumTree() {
  return prisma.class.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      subjects: {
        orderBy: { createdAt: "asc" },
        include: {
          chapters: {
            orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });
}

export async function createClass(input: CreateClassInput) {
  return prisma.class.create({
    data: { name: input.name },
  });
}

export async function createSubject(input: CreateSubjectInput) {
  const parent = await prisma.class.findUnique({ where: { id: input.classId } });
  if (!parent) {
    throw new CurriculumError("Class not found", 400);
  }

  try {
    return await prisma.subject.create({
      data: { classId: input.classId, name: input.name },
    });
  } catch (error) {
    throw mapPrismaError(error);
  }
}

export async function createChapter(input: CreateChapterInput) {
  const parent = await prisma.subject.findUnique({ where: { id: input.subjectId } });
  if (!parent) {
    throw new CurriculumError("Subject not found", 400);
  }

  const order =
    input.order ??
    ((
      await prisma.chapter.aggregate({
        where: { subjectId: input.subjectId },
        _max: { order: true },
      })
    )._max.order ?? -1) + 1;

  try {
    return await prisma.chapter.create({
      data: {
        subjectId: input.subjectId,
        name: input.name,
        order,
      },
    });
  } catch (error) {
    throw mapPrismaError(error);
  }
}

export async function updateClass(id: string, input: UpdateClassInput) {
  await requireClass(id);
  try {
    return await prisma.class.update({ where: { id }, data: { name: input.name } });
  } catch (error) {
    throw mapPrismaError(error);
  }
}

export async function updateSubject(id: string, input: UpdateSubjectInput) {
  const existing = await prisma.subject.findUnique({ where: { id } });
  if (!existing) {
    throw new CurriculumError("Subject not found", 404);
  }
  if (input.classId) {
    const parent = await prisma.class.findUnique({ where: { id: input.classId } });
    if (!parent) {
      throw new CurriculumError("Class not found", 400);
    }
  }

  try {
    return await prisma.subject.update({
      where: { id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.classId === undefined ? {} : { classId: input.classId }),
      },
    });
  } catch (error) {
    throw mapPrismaError(error);
  }
}

export async function updateChapter(id: string, input: UpdateChapterInput) {
  const existing = await prisma.chapter.findUnique({ where: { id } });
  if (!existing) {
    throw new CurriculumError("Chapter not found", 404);
  }
  if (input.subjectId) {
    const parent = await prisma.subject.findUnique({ where: { id: input.subjectId } });
    if (!parent) {
      throw new CurriculumError("Subject not found", 400);
    }
  }

  try {
    return await prisma.chapter.update({
      where: { id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.subjectId === undefined ? {} : { subjectId: input.subjectId }),
        ...(input.order === undefined ? {} : { order: input.order }),
      },
    });
  } catch (error) {
    throw mapPrismaError(error);
  }
}

export type CurriculumEntity = "class" | "subject" | "chapter";

export type DescendantCounts = {
  subjects: number;
  chapters: number;
  topics: number;
  trainingExamples: number;
};

/** What a cascading delete would remove, so the admin can confirm before losing data. */
export async function countDescendants(
  entity: CurriculumEntity,
  id: string,
): Promise<DescendantCounts> {
  const topicWhere: Prisma.TopicWhereInput =
    entity === "class"
      ? { chapter: { subject: { classId: id } } }
      : entity === "subject"
        ? { chapter: { subjectId: id } }
        : { chapterId: id };

  const [subjects, chapters, topics, trainingExamples] = await Promise.all([
    entity === "class" ? prisma.subject.count({ where: { classId: id } }) : Promise.resolve(0),
    entity === "chapter"
      ? Promise.resolve(0)
      : prisma.chapter.count({
          where: entity === "class" ? { subject: { classId: id } } : { subjectId: id },
        }),
    prisma.topic.count({ where: topicWhere }),
    prisma.trainingExample.count({ where: { topic: topicWhere } }),
  ]);

  return { subjects, chapters, topics, trainingExamples };
}

export async function deleteClass(id: string) {
  await requireClass(id);
  try {
    return await prisma.class.delete({ where: { id } });
  } catch (error) {
    throw mapPrismaError(error);
  }
}

export async function deleteSubject(id: string) {
  const existing = await prisma.subject.findUnique({ where: { id } });
  if (!existing) {
    throw new CurriculumError("Subject not found", 404);
  }
  try {
    return await prisma.subject.delete({ where: { id } });
  } catch (error) {
    throw mapPrismaError(error);
  }
}

export async function deleteChapter(id: string) {
  const existing = await prisma.chapter.findUnique({ where: { id } });
  if (!existing) {
    throw new CurriculumError("Chapter not found", 404);
  }
  try {
    return await prisma.chapter.delete({ where: { id } });
  } catch (error) {
    throw mapPrismaError(error);
  }
}

async function requireClass(id: string) {
  const found = await prisma.class.findUnique({ where: { id } });
  if (!found) {
    throw new CurriculumError("Class not found", 404);
  }
  return found;
}

function mapPrismaError(error: unknown): CurriculumError {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    return new CurriculumError("Referenced parent record was not found", 400);
  }
  if (error instanceof CurriculumError) {
    return error;
  }
  return new CurriculumError("Unable to save curriculum record", 500);
}
