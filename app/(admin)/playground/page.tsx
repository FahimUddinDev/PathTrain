import { PlaygroundPanel } from "@/components/playground/playground-panel";
import { getPlaygroundModels } from "@/lib/llm/models";

export const dynamic = "force-dynamic";

export default async function PlaygroundPage() {
  let models: Awaited<ReturnType<typeof getPlaygroundModels>> | null = null;
  let modelsError: string | null = null;

  try {
    models = await getPlaygroundModels();
  } catch {
    modelsError =
      "Could not load model options. Check DATABASE_URL and OLLAMA_* env vars.";
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Playground</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask a question against embedded topics. Switch base vs fine-tuned, or
          compare both on the same query.
        </p>
      </div>
      {modelsError ? <p className="text-sm text-destructive">{modelsError}</p> : null}
      {models ? <PlaygroundPanel models={models} /> : null}
    </section>
  );
}
