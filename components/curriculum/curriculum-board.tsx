"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CascadeSelect, type CascadeFields } from "@/components/curriculum/cascade-select";

export type CurriculumChapter = {
  id: string;
  name: string;
  order: number;
  subjectId: string;
  createdAt: string;
};

export type CurriculumSubject = {
  id: string;
  name: string;
  classId: string;
  createdAt: string;
  chapters: CurriculumChapter[];
};

export type CurriculumClass = {
  id: string;
  name: string;
  createdAt: string;
  subjects: CurriculumSubject[];
};

const classFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

const subjectFormSchema = z.object({
  classId: z.string().min(1, "Class is required"),
  subjectId: z.string().optional(),
  chapterId: z.string().optional(),
  name: z.string().trim().min(1, "Name is required"),
});

const chapterFormSchema = z.object({
  classId: z.string().min(1, "Class is required"),
  subjectId: z.string().min(1, "Subject is required"),
  chapterId: z.string().optional(),
  name: z.string().trim().min(1, "Name is required"),
  order: z.string().optional(),
});

const editFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  order: z.string().optional(),
});

type ClassFormValues = z.infer<typeof classFormSchema>;
type SubjectFormValues = z.infer<typeof subjectFormSchema>;
type ChapterFormValues = z.infer<typeof chapterFormSchema>;
type EditFormValues = z.infer<typeof editFormSchema>;

type EntityKind = "class" | "subject" | "chapter";

type DescendantCounts = {
  subjects: number;
  chapters: number;
  topics: number;
  trainingExamples: number;
};

const ENTITY_ENDPOINT: Record<EntityKind, string> = {
  class: "/api/curriculum/classes",
  subject: "/api/curriculum/subjects",
  chapter: "/api/curriculum/chapters",
};

async function readError(response: Response) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "Request failed";
}

function describeCascade(counts: DescendantCounts): string {
  const parts = [
    counts.subjects > 0 ? `${counts.subjects} subject${counts.subjects === 1 ? "" : "s"}` : null,
    counts.chapters > 0 ? `${counts.chapters} chapter${counts.chapters === 1 ? "" : "s"}` : null,
    counts.topics > 0 ? `${counts.topics} topic${counts.topics === 1 ? "" : "s"}` : null,
    counts.trainingExamples > 0
      ? `${counts.trainingExamples} training example${counts.trainingExamples === 1 ? "" : "s"}`
      : null,
  ].filter((part): part is string => part !== null);

  if (parts.length === 0) {
    return "Nothing else depends on this record.";
  }
  return `This also permanently removes ${parts.join(", ")}, including their chunks and embeddings.`;
}

export function CurriculumBoard({ initialClasses }: { initialClasses: CurriculumClass[] }) {
  const router = useRouter();
  const [reloadToken, setReloadToken] = useState(0);
  const filterForm = useForm<CascadeFields>({
    defaultValues: { classId: "", subjectId: "", chapterId: "" },
  });
  const classId = useWatch({ control: filterForm.control, name: "classId" }) || "";
  const subjectId = useWatch({ control: filterForm.control, name: "subjectId" }) || "";

  const subjects = useMemo(() => {
    const source = classId
      ? initialClasses.filter((item) => item.id === classId)
      : initialClasses;
    return source.flatMap((item) => item.subjects.map((subject) => ({ ...subject, className: item.name })));
  }, [classId, initialClasses]);

  const chapters = useMemo(() => {
    return subjects
      .filter((subject) => (subjectId ? subject.id === subjectId : true))
      .flatMap((subject) =>
        subject.chapters.map((chapter) => ({
          ...chapter,
          subjectName: subject.name,
          className: subject.className,
        })),
      );
  }, [subjectId, subjects]);

  function refresh() {
    setReloadToken((value) => value + 1);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Filters</CardTitle>
            <CardDescription className="mt-1">
              Selecting a class loads subjects; selecting a subject loads chapters.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => filterForm.reset({ classId: "", subjectId: "", chapterId: "" })}
          >
            Clear
          </Button>
        </CardHeader>
        <CardContent>
          <Form {...filterForm}>
            <CascadeSelect reloadToken={reloadToken} />
          </Form>
        </CardContent>
      </Card>

      <EntityCard
        title="Classes"
        description="Top-level curriculum groups."
        action={<AddClassDialog onCreated={refresh} />}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Subjects</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialClasses.length === 0 ? (
              <EmptyRow columns={4} label="No classes yet." />
            ) : (
              initialClasses.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.subjects.length}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(item.createdAt)}</TableCell>
                  <TableCell>
                    <RowActions kind="class" id={item.id} name={item.name} onDone={refresh} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </EntityCard>

      <EntityCard
        title="Subjects"
        description={classId ? "Filtered by the selected class." : "All subjects. Pick a class above to filter."}
        action={
          <AddSubjectDialog onCreated={refresh} reloadToken={reloadToken} defaultClassId={classId} />
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Chapters</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subjects.length === 0 ? (
              <EmptyRow columns={5} label="No subjects yet." />
            ) : (
              subjects.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.className}</TableCell>
                  <TableCell>{item.chapters.length}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(item.createdAt)}</TableCell>
                  <TableCell>
                    <RowActions kind="subject" id={item.id} name={item.name} onDone={refresh} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </EntityCard>

      <EntityCard
        title="Chapters"
        description={subjectId ? "Filtered by the selected subject." : "All chapters. Pick a subject above to filter."}
        action={
          <AddChapterDialog
            onCreated={refresh}
            reloadToken={reloadToken}
            defaultClassId={classId}
            defaultSubjectId={subjectId}
          />
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Class</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {chapters.length === 0 ? (
              <EmptyRow columns={5} label="No chapters yet." />
            ) : (
              chapters.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.order}</TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.subjectName}</TableCell>
                  <TableCell>{item.className}</TableCell>
                  <TableCell>
                    <RowActions
                      kind="chapter"
                      id={item.id}
                      name={item.name}
                      order={item.order}
                      onDone={refresh}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </EntityCard>
    </div>
  );
}

function EntityCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyRow({ columns, label }: { columns: number; label: string }) {
  return (
    <TableRow>
      <TableCell colSpan={columns} className="h-16 text-center text-muted-foreground">
        {label}
      </TableCell>
    </TableRow>
  );
}

function AddClassDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ClassFormValues>({
    resolver: zodResolver(classFormSchema),
    defaultValues: { name: "" },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      form.reset({ name: "" });
      setError(null);
    }
  }

  async function onSubmit(values: ClassFormValues) {
    setError(null);
    const response = await fetch("/api/curriculum/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    form.reset();
    setOpen(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">Add class</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add class</DialogTitle>
          <DialogDescription>Create a class such as Class 6.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Class 6" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AddSubjectDialog({
  onCreated,
  reloadToken,
  defaultClassId,
}: {
  onCreated: () => void;
  reloadToken: number;
  defaultClassId: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<SubjectFormValues>({
    resolver: zodResolver(subjectFormSchema),
    defaultValues: { classId: defaultClassId, subjectId: "", chapterId: "", name: "" },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      form.reset({ classId: defaultClassId, subjectId: "", chapterId: "", name: "" });
      setError(null);
    }
  }

  async function onSubmit(values: SubjectFormValues) {
    setError(null);
    const response = await fetch("/api/curriculum/subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classId: values.classId, name: values.name }),
    });
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    form.reset();
    setOpen(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">Add subject</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add subject</DialogTitle>
          <DialogDescription>Subjects belong to one class.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <CascadeSelect showSubject={false} showChapter={false} reloadToken={reloadToken} />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Science" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AddChapterDialog({
  onCreated,
  reloadToken,
  defaultClassId,
  defaultSubjectId,
}: {
  onCreated: () => void;
  reloadToken: number;
  defaultClassId: string;
  defaultSubjectId: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ChapterFormValues>({
    resolver: zodResolver(chapterFormSchema),
    defaultValues: {
      classId: defaultClassId,
      subjectId: defaultSubjectId,
      chapterId: "",
      name: "",
      order: "",
    },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      form.reset({
        classId: defaultClassId,
        subjectId: defaultSubjectId,
        chapterId: "",
        name: "",
        order: "",
      });
      setError(null);
    }
  }

  async function onSubmit(values: ChapterFormValues) {
    setError(null);
    const order = values.order?.trim() ? Number(values.order) : undefined;
    if (order !== undefined && (!Number.isInteger(order) || order < 0)) {
      setError("Order must be a non-negative integer.");
      return;
    }
    const response = await fetch("/api/curriculum/chapters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectId: values.subjectId,
        name: values.name,
        ...(order === undefined ? {} : { order }),
      }),
    });
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    form.reset();
    setOpen(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">Add chapter</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add chapter</DialogTitle>
          <DialogDescription>Chapters are ordered within a subject. Leave order blank to append.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <CascadeSelect showChapter={false} reloadToken={reloadToken} />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Pollination" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="order"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Order</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} placeholder="Auto" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function RowActions({
  kind,
  id,
  name,
  order,
  onDone,
}: {
  kind: EntityKind;
  id: string;
  name: string;
  order?: number;
  onDone: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <EditEntityDialog kind={kind} id={id} name={name} order={order} onSaved={onDone} />
      <DeleteEntityDialog kind={kind} id={id} name={name} onDeleted={onDone} />
    </div>
  );
}

function EditEntityDialog({
  kind,
  id,
  name,
  order,
  onSaved,
}: {
  kind: EntityKind;
  id: string;
  name: string;
  order?: number;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: { name, order: order === undefined ? "" : String(order) },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      form.reset({ name, order: order === undefined ? "" : String(order) });
      setError(null);
    }
  }

  async function onSubmit(values: EditFormValues) {
    setError(null);

    const payload: Record<string, unknown> = { name: values.name };
    if (kind === "chapter" && values.order?.trim()) {
      const parsedOrder = Number(values.order);
      if (!Number.isInteger(parsedOrder) || parsedOrder < 0) {
        setError("Order must be a non-negative integer.");
        return;
      }
      payload.order = parsedOrder;
    }

    const response = await fetch(`${ENTITY_ENDPOINT[kind]}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    setOpen(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {kind}</DialogTitle>
          <DialogDescription>Rename this {kind} without affecting its children.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {kind === "chapter" ? (
              <FormField
                control={form.control}
                name="order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteEntityDialog({
  kind,
  id,
  name,
  onDeleted,
}: {
  kind: EntityKind;
  id: string;
  name: string;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<DescendantCounts | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;

    setCounts(null);
    setError(null);
    const response = await fetch(`${ENTITY_ENDPOINT[kind]}/${id}`);
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    setCounts((await response.json()) as DescendantCounts);
  }

  async function handleDelete() {
    setPending(true);
    setError(null);
    const response = await fetch(`${ENTITY_ENDPOINT[kind]}/${id}`, { method: "DELETE" });
    setPending(false);
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    setOpen(false);
    onDeleted();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="text-destructive">
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {name}?</DialogTitle>
          <DialogDescription>
            {counts === null
              ? "Checking what depends on this record…"
              : describeCascade(counts)}
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending || counts === null}
            onClick={() => void handleDelete()}
          >
            {pending ? "Deleting…" : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}
