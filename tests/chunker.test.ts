import { describe, expect, it } from "vitest";
import { MAX_TOKENS, MIN_TOKENS, chunkText, countTokens } from "@/lib/ingestion/chunker";

/** Roughly one textbook paragraph; repeated to build inputs of a realistic size. */
const PARAGRAPH = [
  "Pollination is the transfer of pollen grains from the anther of a flower to the stigma",
  "of the same or another flower. It is a necessary step before fertilisation can happen,",
  "and without it most flowering plants would not be able to produce seeds or fruit.",
  "Insects such as bees and butterflies carry pollen on their bodies as they move between",
  "flowers in search of nectar, which makes them some of the most important pollinators.",
  "Wind and water also move pollen, and some plants rely on birds or bats instead.",
].join(" ");

function textOfParagraphs(count: number): string {
  return Array.from({ length: count }, (_, i) => `${PARAGRAPH} (paragraph ${i + 1})`).join("\n\n");
}

describe("chunkText token range (NFR-04)", () => {
  it("never emits a chunk above the maximum", () => {
    const chunks = chunkText("Pollination", textOfParagraphs(40));

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(MAX_TOKENS);
    }
  });

  it("keeps every chunk except the last at or above the minimum", () => {
    const chunks = chunkText("Pollination", textOfParagraphs(40));

    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.tokenCount).toBeGreaterThanOrEqual(MIN_TOKENS);
    }
  });

  it("reports a token count that matches the chunk text", () => {
    for (const chunk of chunkText("Pollination", textOfParagraphs(12))) {
      expect(chunk.tokenCount).toBe(countTokens(chunk.text));
    }
  });

  it("prefixes every chunk with the topic name and numbers them in order", () => {
    const chunks = chunkText("Pollination", textOfParagraphs(20));

    chunks.forEach((chunk, index) => {
      expect(chunk.text.startsWith("Topic: Pollination\n\n")).toBe(true);
      expect(chunk.chunkOrder).toBe(index);
    });
  });

  it("splits long text without breaking words apart", () => {
    const source = textOfParagraphs(30);
    const rejoined = chunkText("Pollination", source)
      .map((chunk) => chunk.text.replace("Topic: Pollination\n\n", ""))
      .join(" ");

    for (const word of source.split(/\s+/).filter(Boolean)) {
      expect(rejoined).toContain(word);
    }
  });

  it("returns nothing for blank input", () => {
    expect(chunkText("Pollination", "   \n\n  ")).toEqual([]);
  });
});
