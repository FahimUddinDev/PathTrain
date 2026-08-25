import { PlaygroundPanel } from "@/components/playground/playground-panel";

export default function PlaygroundPage() {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Playground</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask a question against embedded topics. Filters and the system prompt apply
          to the next query — you do not need to re-ingest content.
        </p>
      </div>
      <PlaygroundPanel />
    </section>
  );
}
