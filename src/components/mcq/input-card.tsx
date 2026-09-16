"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search } from "lucide-react";

interface InputCardProps {
  rawText: string;
  onTextChange: (t: string) => void;
  onDetect: () => void;
  detecting: boolean;
}

export function InputCard({
  rawText,
  onTextChange,
  onDetect,
  detecting,
}: InputCardProps) {
  const lineCount = rawText ? rawText.split("\n").filter((l) => l.trim()).length : 0;

  return (
    <Card id="step-input">
      <CardHeader>
        <CardTitle className="text-lg md:text-xl">Add questions — paste your text</CardTitle>
        <CardDescription>
          Type or paste your MCQ text below and click Detect. To add more files later, use the "Add files" button in the top bar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={rawText}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={`Paste your questions here...

Example:
1. What is the capital of Bangladesh?
a) Chattogram  b) Dhaka  c) Khulna  d) Rajshahi

1. What is the capital of Japan?
a) Beijing  b) Tokyo  c) Seoul  d) Bangkok`}
          className="min-h-[220px] font-mono text-sm leading-relaxed"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={onDetect}
            disabled={detecting || !rawText.trim()}
            size="lg"
            className="gap-2 bg-brand-600 hover:bg-brand-700"
          >
            {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {detecting ? "Detecting..." : "Detect questions"}
          </Button>
          {rawText.trim() && (
            <Badge variant="secondary" className="gap-1">
              {lineCount} lines
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
