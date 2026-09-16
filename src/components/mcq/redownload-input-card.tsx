"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MultiFileList, type MultiFileItem } from "@/components/mcq/multi-file-list";
import { FileOutput } from "lucide-react";

export interface RedownloadInputCardProps {
  loading: boolean;
  items: MultiFileItem[];
  onReorder: (from: number, to: number) => void;
  onRemove: (id: string) => void;
}

export function RedownloadInputCard({ loading, items, onReorder, onRemove }: RedownloadInputCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-950/50 dark:text-brand-400">
            <FileOutput className="h-5 w-5" />
          </span>
          <div>
            <CardTitle className="text-base md:text-lg">Files loaded — MCQ Redownload</CardTitle>
            <CardDescription>
              Files are already loaded. Use the "Add files" button in the top bar to add more.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length > 0 ? (
          <MultiFileList items={items} onReorder={onReorder} onRemove={onRemove} disabled={loading} />
        ) : (
          <p className="rounded-lg border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            No files loaded yet — use the "Add files" button in the top bar to add .docx files.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
