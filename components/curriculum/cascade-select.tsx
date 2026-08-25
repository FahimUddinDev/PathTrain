"use client";

type CascadeSelectProps = {
  classId?: string;
  subjectId?: string;
  chapterId?: string;
  onClassChange?: (id: string) => void;
  onSubjectChange?: (id: string) => void;
  onChapterChange?: (id: string) => void;
};

/** Class → Subject → Chapter cascade. Wire to curriculum APIs in Milestone 1. */
export function CascadeSelect(_props: CascadeSelectProps) {
  return (
    <div className="flex flex-col gap-3">
      <select className="rounded border px-2 py-1">
        <option value="">Select class</option>
      </select>
      <select className="rounded border px-2 py-1">
        <option value="">Select subject</option>
      </select>
      <select className="rounded border px-2 py-1">
        <option value="">Select chapter</option>
      </select>
    </div>
  );
}
