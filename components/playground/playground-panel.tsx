"use client";

type PlaygroundPanelProps = {
  query?: string;
  onQueryChange?: (value: string) => void;
};

/** Query box + retrieved chunks vs answer. Wire in Milestone 4. */
export function PlaygroundPanel(_props: PlaygroundPanelProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded border p-4">
        <h2 className="mb-2 font-medium">Retrieved chunks</h2>
      </div>
      <div className="rounded border p-4">
        <h2 className="mb-2 font-medium">AI answer</h2>
      </div>
    </div>
  );
}
