"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ListOrdered } from "lucide-react";
import { MultiFileList, type MultiFileItem } from "@/components/mcq/multi-file-list";

interface SerialInputCardProps {
  loading: boolean;
  items: MultiFileItem[];
  onReorder: (from: number, to: number) => void;
  onRemove: (id: string) => void;
}

/** সিরিয়াল মোডের ইনপুট কার্ড — শুধু ফাইল-লিস্ট (পেস্ট শুধু শুরুর Upload ধাপে) */
export function SerialInputCard({
  loading,
  items,
  onReorder,
  onRemove,
}: SerialInputCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ListOrdered className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base md:text-lg">MCQ Serial — upload files</CardTitle>
            <CardDescription className="truncate">
              Colored headers (Word: Home → Paragraph → Shading) are auto-detected — pick a color and every section gets numbered from 1
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Drag or use the arrow buttons to reorder — merge/ZIP keeps exactly this order. Use the “Add files” button in the top bar to add more files.
            </p>
            <MultiFileList items={items} onReorder={onReorder} onRemove={onRemove} disabled={loading} />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            No files loaded yet — use the “Add files” button in the top bar to add .docx files.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
