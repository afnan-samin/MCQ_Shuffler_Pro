"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlignLeft,
  ArrowDownToLine,
  Check,
  ClipboardCopy,
  FileDown,
  Loader2,
  Printer,
  Settings2,
  Shuffle,
  Star,
} from "lucide-react";
import type { McqQuestion } from "@/lib/mcq/parser";
import { getSetName, type NameStyle } from "@/lib/mcq/set-engine";
import type { ExportOptions, FontMode } from "@/lib/mcq/exporter";

interface SetsResultProps {
  sets: McqQuestion[][];
  sortedFlags: boolean[];
  onToggleSort: (si: number) => void;
  onReshuffleSet: (si: number) => void;
  exportOpts: ExportOptions;
  onExportOptsChange: (o: ExportOptions) => void;
  onExportDocx: () => void;
  onExportDoc: () => void;
  onPrint: () => void;
  onCopySet: (si: number) => void;
  onCopyAll: () => void;
  busy: string | null;
  copiedSet: number | null;
}

const LEGACY_FONT_SUGGESTIONS = ["SutonnyMJ", "SutonnyOMJ", "SutonnyEMJ", "BijoyClassic", "SushreeMJ", "ShiblyMJ"];
const UNICODE_FONT_SUGGESTIONS = ["Nirmala UI", "SolaimanLipi", "Kalpurush", "Nikosh", "Shonar Bangla"];

