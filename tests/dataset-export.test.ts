import { describe, expect, it } from "vitest";
import type { ExportableExample } from "@/lib/training/jsonl";
import { buildJsonlBody } from "@/lib/training/jsonl";

function example(overrides: Partial<ExportableExample> & { id: string }): ExportableExample {
  return {
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    instruction: `Explain topic ${overrides.id}`,
    input: "",
    output: `Answer for ${overrides.id}`,
    type: "qna",
    topic: {
      name: "Pollination",
      chapter: { subject: { name: "Science", class: { name: "Class 6" } } },
    },
    ...overrides,
  };
}

const EXAMPLES: ExportableExample[] = [
  example({ id: "b", createdAt: new Date("2026-01-02T00:00:00.000Z") }),
  example({ id: "a", createdAt: new Date("2026-01-01T00:00:00.000Z") }),
  example({ id: "c", createdAt: new Date("2026-01-01T00:00:00.000Z") }),
];

describe("buildJsonlBody determinism (NFR-06)", () => {
  it("produces identical bytes for the same set in a different order", () => {
    const first = buildJsonlBody(EXAMPLES);
    const second = buildJsonlBody([...EXAMPLES].reverse());

    expect(second).toBe(first);
  });

  it("orders by createdAt, then by id as a tie-break", () => {
    const ids = buildJsonlBody(EXAMPLES)
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).output as string);

    expect(ids).toEqual(["Answer for a", "Answer for c", "Answer for b"]);
  });

  it("writes one JSON object per line and ends with a newline", () => {
    const body = buildJsonlBody(EXAMPLES);

    expect(body.endsWith("\n")).toBe(true);
    expect(body.trim().split("\n")).toHaveLength(EXAMPLES.length);
  });

  it("emits the instruction/input/output shape with curriculum metadata", () => {
    const record = JSON.parse(buildJsonlBody([EXAMPLES[1]]).trim());

    expect(record).toEqual({
      instruction: "Explain topic a",
      input: "",
      output: "Answer for a",
      metadata: {
        class: "Class 6",
        subject: "Science",
        topic: "Pollination",
        type: "qna",
      },
    });
  });

  it("returns an empty string when there is nothing to export", () => {
    expect(buildJsonlBody([])).toBe("");
  });
});
