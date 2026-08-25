import { listCurriculumTree } from "@/lib/curriculum/service";
import { CurriculumBoard, type CurriculumClass } from "@/components/curriculum/curriculum-board";

export const dynamic = "force-dynamic";

export default async function CurriculumPage() {
  let classes: CurriculumClass[] = [];
  let dbError: string | null = null;

  try {
    const rows = await listCurriculumTree();
    classes = rows.map((item) => ({
      id: item.id,
      name: item.name,
      createdAt: item.createdAt.toISOString(),
      subjects: item.subjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        classId: subject.classId,
        createdAt: subject.createdAt.toISOString(),
        chapters: subject.chapters.map((chapter) => ({
          id: chapter.id,
          name: chapter.name,
          order: chapter.order,
          subjectId: chapter.subjectId,
          createdAt: chapter.createdAt.toISOString(),
        })),
      })),
    }));
  } catch {
    dbError =
      "Database is not available. Set DATABASE_URL in .env and run `pnpm prisma migrate deploy`.";
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Curriculum</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add and list Class → Subject → Chapter. Filters cascade from class to subject to chapter.
        </p>
      </div>
      {dbError ? <p className="text-sm text-destructive">{dbError}</p> : null}
      <CurriculumBoard initialClasses={classes} />
    </section>
  );
}
