import { TrainingJobsPanel } from "@/components/training/training-jobs-panel";
import {
  getActiveTrainingJob,
  listExportableDatasets,
} from "@/lib/training/queries";

export const dynamic = "force-dynamic";

export default async function TrainingJobsPage() {
  let datasets: Awaited<ReturnType<typeof listExportableDatasets>> = [];
  let activeJob: Awaited<ReturnType<typeof getActiveTrainingJob>> = null;
  let dbError: string | null = null;

  try {
    [datasets, activeJob] = await Promise.all([
      listExportableDatasets(),
      getActiveTrainingJob(),
    ]);
  } catch {
    dbError =
      "Database is not available. Set DATABASE_URL in .env and run `pnpm prisma migrate deploy`.";
  }

  const datasetRows = datasets.map((d) => ({
    id: d.id,
    name: d.name,
    exampleCount: d.exampleCount,
    exportedAt: d.exportedAt?.toISOString() ?? null,
  }));

  const initialJob = activeJob
    ? {
        id: activeJob.id,
        datasetId: activeJob.datasetId,
        baseModel: activeJob.baseModel,
        status: activeJob.status,
        adapterPath: activeJob.adapterPath,
        modelTag: activeJob.modelTag,
        startedAt: activeJob.startedAt?.toISOString() ?? null,
        completedAt: activeJob.completedAt?.toISOString() ?? null,
        createdAt: activeJob.createdAt.toISOString(),
        datasetName: activeJob.dataset.name,
      }
    : null;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Training jobs</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Start an Unsloth QLoRA job from an exported dataset and watch status and logs.
        </p>
      </div>
      {dbError ? <p className="text-sm text-destructive">{dbError}</p> : null}
      {!dbError ? (
        <TrainingJobsPanel datasets={datasetRows} initialJob={initialJob} />
      ) : null}
    </section>
  );
}
