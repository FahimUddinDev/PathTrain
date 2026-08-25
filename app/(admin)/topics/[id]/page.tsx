export default function TopicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  void params;
  return (
    <section>
      <h1 className="text-2xl font-semibold">Topic</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Preview and edit chunks, then embed (Milestones 2–3).
      </p>
    </section>
  );
}
