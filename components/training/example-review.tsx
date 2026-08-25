"use client";

type ExampleReviewProps = {
  exampleId?: string;
};

/** Approve / reject / edit generated examples. Wire in Milestone 6. */
export function ExampleReview(_props: ExampleReviewProps) {
  return (
    <div className="flex gap-2">
      <button type="button" className="rounded border px-3 py-1 text-sm">
        Approve
      </button>
      <button type="button" className="rounded border px-3 py-1 text-sm">
        Reject
      </button>
    </div>
  );
}
