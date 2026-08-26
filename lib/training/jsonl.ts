/** Pure JSONL shaping for dataset export — no Prisma, no filesystem, so the
 *  determinism guarantee (NFR-06) can be tested without a database. */

export type ExportableExample = {
  id: string;
  createdAt: Date;
  instruction: string;
  input: string;
  output: string;
  type: string;
  topic: {
    name: string;
    chapter: {
      subject: {
        name: string;
        class: { name: string };
      };
    };
  };
};

export type JsonlRecord = {
  instruction: string;
  input: string;
  output: string;
  metadata: {
    class: string;
    subject: string;
    topic: string;
    type: string;
  };
};

export function toJsonlRecord(example: ExportableExample): JsonlRecord {
  return {
    instruction: example.instruction,
    input: example.input,
    output: example.output,
    metadata: {
      class: example.topic.chapter.subject.class.name,
      subject: example.topic.chapter.subject.name,
      topic: example.topic.name,
      type: example.type,
    },
  };
}

/**
 * Order by (createdAt, id) and serialise one record per line. Sorting here rather
 * than relying only on the query's ORDER BY means the same approved set always
 * produces byte-identical output, whatever order the rows arrive in.
 */
export function buildJsonlBody(examples: ExportableExample[]): string {
  const ordered = [...examples].sort((a, b) => {
    const byDate = a.createdAt.getTime() - b.createdAt.getTime();
    return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
  });

  if (ordered.length === 0) return "";
  return `${ordered.map((row) => JSON.stringify(toJsonlRecord(row))).join("\n")}\n`;
}
