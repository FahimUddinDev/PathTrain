import { TrainingDatasetsPanel } from "@/components/training/training-datasets-panel";
import { listExportableDatasets } from "@/lib/training/queries";

export const dynamic = "force-dynamic";

export default async function TrainingDatasetsPage() {
  let datasets: Awaited<ReturnType<typeof listExportableDatasets>> = [];
  let dbError: string | null = null;

  try {
    datasets = await listExportableDatasets();
  } catch {
    dbError =
      "Database is not available. Set DATABASE_URL in .env and run `pnpm prisma migrate deploy`.";
  }

  const rows = datasets.map((d) => ({
    id: d.id,
    name: d.name,
    exampleCount: d.exampleCount,
    jsonlPath: d.jsonlPath,
    exportedAt: d.exportedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    filterCriteria: d.filterCriteria,
    log: d.log ?? null,
  }));

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Datasets</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Filter approved examples and export JSONL for Unsloth fine-tuning.
        </p>
      </div>
      {dbError ? <p className="text-sm text-destructive">{dbError}</p> : null}
      {!dbError ? <TrainingDatasetsPanel initialDatasets={rows} /> : null}
    </section>
  );
}