export function SetsResult({
  sets,
  sortedFlags,
  onToggleSort,
  onReshuffleSet,
  exportOpts,
  onExportOptsChange,
  onExportDocx,
  onExportDoc,
  onPrint,
  onCopySet,
  onCopyAll,
  busy,
  copiedSet,
}: SetsResultProps) {
  const [showSettings, setShowSettings] = useState(false);
  const totalQ = sets.reduce((a, s) => a + s.length, 0);

  const patch = (p: Partial<ExportOptions>) => onExportOptsChange({ ...exportOpts, ...p });

  return (
    <Card id="step-result" className="border-emerald-300 dark:border-emerald-700">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">৪</span>
          <CardTitle className="text-lg md:text-xl">
            শাফল সম্পন্ন — {sets.length} টি সেট ({totalQ} প্রশ্ন)
          </CardTitle>
        </div>
        <CardDescription>
          প্রতিটি সেট আলাদা পেজে যাবে। যেকোনো সেট আবার সিরিয়ালে সাজাতে বা আবার শাফল করতে পারবেন।
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ফন্ট সেটিংস টগল */}
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setShowSettings((s) => !s)} className="gap-2">
            <Settings2 className="h-4 w-4" />
            {showSettings ? "ফন্ট/হেডার সেটিংস লুকান" : "⚙️ ফন্ট ও হেডার সেটিংস (Bijoy/Unicode)"}
          </Button>
        </div>

        {showSettings && (
          <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-sm">ফন্ট মোড</Label>
                <Select value={exportOpts.fontMode} onValueChange={(v) => patch({ fontMode: v as FontMode })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">অটো (মিক্সড ফাইলের জন্য)</SelectItem>
                    <SelectItem value="legacy">Bijoy / লিগ্যাসি ফন্ট</SelectItem>
                    <SelectItem value="unicode">Unicode বাংলা</SelectItem>
                    <SelectItem value="english">English (Times)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  অটো মোডে বাংলা Unicode লাইনে {exportOpts.unicodeFont}, বাকিতে {exportOpts.legacyFont} বসবে
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Bijoy ফন্টের নাম (Word-এ বসবে)</Label>
                <Input
                  list="legacy-fonts"
                  value={exportOpts.legacyFont}
                  onChange={(e) => patch({ legacyFont: e.target.value })}
                  className="h-9"
                />
                <datalist id="legacy-fonts">
                  {LEGACY_FONT_SUGGESTIONS.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
                <p className="text-[11px] text-muted-foreground">আপনার PC-তে যে Bijoy ফন্ট ইনস্টল আছে</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Unicode বাংলা ফন্ট</Label>
                <Input
                  list="unicode-fonts"
                  value={exportOpts.unicodeFont}
                  onChange={(e) => patch({ unicodeFont: e.target.value })}
                  className="h-9"
                />
                <datalist id="unicode-fonts">
                  {UNICODE_FONT_SUGGESTIONS.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-sm">ফন্ট সাইজ (pt)</Label>
                <Input
                  type="number"
                  min={8}
                  max={24}
                  value={exportOpts.fontSize}
                  onChange={(e) => patch({ fontSize: Math.max(8, Math.min(24, parseInt(e.target.value, 10) || 12)) })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">সেটের নামের স্টাইল</Label>
                <Select value={exportOpts.nameStyle} onValueChange={(v) => patch({ nameStyle: v as NameStyle })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="letter">সেট A, সেট B, সেট C...</SelectItem>
                    <SelectItem value="bangla">সেট ক, সেট খ, সেট গ...</SelectItem>
                    <SelectItem value="number">সেট ১, সেট ২, সেট ৩...</SelectItem>
                    <SelectItem value="setn">Set 1, Set 2, Set 3...</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <div className="flex items-center gap-2 pb-1.5">
                  <Switch id="include-header" checked={exportOpts.includeHeader} onCheckedChange={(v) => patch({ includeHeader: v })} />
                  <Label htmlFor="include-header" className="cursor-pointer text-sm">
                    প্রতি সেটের পেজে হেডার বসান
                  </Label>
                </div>
              </div>
            </div>

            {exportOpts.includeHeader && (
              <div className="space-y-1.5">
                <Label className="text-sm">হেডার টেক্সট (ইনস্টিটিউট নাম, সময়, পূর্ণমান ইত্যাদি — প্রতি পেজে উপরে বসবে)</Label>
                <Textarea
                  value={exportOpts.headerText}
                  onChange={(e) => patch({ headerText: e.target.value })}
                  placeholder={"যেমন:\nXYZ কলেজ, ঢাকা\nপরীক্ষা: বিষয় কোড ১০১\nসময়: ১ ঘণ্টা | পূর্ণমান: ৫০"}
                  className="min-h-[70px] text-sm"
                />
              </div>
            )}
          </div>
        )}

        {/* এক্সপোর্ট বার */}
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-center gap-2 rounded-xl border bg-white/95 p-3 shadow-sm backdrop-blur dark:bg-background/95">
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={onExportDocx} disabled={busy !== null}>
            {busy === "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            ⬇️ Word (.docx) — প্রতি সেট আলাদা পেজে
          </Button>
          <Button variant="outline" className="gap-2" onClick={onExportDoc} disabled={busy !== null}>
            {busy === "doc" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
            .doc (পুরনো Word)
          </Button>
          <Button variant="outline" className="gap-2" onClick={onPrint} disabled={busy !== null}>
            <Printer className="h-4 w-4" /> 🖨️ প্রিন্ট
          </Button>
          <Button variant="outline" className="gap-2" onClick={onCopyAll} disabled={busy !== null}>
            {busy === "copyall" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCopy className="h-4 w-4" />}
            📋 সব সেট কপি
          </Button>
        </div>

        {/* সেট কার্ডগুলো */}
        <div className="grid gap-4 lg:grid-cols-2">
          {sets.map((qs, si) => (
            <div key={si} className="rounded-xl border bg-white dark:bg-background">
              <div className="flex flex-wrap items-center gap-2 border-b bg-emerald-50/70 px-4 py-2.5 dark:bg-emerald-950/20">
                <span className="font-bold text-emerald-800 dark:text-emerald-300">{getSetName(si, exportOpts.nameStyle)}</span>
                <Badge variant="secondary" className="gap-1">
                  {qs.length} প্রশ্ন
                </Badge>
                {sortedFlags[si] ? (
                  <Badge className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                    <AlignLeft className="h-3 w-3" /> সিরিয়াল
                  </Badge>
                ) : (
                  <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100">
                    <Shuffle className="h-3 w-3" /> শাফলড
                  </Badge>
                )}
                <div className="ml-auto flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => onToggleSort(si)}
                    title={sortedFlags[si] ? "এই সেটটা আবার শাফল করুন" : "অরিজিনাল সিরিয়ালে ফিরিয়ে আনুন"}
                  >
                    {sortedFlags[si] ? <Shuffle className="h-3 w-3" /> : <AlignLeft className="h-3 w-3" />}
                    {sortedFlags[si] ? "শাফল" : "সিরিয়ালে সাজান"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => onCopySet(si)}
                    disabled={busy !== null}
                  >
                    {copiedSet === si ? <Check className="h-3 w-3 text-emerald-600" /> : <ClipboardCopy className="h-3 w-3" />}
                    {copiedSet === si ? "কপি হয়েছে" : "কপি"}
                  </Button>
                </div>
              </div>
              <div className="max-h-64 space-y-0.5 overflow-y-auto p-3 mcq-scroll">
                {qs.map((q) => (
                  <div key={q.id} className="flex items-start gap-2 text-[13px] leading-snug">
                    <span className="min-w-[2rem] shrink-0 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                      {q.originalNumber}.
                    </span>
                    <span className="text-foreground/90">{q.lines[0].replace(/^[\s০-৯0-9.।):–\-—]+/, "")}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-1.5 pt-2 text-xs text-muted-foreground">
          <Star className="h-3.5 w-3.5 text-amber-500" />
          টিপস: ডাউনলোড করা Word ফাইলে প্রতিটি সেট আলাদা পেজে থাকবে — সরাসরি প্রিন্ট করতে পারবেন।
        </div>
      </CardContent>
    </Card>
  );
}
