"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type TrainingExampleRow = {
  id: string;
  topicId: string;
  type: string;
  instruction: string;
  input: string;
  output: string;
  status: string;
  createdAt: string;
  topic: { id: string; name: string };
};

type ExampleReviewProps = {
  example: TrainingExampleRow;
  onUpdated: (example: TrainingExampleRow) => void;
};

type PendingAction = "save" | "approve" | "reject" | null;

const STATUS_BADGE: Record<string, string> = {
  generated: "bg-amber-100 text-amber-900 hover:bg-amber-100",
  approved: "border-transparent bg-emerald-600 text-white hover:bg-emerald-600",
  rejected: "bg-destructive text-destructive-foreground hover:bg-destructive",
};

async function patchExample(
  id: string,
  data: Partial<Pick<TrainingExampleRow, "instruction" | "input" | "output" | "status">>,
): Promise<TrainingExampleRow> {
  const res = await fetch(`/api/training/examples/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Update failed (${res.status})`);
  }
  return res.json() as Promise<TrainingExampleRow>;
}

export function ExampleReview({ example, onUpdated }: ExampleReviewProps) {
  const [instruction, setInstruction] = useState(example.instruction);
  const [input, setInput] = useState(example.input);
  const [output, setOutput] = useState(example.output);
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    instruction !== example.instruction ||
    input !== example.input ||
    output !== example.output;

  async function run(action: PendingAction, status?: string) {
    setPending(action);
    setError(null);
    try {
      const updated = await patchExample(example.id, {
        instruction,
        input,
        output,
        ...(status ? { status } : {}),
      });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-3">
        <div className="space-y-1">
          <CardTitle className="text-base font-medium">{example.topic.name}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {new Date(example.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {example.type.replace("_", " ")}
          </Badge>
          <Badge className={cn("capitalize", STATUS_BADGE[example.status] ?? "")}>
            {example.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`instruction-${example.id}`}>Instruction</Label>
          <Textarea
            id={`instruction-${example.id}`}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`input-${example.id}`}>Input</Label>
          <Textarea
            id={`input-${example.id}`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={4}
            placeholder="(empty when not needed)"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`output-${example.id}`}>Output</Label>
          <Textarea
            id={`output-${example.id}`}
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            rows={6}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!dirty || pending !== null}
            onClick={() => run("save")}
          >
            {pending === "save" ? "Saving…" : "Save changes"}
          </Button>
          <Button
            type="button"
            disabled={pending !== null || example.status === "approved"}
            onClick={() => run("approve", "approved")}
          >
            {pending === "approve" ? "Approving…" : "Approve"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending !== null || example.status === "rejected"}
            onClick={() => run("reject", "rejected")}
          >
            {pending === "reject" ? "Rejecting…" : "Reject"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
