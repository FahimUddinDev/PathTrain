/** Separate from regressions.ts so client components can use these without
 *  pulling Prisma into the browser bundle. */

/** "unset" is a UI placeholder only — an unrated comparison is not worth saving. */
export const REGRESSION_VERDICTS = ["better", "worse", "same", "mixed"] as const;

export type RegressionVerdict = (typeof REGRESSION_VERDICTS)[number];

export const VERDICT_LABELS: Record<RegressionVerdict, string> = {
  better: "Better",
  worse: "Worse",
  same: "About the same",
  mixed: "Mixed",
};

export type RegressionNoteSummary = {
  id: string;
  query: string;
  topicId: string | null;
  topicName: string | null;
  baseModel: string;
  fineTunedModel: string;
  verdict: RegressionVerdict;
  notes: string | null;
  createdAt: string;
};
