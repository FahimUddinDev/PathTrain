import { z } from "zod";

export const createClassSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
});

export const createSubjectSchema = z.object({
  classId: z.string().min(1, "classId is required"),
  name: z.string().trim().min(1, "name is required"),
});

export const createChapterSchema = z.object({
  subjectId: z.string().min(1, "subjectId is required"),
  name: z.string().trim().min(1, "name is required"),
  order: z
    .number({ error: "order must be a non-negative integer" })
    .int("order must be a non-negative integer")
    .min(0, "order must be a non-negative integer")
    .optional(),
});

export const createTopicSchema = z.object({
  chapterId: z.string().min(1, "chapterId is required"),
  name: z.string().trim().min(1, "name is required"),
  text: z.string().trim().min(1, "text is required"),
});

export const updateClassSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
});

export const updateSubjectSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  classId: z.string().min(1, "classId is required").optional(),
});

export const updateChapterSchema = z.object({
  name: z.string().trim().min(1, "name is required").optional(),
  subjectId: z.string().min(1, "subjectId is required").optional(),
  order: z
    .number({ error: "order must be a non-negative integer" })
    .int("order must be a non-negative integer")
    .min(0, "order must be a non-negative integer")
    .optional(),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type CreateChapterInput = z.infer<typeof createChapterSchema>;
export type CreateTopicInput = z.infer<typeof createTopicSchema>;
export type UpdateClassInput = z.infer<typeof updateClassSchema>;
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
export type UpdateChapterInput = z.infer<typeof updateChapterSchema>;
