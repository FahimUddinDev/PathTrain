"use client";

import { useEffect, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { cn } from "@/lib/utils";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type CascadeFields = {
  classId: string;
  subjectId: string;
  chapterId: string;
};

type Option = {
  id: string;
  name: string;
};

type CascadeSelectProps = {
  showSubject?: boolean;
  showChapter?: boolean;
  disabled?: boolean;
  reloadToken?: number;
};

export function CascadeSelect({
  showSubject = true,
  showChapter = true,
  disabled,
  reloadToken = 0,
}: CascadeSelectProps) {
  const { control, setValue } = useFormContext();
  const classId = String(useWatch({ control, name: "classId" }) ?? "");
  const subjectId = String(useWatch({ control, name: "subjectId" }) ?? "");

  const [classes, setClasses] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [chapters, setChapters] = useState<Option[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingChapters, setLoadingChapters] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingClasses(true);
    fetchOptions("/api/curriculum/classes", controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setClasses(data);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingClasses(false);
      });
    return () => controller.abort();
  }, [reloadToken]);

  useEffect(() => {
    if (!showSubject || !classId) {
      setSubjects([]);
      setChapters([]);
      setLoadingSubjects(false);
      setLoadingChapters(false);
      return;
    }

    const controller = new AbortController();
    setLoadingSubjects(true);
    setChapters([]);
    fetchOptions(`/api/curriculum/subjects?classId=${encodeURIComponent(classId)}`, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setSubjects(data);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSubjects(false);
      });
    return () => controller.abort();
  }, [classId, reloadToken, showSubject]);

  useEffect(() => {
    if (!showChapter || !subjectId) {
      setChapters([]);
      setLoadingChapters(false);
      return;
    }

    const controller = new AbortController();
    setLoadingChapters(true);
    fetchOptions(`/api/curriculum/chapters?subjectId=${encodeURIComponent(subjectId)}`, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setChapters(data);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingChapters(false);
      });
    return () => controller.abort();
  }, [showChapter, subjectId, reloadToken]);

  return (
    <div
      className={cn(
        "grid gap-4",
        showChapter ? "sm:grid-cols-3" : showSubject ? "sm:grid-cols-2" : "sm:grid-cols-1",
      )}
    >
      <CascadeField
        name="classId"
        label="Class"
        placeholder={loadingClasses ? "Loading…" : "Select class"}
        disabled={disabled || loadingClasses}
        options={classes}
        onValueChange={() => {
          setValue("subjectId", "", { shouldDirty: true });
          setValue("chapterId", "", { shouldDirty: true });
        }}
      />

      {showSubject ? (
        <CascadeField
          name="subjectId"
          label="Subject"
          placeholder={subjectPlaceholder(classId, loadingSubjects, subjects.length)}
          disabled={disabled || !classId || loadingSubjects}
          options={subjects}
          onValueChange={() => {
            setValue("chapterId", "", { shouldDirty: true });
          }}
        />
      ) : null}

      {showChapter ? (
        <CascadeField
          name="chapterId"
          label="Chapter"
          placeholder={chapterPlaceholder(subjectId, loadingChapters, chapters.length)}
          disabled={disabled || !subjectId || loadingChapters}
          options={chapters}
        />
      ) : null}
    </div>
  );
}

function CascadeField({
  name,
  label,
  placeholder,
  disabled,
  options,
  onValueChange,
}: {
  name: "classId" | "subjectId" | "chapterId";
  label: string;
  placeholder: string;
  disabled?: boolean;
  options: Option[];
  onValueChange?: (value: string) => void;
}) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select
            disabled={disabled}
            value={field.value || undefined}
            onValueChange={(value) => {
              field.onChange(value);
              onValueChange?.(value);
            }}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function subjectPlaceholder(classId: string, loading: boolean, count: number) {
  if (!classId) return "Select a class first";
  if (loading) return "Loading…";
  if (count === 0) return "No subjects in this class";
  return "Select subject";
}

function chapterPlaceholder(subjectId: string, loading: boolean, count: number) {
  if (!subjectId) return "Select a subject first";
  if (loading) return "Loading…";
  if (count === 0) return "No chapters in this subject";
  return "Select chapter";
}

async function fetchOptions(url: string, signal: AbortSignal): Promise<Option[]> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return [];
    const data: unknown = await response.json();
    if (!Array.isArray(data)) return [];
    return data.flatMap((item) => {
      if (
        item &&
        typeof item === "object" &&
        "id" in item &&
        "name" in item &&
        typeof item.id === "string" &&
        typeof item.name === "string"
      ) {
        return [{ id: item.id, name: item.name }];
      }
      return [];
    });
  } catch (error) {
    if (signal.aborted) return [];
    console.error(error);
    return [];
  }
}
