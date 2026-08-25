import Link from "next/link";
import { TopicStatusBadge } from "@/components/topics/topic-status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type TopicListItem = {
  id: string;
  name: string;
  status: string;
  path: string;
  chunkCount: number;
};

export function TopicsTable({ topics }: { topics: TopicListItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Path</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Chunks</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {topics.map((topic) => (
          <TableRow key={topic.id} className="relative">
            <TableCell className="font-medium">
              <Link href={`/topics/${topic.id}`} className="after:absolute after:inset-0 hover:underline">
                {topic.name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{topic.path}</TableCell>
            <TableCell>
              <TopicStatusBadge status={topic.status} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{topic.chunkCount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
