import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const TOPIC_STATUSES = ["draft", "chunked", "embedding", "embedded", "failed"] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

const STATUS_BADGE: Record<
  TopicStatus,
  { variant: NonNullable<BadgeProps["variant"]>; className?: string }
> = {
  draft: { variant: "outline" },
  chunked: { variant: "secondary" },
  embedding: { variant: "default" },
  embedded: {
    variant: "default",
    className: "border-transparent bg-emerald-600 text-white hover:bg-emerald-600",
  },
  failed: { variant: "destructive" },
};

export function TopicStatusBadge({ status }: { status: string }) {
  const known = (TOPIC_STATUSES as readonly string[]).includes(status);
  const key: TopicStatus = known ? (status as TopicStatus) : "draft";
  const config = STATUS_BADGE[key];

  return (
    <Badge variant={config.variant} className={cn("capitalize", config.className)}>
      {status}
    </Badge>
  );
}
