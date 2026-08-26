export const EXAMPLE_TYPES = [
  "qna",
  "mcq",
  "srijonsil",
  "evaluation",
  "multi_explain",
] as const;

export type ExampleType = (typeof EXAMPLE_TYPES)[number];

export const TYPE_LABELS: Record<ExampleType, string> = {
  qna: "Q&A",
  mcq: "MCQ",
  srijonsil: "Srijonsil",
  evaluation: "Evaluation",
  multi_explain: "Multi-explain",
};

export const EXAMPLE_STATUSES = ["generated", "approved", "rejected"] as const;

export type ExampleStatus = (typeof EXAMPLE_STATUSES)[number];
