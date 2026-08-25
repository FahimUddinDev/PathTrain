import { TrainingExamplesPanel } from "@/components/training/training-examples-panel";

export const dynamic = "force-dynamic";

export default function TrainingExamplesPage() {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Training examples</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review, edit, approve, or reject generated fine-tuning examples.
        </p>
      </div>
      <TrainingExamplesPanel />
    </section>
  );
}
