import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CreateChapterInput, CreateClassInput, CreateSubjectInput } from "./schemas";

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

function mapPrismaError(error: unknown): CurriculumError {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    return new CurriculumError("Referenced parent record was not found", 400);
  }
  if (error instanceof CurriculumError) {
    return error;
  }
  return new CurriculumError("Unable to save curriculum record", 500);
}
