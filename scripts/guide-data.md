# MCQ Shuffler Pro — Card & Button → Code Map (edit-locator guide)

Project: client-side Next.js 16 app at `/home/z/my-project` (static export to GitHub Pages).
All line numbers verified against the current working tree. Every user-facing string below is quoted exactly from code.

---

# Part 1 — Site flow at a glance

The user journey:

1. **Upload card** (`UploadFirstCard`) — upload .docx (or .txt / paste text). Invalid .docx rejected here.
2. **Mode selection** — after staging files, exactly 3 mode buttons appear (`ModeTabs`).
3. **Work view per mode** — each mode has its own input → options → result → download cards.
4. **Download** — every download card has a "Download as" toggle (DOCX default / PDF) just above its buttons.

```
                        ┌──────────────────────────────────────────────┐
                        │  UploadFirstCard  "Upload a file first"      │
                        │  upload .docx | .txt | paste text            │
                        └───────────────┬──────────────────────────────┘
                                        │ stageFiles() validates zip
                        ┌───────────────▼──────────────────────────────┐
                        │  StagedFilesCard "📁 N files ready"          │
                        │  ModeTabs — 3 mode buttons:                  │
                        │   [🔀 MCQ Shuffle] [🔢 MCQ Serial] [📥 MCQ Redownload]
                        └───┬──────────────────┬───────────────┬───────┘
                            │                  │               │
              ┌─────────────▼─────┐  ┌─────────▼────────┐  ┌──▼──────────────────┐
              │ SHUFFLE MODE      │  │ SERIAL MODE      │  │ REDOWNLOAD MODE     │
              │ InputCard         │  │ SerialInputCard  │  │ RedownloadInputCard │
              │  (upload/paste)   │  │  (upload/paste)  │  │ RedownloadPartsCard │
              │ DetectCard        │  │ ColorSerialCard /│  │ RedownloadQuestions │
              │  (text) or        │  │ MultiSerialScheme│  │  Card               │
              │ DocxDetectCard    │  │ SerialPasteCard  │  │ FontSettingsCard    │
              │  (docx)           │  │ FontSettingsCard │  │ MultiDownloadCard   │
              │ ShuffleCard       │  │ MultiDownloadCard│  │  ("4. Download…")   │
              │ FontSettingsCard  │  └────────┬─────────┘  └──────────┬──────────┘
              │ SetsResult (text) │           │                       │
              │  or DocxSetsResult│           │                       │
              │  or MultiDownload │           │                       │
              └─────────┬─────────┘           │                       │
                        │   DownloadFormatToggle: [DOCX] [PDF] (on every download card)
                        ▼
             finalizeDownload(): DOCX → downloadBlob | PDF → docxBlobToPdfBlob → .pdf
```

Persistent top bar while working: `ModeWorkBar` (◀ back home • mode title • "N/M files" • **Add files**).
After any download card: `NextModesCard` ("✅ Keep working with these files") carries files to the other modes.

---

# Part 2 — THE MOTHERS (shared infrastructure — edit affects everywhere)

### `src/components/mcq/file-dropzone.tsx` (207 lines)
- **Export:** `FileDropzone({accept, multiple, disabled, busy, busyText, promptText, hintText, icon, variant: "lg"|"md"|"compact", ariaLabel, inputTestId, maxSizeBytes, maxFiles, onFiles, triggerRef, chips, children})` (line 75). Also `DropzoneTrigger` interface `{open: () => void}` (line 19, via `useImperativeHandle` line 97) and `DropzoneRejection {notAccepted, tooBig, overMax}` (line 23).
- **What it does:** the ONE drag-drop + click-to-browse upload surface. Filters by extension → size → count, reports rejects via `onFiles(files, rejected)`.
- **Consumers (5 components / 6 instances):** `upload-first-card.tsx` (line 110), `input-card.tsx` (116), `serial-input-card.tsx` (91 main + 146 "Add more files" children-slot), `redownload-input-card.tsx` (48, compact), `mode-work-bar.tsx` (66, children-slot "Add files" button).
- **Edit impact:** change prompts/limits look here ONCE; every upload surface changes. (Note: the file's own header comment says "4 surfaces" but it is actually used by 5 — `upload-first-card.tsx` uses it too.)

### `src/lib/mcq/file-pipeline.ts` (150 lines)
- **Exports:** `runFilePipeline<T>(files, {parse, maxBytes?}) → {items, failures, tooBig, notDocx}` (line 73) — the single loader all 3 modes use (size guard 50MB → extension guard → `loadDocxXml` → per-mode parse callback). `isValidDocxZip(file): Promise<boolean>` (line 33) — light JSZip check that `word/document.xml` exists, used at staging time. `FILE_TOO_BIG_MSG = "File is too large (50MB+ not supported)"` (line 24). `docxBaseName` (43), `prepareShuffleXml(originalXml) → {xml, colorAn, headersStripped, blocked, parse}` (125) — shuffle-mode prepper (strips color headers + non-MCQ lines, then parses).
- **Consumers:** page.tsx `stageFiles` (305), `handleDocxFile` (629), `handleShuffleFiles` (1360), `loadSerialFiles` (717), `loadRedownloadFiles` (1155).
- **Edit impact:** changing load/validation behavior touches every mode at once. Toast texts for too-big/not-docx live in page.tsx, not here.

### `src/lib/mcq/mode-meta.ts` (56 lines)
- **Exports:** `type McqMode = "shuffle" | "serial" | "redownload"` (line 7), `MODE_META: Record<McqMode, ModeMeta>` (line 25) — the single registry: `emoji` (🔀/🔢/📥), `title` ("MCQ Shuffle"/"MCQ Serial"/"MCQ Redownload"), `tabTitle`, `description`, `ariaLabel`, `Icon`. `MODE_IDS` (56) = render order.
- **Consumers:** `mode-tabs.tsx` (4), `next-modes-card.tsx` (5), `mode-work-bar.tsx` (7), page.tsx.
- **Edit impact:** rename a mode / change emoji here → all tabs, work-bar title and next-modes buttons update together. Do NOT rename the `id` strings ("shuffle" etc.) — they are stored in localStorage (`mcq-shuffler-mode`) and used as switch keys.

### `src/lib/mcq/repack-docx.ts` (81 lines)
- **Exports:** `repackDocx(source, parts, extra?, mimeType?) → Blob` (line 24) — copies every non-directory zip entry byte-identical, replaces only `parts`. `repackDocxRemapped(source, documentXml, fontSettings?, extraParts?, extra?, mimeType?)` (line 56) — same + optional font remap of `word/document.xml` and `word/styles.xml`; without `fontSettings`/with `enabled:false` it is byte-identical to `repackDocx`. `STYLES_XML_PATH = "word/styles.xml"` (16), `DOCX_MIME` (13).
- **Consumers:** `multi-docx.ts` (replaceDocumentXml, buildMergedDocxBlob), `docx-exporter.ts` (zipWithXml → both blob builders), `color-serial.ts` (buildColorSerialDocxBlob), `exporter.ts` (maybeRemapPackedDocx).
- **Edit impact:** THE core of "formatting kept exactly". Never edit casually — every docx output in every mode passes through it.

### `src/lib/mcq/font-remap.ts` (320 lines)
- **Exports:** `applyFontRemap({documentXml, stylesXml?}, settings, options?) → {documentXml, stylesXml?}` (line 308); `applyFontRemapXml(xml, settings, options?)` (245) — per-`<w:r>` font remap, idempotent, text/formatting untouched; `applyFontRemapStylesXml(stylesXml, settings)` (286) — only known legacy Bijoy font *values* (Sutonny*/Bijoy*/Shibly*) → `bijoyFont`; `classifyRunText(text, dominant?) → "bijoy"|"unicode-bengali"|"latin"` (108); `FontSettings` (53, alias of `FontRemapSettings` 41: `englishFont, bijoyFont, unicodeFont, enabled`); `FONT_CHOICES` (63) — `{english: [...5], bijoy: [...5], unicode: [...5]}` feeding the dropdowns; `DEFAULT_FONT_REMAP_SETTINGS` (55) = `{englishFont:"Times New Roman", bijoyFont:"SutonnyMJ", unicodeFont:"Noto Serif Bengali", enabled:true}`.
- **Consumers:** `repack-docx.ts` (the wiring), `exporter.ts` (remap of freshly packed docx), `font-settings-card.tsx` (choices/defaults), page.tsx (defaults + `sanitizeFontSettings` guard).
- **Edit impact:** add a font → add it to `FONT_CHOICES` (dropdown) and to page.tsx `sanitizeFontSettings` fallback logic stays automatic (it validates against FONT_CHOICES).

### `src/config/theme.ts` (292 lines) + `src/config/theme-css.ts` (106 lines) — THE one-place control for ALL site colors/fonts/popups/radius
- `theme.ts` exports `siteTheme: SiteTheme` (line 142): `fonts` (sans/serif/mono/bengali), `colors.light` + `colors.dark` (background, card, primary, muted, destructive, destructiveForeground, border, ring, … + `brand` scale 50–950, currently emerald), `radius` (one `base: "0.625rem"` knob, sm/md/lg/xl derived), `popup` (radius/shadow/shadowSm/borderWidth/borderStyle/backdropBlur).
- `theme-css.ts` exports `themeToCssVars(): string` (line 88) and `themeCss` (106) — turns the object into `:root { --st-* }` + `.dark { --st-* }` CSS. `src/app/layout.tsx` line 67 injects it as a `<style>` tag; `src/app/globals.css` re-points all shadcn/Tailwind tokens at those vars. **Edit theme.ts only; never edit theme-css.ts or the var chain.**
- **The 3 HOW-TO recipes from the file's bottom comment (lines 264–292):**
  - **(a) Change the site font everywhere:** edit `fonts.sans` — put a common font first, e.g. `sans: 'Verdana, "Noto Sans Bengali", sans-serif'`. For a web font: add it in `src/app/layout.tsx` via `next/font` with `variable: "--font-myfont"`, put `${inter.variable}` in the `<html>` className, then use `sans: 'var(--font-myfont), …'`. Keep a Bengali-capable font in the stack.
  - **(b) Change the brand color (the green):** edit `colors.light.brand` — start with `600` (buttons/solid fills) and `700` (hover), then tune 50–500 / 800–950. Every `bg-brand-600`, `text-brand-700`, `border-brand-300`… across the site updates. Adjust `colors.dark.brand` the same way for dark mode.
  - **(c) Change popup corners/shadow:** edit the `popup` object — `radius: "0px"` sharp / `"12px"` very round; `shadow` any CSS box-shadow. Toasts, select dropdowns (and future dialogs) all follow.

### `src/lib/mcq/pdf-export.ts` (238 lines)
- **Exports:** `type DownloadFormat = "docx" | "pdf"` (35); `PDF_MAX_PAGES = 300` (40) — memory guard, aborts with an English message; `pdfFileNameOf(name)` (50) — `.docx` → `.pdf`; `docxBlobToPdfBlob(docx, baseName): Promise<Blob>` (80) — 100% in-browser: docx-preview render → html2canvas-pro capture (scale 2 up to 100 pages, 1.5 up to 300) → jsPDF A4; canvases taller than A4 are sliced into one page per A4-height chunk (continuous docs paginate).
- **Consumers:** page.tsx `finalizeDownload` (376) and `finalizeZipEntries` (387) only.
- **Edit impact:** PDF quality/limits/behavior here; DOCX path never touches this file.

### One-liners: the other lib files (mother = shared, child = mode-specific helper)
| File (lines) | Role |
|---|---|
| `src/lib/mcq/exporter.ts` (372) | **Mother (text pipelines).** Builds fresh .docx with the `docx` npm lib for text-flow sets & serial-paste (`buildSetsDocxBlob` 202, + `maybeRemapPackedDocx` 192), `.doc` legacy HTML (`exportDocHtml` 299), `printSets` (306), clipboard helpers, `downloadBlob` (356), `DEFAULT_EXPORT_OPTIONS` (37). |
| `src/lib/mcq/multi-docx.ts` (587) | **Mother (multi-file).** `replaceDocumentXml` (268) swaps document.xml inside the original zip; `buildMergedDocxBlob` (414) merges docx files with page breaks (container-level font remap once); `buildMergedDocumentXml` (245); `buildZipBlob` (556); `offsetSerialPlan` (583). |
| `src/lib/mcq/docx-exporter.ts` (206) | **Child (shuffle mode, also serial-fix).** `buildShuffledXml` (90) — DOM-level XML surgery: clones question blocks into sets, page breaks, set headers, renumber, reference-tag handling; `buildShuffledDocxBlob` (170); `buildSerialFixedDocxBlob` (190); `englishSetName` (32). |
| `src/lib/mcq/docx-xml.ts` (696) | **Mother (docx engine).** `loadDocxXml` (537, JSZip → word/document.xml), `parseDocxXml` (426, questions/serial/options/answers/explanations), Bengali/Bijoy digit maps (`digitsToNumber` 35, `numberToDigits` 58), `renumberSerialPara` (645/668). Functional Bengali keywords inside — careful. |
| `src/lib/mcq/parser.ts` (243) | **Mother (text engine).** `parseMcq` (141), `analyzeSerial` (196), `autoFixNumbering` (223), `formatNumberByScript` (75) for paste/.txt flows. Contains the question-start regex (Bengali digits) — functional, edit carefully. |
| `src/lib/mcq/set-engine.ts` (132) | **Mother (shuffle sets).** `buildSets` (46; 4 distributions: interleaved/chunk/random/original), `getSetName` (93 — writes সেট A/ক/১ set names into output files), `shuffled` (17). |
| `src/lib/mcq/color-serial.ts` (733) | **Child (serial mode) but also used by shuffle prep.** `analyzeColorDocx` (231), `planSerialByColor` (472), `applyColorSerialXml` (648), `buildColorSerialDocxBlob` (720), `stripShadedParasXml` (315), `stripNonMcqLinesXml` (383). |
| `src/lib/mcq/redownload.ts` (793) | **Child (redownload mode).** `parseRedownloadXml` (259), `PART_LABELS` (49), `DEFAULT_PART_SELECTION` (59), `buildRedownloadXml` (511), `extractWatermark` (761). |
| `src/lib/mcq/reference.ts` (455) | **Child (shuffle).** Detects `[CU-A: 22-23]`-style source tags; `analyzeRefReport` (304), `buildRefEditedMap` (442) for keep/strip/endline modes. |
| `src/lib/mcq/encoding.ts` (211) | **Mother-ish (rendering).** Word-level Bijoy/Unicode/English classifier used by TokText preview + stats (`classifyWord` 61, `tokenizeWithContext` 100, `analyzeText` 150). |
| `src/lib/mcq/serial-paste.ts` (28) | **Child (serial paste).** `renumberQuestionsByPosition` (17) — renumbers pasted questions 1..N. |
| `src/lib/mcq/limits.ts` (30) | **Mother (limits).** `MAX_SERIAL_NUMBER = 9999` (18), `MAX_FILE_BYTES = 50_000_000` (24), `SHUFFLE_MAX_FILES = 50` (30). |

---

# Part 3 — Card-by-card reference (THE MAIN SECTION)

Alphabetical by file. "Mother" = shared / reused by multiple modes; "Child" = single-mode specific.

---

### `color-serial-card.tsx` — **ColorSerialCard**
- **UI name:** "Color-based serial (structured file)" (line 62)
- **File:** `src/components/mcq/color-serial-card.tsx` — 160 lines. Title 62; color chips 83–126; action button 153–156.
- **Mother/Child:** **Child** (serial mode, exactly 1 file with colors).
- **Where:** serial mode work view when `serialDocs.length === 1` and the file has colored headers (page.tsx 1796).
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| color chip `<name> · N sections` (per detected color) | `onClick={() => setSel({kind:"color", key})}` (local state) | selects that color's scheme | local `sel` state |
| `Continuous across the file` chip (120) | `setSel({kind:"continuous"})` | selects continuous scheme | local |
| `Download serial .docx (B1)` / `.pdf` — template `` `Download serial .${format === "pdf" ? "pdf" : "docx"}${selLabel ? ` (${selLabel})` : ""}` `` (155) | `onSerial(sel, selLabel)` → page `handleColorSerial` (786) | plans serial by color → applies to XML → downloads docx/pdf | `planSerialByColor` (color-serial 472) → `buildColorSerialDocxBlob` (720) → page `finalizeDownload` (376) |
| `DownloadFormatToggle` (151) | `onFormatChange` → `updateDownloadFormat` | DOCX/PDF choice | page.tsx 363 |

- **Testids/ids:** none. (Also exports `schemeLabelOf` (39) — used only inside this file today.)

---

### `detect-card.tsx` — **DetectCard**
- **UI name:** "Detection result & question selection" (line 98)
- **File:** `src/components/mcq/detect-card.tsx` — 327 lines. Title 98; serial status 185–243; selection toolbar 246–275; question list 278–323.
- **Mother/Child:** **Child** (shuffle mode, TEXT flow only — pasted text or .txt).
- **Where:** shuffle work view when text was parsed and no docx loaded (page.tsx 2004).
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| `Select all` (249) | `onSelectAll` → `selectAll` (page 1099) | selects every parsed question | page.tsx |
| `Deselect all` (252) | `onSelectNone` → `selectNone` (1104) | clears selection | page.tsx |
| `Select range` (271) | `applyRange` → `onSelectRange(from,to)` → `selectRange` (1106); inputs From/To accept Bengali or English digits via `digitsToNumber` | selects a position range | page.tsx |
| `🔧 Fix numbering automatically` (232, busy `Fixing...`) | `onAutoFix` → `handleAutoFix` (580) | renumbers pasted text 1..N and re-parses | `autoFixNumbering` (parser 223) |
| `Run as-is` Switch (237) | `onAllowBrokenChange` → `setAllowBroken` | allows shuffling with a broken serial | page.tsx state |
| checkbox per question | `onToggle` → `toggleQuestion` (599) | tick/untick question | page.tsx |
| `Show more (N remaining)` (320) | local `setVisible` | paginates list by 100 | local |

- **Testids/ids:** `id="step-detect"` on Card (94); Switch `id="allow-broken"` (235).

---

### `docx-detect-card.tsx` — **DocxDetectCard** (+ exported `SerialSpan`)
- **UI name:** "Detection result — {fileName}" (line 106)
- **File:** `src/components/mcq/docx-detect-card.tsx` — 385 lines. Title 106; encoding detector 142–197; serial status 213–290; toolbar 293–322; list 325–381.
- **Mother/Child:** **Child** (shuffle mode, single-docx flow). `SerialSpan` (38) is reused by `docx-sets-result.tsx`.
- **Where:** shuffle work view when one .docx is loaded (page.tsx 1945).
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| `Select all` (296) / `Deselect all` (299) | `onSelectAll` / `onSelectNone` → page 1099/1104 | selection helpers | page.tsx |
| `Select range` (318) | `applyRange` → `onSelectRange` → page `selectRange` (1106) | Bengali+English digit range | page.tsx |
| `🔧 Fix serial & download .docx (1..N)` (278, busy `Building...`) | `onSerialFix` → `handleDocxSerialFix` (1042) | downloads a serial-fixed copy (original order, 1..N) | `buildSerialFixedDocxBlob` (docx-exporter 190) |
| `Run as-is` Switch (283) | `onAllowBrokenChange` → `setAllowBroken` | needed when numbering restarts per section | page.tsx |
| per-question checkbox | `onToggle` → `toggleQuestion` | tick/untick | page.tsx |
| `Show more (N remaining)` (378) | local `setVisible` | paginates by 50 | local |

- **Testids/ids:** `id="step-detect"` (102); Switch `id="docx-allow-broken"` (281).

---

### `docx-sets-result.tsx` — **DocxSetsResult**
- **UI name:** "Shuffle complete — N set(s) (M questions)" (line 66)
- **File:** `src/components/mcq/docx-sets-result.tsx` — 172 lines. Title 66; renumber switch 75–87; export bar 95–104; set cards 107–155.
- **Mother/Child:** **Child** (shuffle mode, single-docx results).
- **Where:** shuffle work view after `handleDocxShuffle` (page.tsx 1984).
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| `Serial replace ON — 1, 2, 3… / OFF — original numbers` Switch `renumber-switch` (79/86) | `onRenumberChange` → `toggleSerialByClick` (page 712) | toggles renumbering for downloads AND badges | page.tsx |
| `⬇️ Word (.docx) — renumbered serials (1,2,3…)` / `⬇️ PDF (.pdf) — …` (98, template `{fmtLabel}` line 58) | `onDownload(true)` → `handleDocxDownload` (1013) | builds + downloads renumbered version | `buildShuffledDocxBlob` (docx-exporter 170) → `finalizeDownload` |
| `⬇️ Word (.docx) — original numbers` / PDF variant (102) | `onDownload(false)` → same handler | original serials version | same |
| `Copy` / `Copied` per set (127) | `onCopySet(si)` → `handleDocxCopySet` (1067) | copies that set's text | page.tsx |
| clicking a serial number (138–145) | `onRenumberChange(!renumber)` | toggles serial replace | page 712 |
| `DownloadFormatToggle` (91) | `updateDownloadFormat` | DOCX/PDF | page 363 |

- **Testids/ids:** `id="step-result"` (61); Switch `id="renumber-switch"` (86) + sr-only label (166).

---

### `download-format-toggle.tsx` — **DownloadFormatToggle**
- **UI name:** `Download as` + pills `DOCX` / `PDF` (lines 27/46/61)
- **File:** `src/components/mcq/download-format-toggle.tsx` — 71 lines.
- **Mother/Child:** **Mother** (rendered inside all 6 download cards).
- **Where:** DocxSetsResult (91), SetsResult (224), SerialPasteCard (139), ColorSerialCard (151), NoColorSerialCard (serial-extra-cards 96), MultiDownloadCard (104). State is lifted to page.tsx (`downloadFormat`, persisted in localStorage `mcq-download-format`).
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| `DOCX` pill (46) | `onChange("docx")` | DOCX default; buttons show "Word (.docx)" wording | page `updateDownloadFormat` (363) |
| `PDF` pill (61) | `onChange("pdf")` | PDF active; download buttons swap to ".pdf/PDF" labels; hint `PDF is rendered in your browser (best effort)` (66) appears | page 363; conversion in pdf-export.ts |

- **Testids/ids:** `data-testid="download-format"` (24), `format-docx` (35), `format-pdf` (50); `aria-pressed` on both pills.

---

### `file-dropzone.tsx` — **FileDropzone** — see Part 2 (Mother). No fixed labels; all text via props (`promptText`, `hintText`, `busyText`).
- **Testids/ids:** hidden `<input>` gets `data-testid={inputTestId}` (119) — currently `serial-file-input` (serial-input-card 100) and `mode-work-bar-input` (mode-work-bar 68).

---

### `font-settings-card.tsx` — **FontSettingsCard**
- **UI name:** "Fonts in the output file" (line 103); collapsed by default; description shows `Remap ON — Unicode → X, Bijoy → Y, English → Z` or `Remap is OFF — the output keeps the original fonts` (105–107)
- **File:** `src/components/mcq/font-settings-card.tsx` — 198 lines.
- **Mother/Child:** **Mother** (all 5 download views).
- **Where:** rendered exactly once per view just above the download area: redownload (page 1734), serial (1791), shuffle-multi (1910), shuffle single-docx (1980), text flow (2037).
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| header click / chevron button | `toggleOpen` (69) | expand/collapse; syncs draft to applied settings | local |
| `Remap fonts in the output file` Switch (140–149) | `patch({enabled})` | draft remap ON/OFF | committed by `onChange` |
| `English fonts` / `Bijoy-ANSI fonts` / `Unicode-Bengali fonts` selects (29/36/43; ids `font-english`/`font-bijoy`/`font-unicode`) | `patch({englishFont|bijoyFont|unicodeFont})` | choose from `FONT_CHOICES` | font-remap.ts 63 |
| `Use fonts` (182) | `confirm()` → `onChange(draft)` → page `updateFontSettings` (354) | commits + persists localStorage `mcq-font-settings`; shows flash `Applied — downloads will use these fonts` (190) | page.tsx 354 |
| `Reset` (186) | `reset()` → `onChange(DEFAULT_FONT_REMAP_SETTINGS)` | restores defaults | font-remap.ts 55 |

- **Testids/ids:** `data-testid="font-settings-card"` (93); `id="font-settings-content"` (127) + `aria-expanded`/`aria-controls` on trigger.

---

### `input-card.tsx` — **InputCard**
- **UI name:** "Add questions — upload a file or paste" (line 98)
- **File:** `src/components/mcq/input-card.tsx` — 179 lines.
- **Mother/Child:** **Child** (shuffle mode's inner input; shown always in the shuffle work view).
- **Where:** shuffle work view top (page.tsx 1849). Note: this card is NOT shown in serial/redownload modes (they have their own input cards).
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| Tab `Upload file` (108) / Tab `Paste` (111) | shadcn Tabs | switches input mode | local Tabs |
| Dropzone `Click to select a file or drag & drop` (122) | `onDropzoneFiles` → `handleFiles` → `onDocxFile` (single) / `onDocxFiles` = `handleShuffleFiles` (multi) / `onTextFileLoaded` = `loadAndDetect` | docx → shuffle pipeline; .txt → browser parse | page.tsx 629/1360/549 |
| `🔍 Detect questions (paste mode)` (167, busy `Detecting...`) | `onDetect` → `handleDetect` (568) | parses pasted text | `parseMcq` (parser 141) |
| badge `{lineCount} lines` (171) / `Detected ✓` (174) | — | info only | — |

- **Testids/ids:** `id="step-input"` (94).

---

### `mode-tabs.tsx` — **ModeTabs**
- **UI name:** the 3 mode buttons (no card title). Button text = `MODE_META[id].tabTitle`: `🔀 MCQ Shuffle`, `🔢 MCQ Serial`, `📥 MCQ Redownload` (from mode-meta.ts 25–53).
- **File:** `src/components/mcq/mode-tabs.tsx` — 64 lines.
- **Mother/Child:** **Mother** (registry-driven).
- **Where:** step 2 only — `flowStep === "select"` with staged input (page.tsx 1679). Hidden once inside a mode.
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| each mode button | `onChange(id)` → page `changeMode` (397) | persists mode to localStorage, carries staged files (`carryToMode` 469), sets `flowStep:"work"` | page.tsx |

- **Testids/ids:** `role="tablist"` + `role="tab"` with `aria-label` from `MODE_META.ariaLabel` ("Shuffle mode" etc.).

---

### `mode-work-bar.tsx` — **ModeWorkBar**
- **UI name:** thin work bar; center text `{meta.emoji} {meta.title}` (48) + hint `— press the arrow to go home` (49); right chip `N/M files` (61).
- **File:** `src/components/mcq/mode-work-bar.tsx` — 93 lines.
- **Mother/Child:** **Mother** (all 3 modes).
- **Where:** top of the work view for every mode (page.tsx 1684). `maxFiles` shown only in shuffle (SHUFFLE_MAX_FILES=50).
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| ◀ icon-only, `aria-label="Back — return home"` (41), title `Back home — loaded files are cleared for a fresh start` | `onBack` → `backToHome` (408) | wipes all mode state, returns to upload card | page.tsx |
| `Add files` (88) | opens its own hidden FileDropzone; `onFiles` → page `handleAddMoreFiles` (427) | appends files into the CURRENT mode | page.tsx dispatches to `loadSerialFiles`/`loadRedownloadFiles`/`handleShuffleFiles` |

- **Testids/ids:** `data-testid="mode-work-bar"` (33); hidden input `data-testid="mode-work-bar-input"` (68).

---

### `multi-download-card.tsx` — **MultiDownloadCard**
- **UI name:** dynamic `title` prop — used as: `4. Download — new file from picked parts` / `4. Download — picked parts of all files` (redownload, page 1737), `Serial all files together` (serial multi, 1824), `Shuffle complete — download now` (shuffle multi, 1915).
- **File:** `src/components/mcq/multi-download-card.tsx` — 165 lines.
- **Mother/Child:** **Mother** (3 consumers: shuffle-multi, serial-multi, redownload).
- **Where:** results area of all three multi/single-file download views.
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| `How should serials work in the merged file?` radio `Restart from 1 in each file` (83) / `One continuous serial — start to finish` (92) | `onSerialStrategyChange` → `setSerialStrategy` | per-file vs global serial (serial multi only, `showSerialChoice`) | page.tsx 827 |
| `Download as one file (.docx)` / `Download (.docx)` when single / `.pdf` variants (126) | `onDownloadMerged` | merged single docx/pdf | page: `handleMultiMergedDownload` (1496) / `handleSerialMultiMerged` (827) / `handleRdMerged` (1265) |
| `Download separately (.zip)` (155, hidden when `fileCount===1`) | `onDownloadZip` | ZIP of per-file outputs | page: `handleMultiZipDownload` (1527) / `handleSerialMultiZip` (859) / `handleRdZip` (1291) |
| `DownloadFormatToggle` (104) | `updateDownloadFormat` | DOCX/PDF | page 363 |

- **Testids/ids:** radios `id="mf-serial-per-file"` / `id="mf-serial-global"` (81/90). ZIP names decided in page.tsx: `MCQ-shuffled-files.zip`, `MCQ-serial-files.zip`, `MCQ-Redownload.zip`.

---

### `multi-file-list.tsx` — **MultiFileList**
- **UI name:** file order list (no card; rows with badges `N questions` / `Ready`).
- **File:** `src/components/mcq/multi-file-list.tsx` — 154 lines.
- **Mother/Child:** **Mother** (3 consumers).
- **Where:** inside SerialInputCard (143), RedownloadInputCard (63), and the shuffle-multi files Card rendered inline by page.tsx (1874).
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| `aria-label="Move up"` (121) / `"Move down"` (132) | `onReorder(i, i∓1)` | reorders files (mobile-friendly) | page: `reorderSerialDocs` (767) / `reorderRdDocs` (1202) / `reorderShuffleItems` (1452) |
| `aria-label="Remove from list"` (143) | `onRemove(id)` | removes file | page: `removeSerialDoc` (776) / `removeRdDoc` (1211) / `removeShuffleItem` (1464) |
| whole row draggable | `onReorder(from, to)` | drag-drop reorder | same |

- **Testids/ids:** none (aria-labels are the E2E anchors).

---

### `next-modes-card.tsx` — **NextModesCard**
- **UI name:** "✅ Keep working with these files" (line 27); button labels = other modes' `tabTitle` (same as ModeTabs).
- **File:** `src/components/mcq/next-modes-card.tsx` — 58 lines.
- **Mother/Child:** **Mother**.
- **Where:** under every mode's download card (page 1753, 1838/1844, 1929, 2000, 2063); renders `null` when `filesCount === 0` (text flow).
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| other-mode buttons | `onOpen(m)` → page `changeMode` (397) | carries the current mode's files into the other mode, no re-upload | `carryToMode` (469) |

- **Testids/ids:** none.

---

### `redownload-input-card.tsx` — **RedownloadInputCard**
- **UI name:** "1. Upload files — MCQ Redownload" (line 40)
- **File:** `src/components/mcq/redownload-input-card.tsx` — 67 lines.
- **Mother/Child:** **Child** (redownload mode).
- **Where:** redownload work view (page.tsx 1694).
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| compact dropzone `Click to select a file or drag & drop` (55, `aria-label` 57) | `pick` → `onFiles(files, append)` → page `loadRedownloadFiles` (1155) | loads/parses docx; toasts for too-big and non-docx | `runFilePipeline` + `parseRedownloadXml` + `extractWatermark` |

- **Testids/ids:** none.

---

### `redownload-parts-card.tsx` — **RedownloadPartsCard**
- **UI name:** "2. Pick parts — what goes into the new file" (line 53)
- **File:** `src/components/mcq/redownload-parts-card.tsx` — 118 lines.
- **Mother/Child:** **Child** (redownload).
- **Where:** redownload work view after files load (page.tsx 1709).
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| 6 part checkboxes — labels from `PART_LABELS` (redownload.ts 49): Serial / Question / Reference / Options / Answer / Explanation | `onChange(kind, v)` → `setRdParts` (page 1712) | picks what goes into the new file | `buildRedownloadXml` (redownload 511) at download time |
| `Renumber serials 1, 2, 3…` Switch (96) | `onRenumberChange` → `setRdRenumber` | 1..N vs original numbers | page.tsx |
| hint `Answer expansion on:` (110) | auto (`!sel.options && sel.answer`) | explains answer expansion | display only |

- **Testids/ids:** checkboxes carry `aria-label={PART_LABELS[k]}` (74).

---

### `redownload-questions-card.tsx` — **RedownloadQuestionsCard**
- **UI name:** "3. Pick questions — {fileName}" (line 77) — one card per loaded file.
- **File:** `src/components/mcq/redownload-questions-card.tsx` — 219 lines.
- **Mother/Child:** **Child** (redownload).
- **Where:** redownload work view (page.tsx 1719); shows a diagonal watermark overlay when the source docx has one (119–134).
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| `Select all` (87) / `Deselect all` (90) | `onSelectAll`/`onSelectNone` → page `selectAllRd` (1231)/`selectNoneRd` (1237) | per-file selection | page.tsx |
| `Select range` (108) | `applyRange` → `selectRangeRd` (1241) | Bengali/English digit range | page.tsx |
| per-question checkbox | `onToggle` → `toggleRdQuestion` (1222) | tick/untick | page.tsx |
| `Show more (N remaining)` (211) | local `setVisible` | paginates by 50 | local |

- **Testids/ids:** `id="step-rd-questions"` (75).

---

### `serial-extra-cards.tsx` — **4 exported cards**
- **File:** `src/components/mcq/serial-extra-cards.tsx` — 331 lines.
- **Mother/Child:** all **Child** cards (single-purpose).
1. **ColorShuffleInfoCard** (lines 14–60) — UI name "This file has colored headers — they'll be stripped for shuffling" (34). Where: shuffle single-docx flow when the file has colors (page 1934). Button: `Prefer color-based serials? Open in Serial mode` (55) → `onOpenSerial` → page `openInSerialMode` (961) — moves the file into serial mode.
2. **NoColorSerialCard** (62–112) — UI name "No colored headers found in this file" (82). Where: serial mode, exactly 1 file, no colors (page 1805). Controls: `DownloadFormatToggle` (96); button `` `Download continuous 1..N serial .docx/.pdf` `` (100) → `onContinuous` → page `handleColorSerial({kind:"continuous"}, "continuous")` (786). When questionCount is 0 shows help text only.
3. **BlockedLinesCard** (123–201) — UI name "Stripped lines — N (not going into the shuffle)" (143). Where: shuffle mode when any file had headers/non-MCQ lines stripped (page 1889, 1942). Controls: `Show N more lines` / `Show less` (193/189) — local expand.
4. **MultiSerialSchemeCard** (211–331) — UI name "Per-file serial scheme" (247). Where: serial mode with ≥2 files (page 1818). Controls: per-file `Continuous` chip (285) and one chip per color (`colorKeyName`) → `onSchemeChange(id, scheme)` → page `setSerialSchemes` (1821).

- **Testids/ids:** none.

---

### `serial-input-card.tsx` — **SerialInputCard**
- **UI name:** "MCQ Serial — upload files" (line 71)
- **File:** `src/components/mcq/serial-input-card.tsx` — 176 lines.
- **Mother/Child:** **Child** (serial mode).
- **Where:** serial work view top (page.tsx 1759).
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| Tabs `Upload file` (83) / `Paste` (86) | shadcn Tabs | switches input mode | local |
| dropzone `Click to select .docx files or drag & drop` (97) | `acceptFiles(..., false)` → `onFiles` → page `loadSerialFiles(fs, false)` (717) | loads + color-analyzes docx | `analyzeColorDocx` (color-serial 231) |
| `🔍 Detect questions` (128, busy `Detecting...`) | `onPasteDetect` → page `handleSerialPasteDetect` (886) | parses pasted text; clears file list | `parseMcq` |
| hint `Drag or use the arrow buttons to reorder — merge/ZIP keeps exactly this order.` (141) | — | info | — |
| `Add more files` (161) | children-slot dropzone → `acceptFiles(..., true)` → `onAddFiles` → page `loadSerialFiles(fs, true)` | appends to list | page.tsx |
| `MultiFileList` (143) | `onReorder`/`onRemove` | order = output order | page 767/776 |

- **Testids/ids:** hidden main input `data-testid="serial-file-input"` (100).

---

### `serial-paste-card.tsx` — **SerialPasteCard**
- **UI name:** "Detection result (paste)" (line 51)
- **File:** `src/components/mcq/serial-paste-card.tsx` — 163 lines.
- **Mother/Child:** **Child** (serial paste flow).
- **Where:** serial work view only when files are absent and pasted text was detected (page 1778).
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| `🔧 Fix numbering automatically` (122, busy `Fixing...`) | `onFix` → page `handleSerialPasteFix` (917) | renumbers pasted text 1..N | `autoFixNumbering` |
| `Download serial .docx (1..N)` / `.pdf` variant (153) | `onDownload` → page `handleSerialPasteDownload` (935) | renumbers by position and exports one set | `renumberQuestionsByPosition` (serial-paste 17) → `buildSetsDocxBlob` (exporter 202) → `finalizeDownload` |
| `DownloadFormatToggle` (139) | `updateDownloadFormat` | DOCX/PDF | page 363 |

- **Testids/ids:** `id="serial-paste-result"` (47).

---

### `sets-result.tsx` — **SetsResult**
- **UI name:** "Shuffle complete — N set(s) (M questions)" (line 87)
- **File:** `src/components/mcq/sets-result.tsx` — 318 lines.
- **Mother/Child:** **Child** (shuffle TEXT flow results).
- **Where:** shuffle work view after a text-flow shuffle (page.tsx 2041).
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| `⚙️ Font & header settings (Bijoy/Unicode)` / `Hide font/header settings` (99) | local `setShowSettings` | opens export settings panel | local; options state in page (`exportOpts`) |
| `Font mode` select `Auto — font per word` / `Bijoy / legacy font` / `Unicode Bengali` / `English` (113–116) | `patch({fontMode})` | export font mode | `buildSetsDocxBlob` (exporter 202) |
| `Bijoy font (used in Word)` / `Unicode Bengali font` / `English font` inputs (125/141/156) + datalists | `patch({legacyFont|unicodeFont|englishFont})` | fonts written into the export | exporter.ts |
| `Font size (pt)` input (173) | `patch({fontSize})` | export font size | exporter.ts |
| `Set name style` select — `Bengali label — সেট A, সেট B, সেট C…` / `Bengali letters — সেট ক, সেট খ, সেট গ…` / `Bengali digits — সেট ১, সেট ২, সেট ৩…` / `English — Set 1, Set 2, Set 3…` (190–193) | `patch({nameStyle})` | set naming (samples are real output, written into files) | `getSetName` (set-engine 93) |
| `Put a header on each set's page` Switch (201) + `Header text…` textarea (209) | `patch({includeHeader, headerText})` | per-set page header | exporter.ts |
| `⬇️ Word (.docx) — one set per page` / `⬇️ PDF (.pdf) — one set per page` (231) | `onExportDocx` → page `handleExportDocx` (1574) | main export | `buildSetsDocxBlob` → `finalizeDownload` |
| `.doc (legacy Word)` (235) | `onExportDoc` → `handleExportDoc` (1590) | HTML-based .doc; DOCX/HTML-only — the PDF toggle does NOT affect it | `exportDocHtml` (exporter 299) |
| `🖨️ Print` (238) | `onPrint` → `handlePrint` (1602) | opens print window | `printSets` (exporter 306) |
| `📋 Copy all sets` (242) | `onCopyAll` → `handleCopyAll` (1623) | copies all sets as text | `allSetsClipboardText` (exporter 332) |
| per set: `Sort serial` / `Shuffle` (273) | `onToggleSort(si)` → `toggleSort` (1557) | re-sorts or reshuffles that set | page.tsx |
| per set: `Copy` / `Copied` (283) | `onCopySet(si)` → `handleCopySet` (1611) | copies that set | page.tsx |
| `DownloadFormatToggle` (224) | `updateDownloadFormat` | DOCX/PDF | page 363 |

- **Testids/ids:** `id="step-result"` (82); switch `id="include-header"` (199); datalists `legacy-fonts`/`unicode-fonts`/`english-fonts` (132/148/163). Set headers use `getSetName(si, nameStyle)` (251).

---

### `shuffle-card.tsx` — **ShuffleCard**
- **UI name:** "Shuffle settings & start" (line 60)
- **File:** `src/components/mcq/shuffle-card.tsx` — 242 lines.
- **Mother/Child:** **Mother** (all 3 shuffle sub-flows: text, single-docx, multi-file).
- **Where:** shuffle work view, below the detect/input cards (page 1892, 1962, 2019).
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| `How many sets?` number input (71/75) + quick chips `3` `4` `5` `10` (31/86–95) | `onSetCountChange` → `setSetCount` | set count 1–10 | page.tsx |
| `Split style` radios: `⭐ Original Shuffle — all questions in every set` (124), `Round-robin (interleaved)` (133), `Sequential blocks` (140), `Fully random split` (147) | `onDistributionChange` → `setDistribution` | distribution mode | `buildSets` (set-engine 46) |
| `Shuffle questions within each set` Switch (160; hidden for Original) | `onShuffleWithinChange` → `setShuffleWithin` | within-set order | buildSets |
| `Handle reference tags` radios `Keep as-is` / `Strip references — clean question paper` / `Move to a separate line after each question` (192/199/206) | `onRefModeChange` → `setRefMode` | reference-tag policy (shown only when tags detected) | `buildRefEditedMap` (reference 442) at export time |
| `🔀 Shuffle & build sets` (223, busy `Shuffling...`, locked icon when disabled) | `onShuffle` → page `handleShuffle` (1347) | builds the sets | `handleTextShuffle` (1318) / `handleDocxShuffle` (985) / `handleMultiShuffle` (1470) |

- **Testids/ids:** `id="step-shuffle"` (56); input `id="set-count"` (75); radios `dist-original`/`dist-inter`/`dist-chunk`/`dist-random` (122/131/138/145); switch `id="shuffle-within"` (164); radios `ref-keep`/`ref-strip`/`ref-endline` (190/197/204) inside `data-testid="ref-mode-group"` (187).

---

### `tok-text.tsx` — **TokText**
- **UI name:** (no chrome — text renderer)
- **File:** `src/components/mcq/tok-text.tsx` — 46 lines. Export `TokText({line, dominant, colored=true})` (21).
- **Mother/Child:** **Mother** (render primitive).
- **Where/what:** renders a line word-by-word; Bijoy words get the embedded SutonnyMJ web font (`tokfont-bijoy`), `colored=true` adds per-script color classes (`tok tok-bijoy|unicode|english`). Used by both detect cards, sets-result, docx-sets-result, redownload-questions-card. Colors come from globals.css `--st-brand-*` re-pointed tokens.

---

### `upload-first-card.tsx` — **UploadFirstCard** (+ co-exported **StagedFilesCard**)
- **UI name:** "Upload a file first" (line 91)
- **File:** `src/components/mcq/upload-first-card.tsx` — 218 lines. Card 1 badge + title 90–92; tabs 99–143; detect button 146–154.
- **Mother/Child:** **Mother** (the site's step-1 entry point).
- **Where:** the ONLY visible card when there is no input at all (page.tsx 1665).
- **Buttons & controls:**

| Label (exact) | Handler/prop | What it does | Logic lives in |
|---|---|---|---|
| Tab `Upload file` (102) / Tab `Paste text` (105) | shadcn Tabs | switches input mode | local |
| dropzone `Click to select a file or drag & drop` (116) | `onDropzoneFiles` → `handleFiles` → `onFiles` = page `stageFiles` (305) for .docx / `onTextFileLoaded` = `loadAndDetect` (549) for .txt | **staging-time validation**: each .docx must pass `isValidDocxZip` else English toast `<name> is not a valid .docx`; .txt/.csv capped at 5MB (inline error `Text file too large (5MB max)` line 59) | page.tsx 305; limit TEXT_MAX_BYTES line 24 |
| `🔍 Detect questions (paste mode)` (153, busy `Detecting...`) | `onDetect` → page `handleDetect` (568) | parses pasted text → jumps straight into shuffle work view | `parseMcq` |
| inline errors `Supported files: .docx or .txt` (78) / `Could not read the file` (67) | — | feedback | local |

**StagedFilesCard** (lines 166–218): UI name "📁 {N} files ready — pick a mode now" (185). Where: step 2, above ModeTabs (page 1677). Control: icon-only button `aria-label="Clear files"` (195) → `onClear` → `setStagedFiles(null)`. **Note: there is NO `staged-files-card.tsx` file — this card lives inside upload-first-card.tsx.**

- **Testids/ids:** `id="step-upload"` (87).

---

### `src/app/page.tsx` (2080 lines) — **THE WIRING MOTHER**
Everything is wired here; every card is stateless-ish and gets handlers as props.

- **Role:** single-page app (`export default function Home()`, line 173). Owns ALL state; renders header (1639–1659: hero title `MCQ Shuffler Pro` 1645, badges `100% free` / `Data stays in your browser` 1651–1656), main flow switch (1663–2069), footer (2073–2077).
- **Key state groups:**
  - Flow: `mode` (175), `stagedFiles` (179), `flowStep: "select"|"work"` (183)
  - Text input: `rawText` (186), `hydrated` (187), `detecting` (188), `parsed` (189)
  - Single-docx shuffle: `docx: DocxState|null` (192), `docxLoading` (193)
  - Selection: `selected` (196), `allowBroken` (197), `fixing` (198)
  - Shuffle config: `setCount` (201), `distribution` (202), `shuffleWithin` (203), `shuffling` (204), `refMode` (206)
  - **fontSettings** (209, persisted `mcq-font-settings`, sanitized on load via `sanitizeFontSettings` 107)
  - **downloadFormat** (212, persisted `mcq-download-format`, DOCX default)
  - Text results: `sets` (215), `setsDocx` (216), `renumber` (217), `sortedFlags` (218), `exportOpts` (219), `busy` (220), `copiedSet` (221)
  - Serial: `serialDocs` (224), `serialLoading` (225), `serialBusy` (226), `serialMergedBusy` (227), `serialZipBusy` (228), `serialStrategy` (229), `serialSchemes` (231), `serialPasteText` (233), `serialPaste` (234), `serialPasteBusy/Fixing/DlBusy` (235–237)
  - Shuffle multi: `shuffleItems` (242), `shuffleLoading` (243), `shuffleMultiSets` (244), `multiShuffling` (245), `multiMergedBusy` (246), `multiZipBusy` (247)
  - Redownload: `rdDocs` (250), `rdLoading` (251), `rdSel` (253), `rdParts` (255), `rdRenumber` (256), `rdMergedBusy` (257), `rdZipBusy` (258)
- **Cross-cutting handlers:** `stageFiles` 305 • `updateFontSettings` 354 • `updateDownloadFormat` 363 • `finalizeDownload` 376 (DOCX→downloadBlob / PDF→docxBlobToPdfBlob) • `finalizeZipEntries` 387 • `changeMode` 397 • `backToHome` 408 • `handleAddMoreFiles` 427 • carry-over: `modeHasContent` 437, `filesOfMode` 445, `loadIntoMode` 457, `carryToMode` 469 • `resetResults` 512.
- **Main handlers per mode (line numbers):**
  - *Text flow:* `handleTextChange` 520, `runTextParse` 532, `loadAndDetect` 549, `handleDetect` 568, `handleAutoFix` 580, `toggleQuestion` 599, `announceDetect` 608, `handleTextShuffle` 1318, `toggleSort` 1557, `handleExportDocx` 1574, `handleExportDoc` 1590, `handlePrint` 1602, `handleCopySet` 1611, `handleCopyAll` 1623.
  - *Shuffle docx:* `handleDocxFile` 629, `toggleSerialByClick` 712, `handleDocxShuffle` 985, `handleDocxDownload` 1013, `handleDocxSerialFix` 1042, `handleDocxCopySet` 1067, `selectAll` 1099, `selectNone` 1104, `selectRange` 1106, gates `gateReason` 1140 / `canShuffle` 1150.
  - *Shuffle multi:* `handleShuffleFiles` 1360, `reorderShuffleItems` 1452, `removeShuffleItem` 1464, `handleMultiShuffle` 1470, `handleMultiMergedDownload` 1496, `handleMultiZipDownload` 1527, `multiGateReason` 1129.
  - *Serial:* `loadSerialFiles` 717, `reorderSerialDocs` 767, `removeSerialDoc` 776, `handleColorSerial` 786, `handleSerialMultiMerged` 827, `handleSerialMultiZip` 859, `handleSerialPasteDetect` 886, `handleSerialPasteFix` 917, `handleSerialPasteDownload` 935, `openInSerialMode` 961.
  - *Redownload:* `loadRedownloadFiles` 1155, `reorderRdDocs` 1202, `removeRdDoc` 1211, `toggleRdQuestion` 1222, `selectAllRd` 1231, `selectNoneRd` 1237, `selectRangeRd` 1241, `buildRdItems` 1249, `handleRdMerged` 1265, `handleRdZip` 1291.
- **Shuffle dispatch:** `handleShuffle` (1347) = `shuffleItems ? handleMultiShuffle : docx ? handleDocxShuffle : handleTextShuffle`.

---

# Part 4 — Mode playbooks (step-by-step edit recipes)

### 4.1 Shuffle mode — single .docx flow
1. Upload on **UploadFirstCard** → `onFiles` → page `stageFiles` (page.tsx 305) → `isValidDocxZip` (file-pipeline 33) rejects fakes with toast.
2. Click `🔀 MCQ Shuffle` on **ModeTabs** → `changeMode` (397) → `carryToMode` (469) → `loadIntoMode` → `handleShuffleFiles` (1360) → single file → `handleDocxFile` (629) → `runFilePipeline` (file-pipeline 73) with `prepareShuffleXml` (125) → color headers + non-MCQ lines stripped → `parseDocxXml` (docx-xml 426) → state `docx`.
3. **DocxDetectCard**: selection toolbar buttons → `selectAll`/`selectNone`/`selectRange` (page 1099–1111); broken serial → `🔧 Fix serial & download .docx (1..N)` → `handleDocxSerialFix` (1042) → `buildSerialFixedDocxBlob` (docx-exporter 190) → `repackDocxRemapped` → `finalizeDownload` (376); or enable `Run as-is`.
4. **ShuffleCard** `🔀 Shuffle & build sets` → `handleShuffle` (1347) → `handleDocxShuffle` (985) → `buildSets` (set-engine 46) → `setsDocx` → auto-scroll to results (997).
5. **DocxSetsResult** `⬇️ Word (.docx) — renumbered serials (1,2,3…)` / `— original numbers` → `handleDocxDownload` (1013) → `buildShuffledDocxBlob` (docx-exporter 170) → `buildShuffledXml` (90, XML surgery + renumber + refs) → `zipWithXml` (164) → `repackDocxRemapped` (repack-docx 56, font remap last) → `finalizeDownload` (376). If `downloadFormat==="pdf"` → `docxBlobToPdfBlob` (pdf-export 80) → `downloadBlob` with `.pdf` name.
6. Color-header files additionally show **ColorShuffleInfoCard** (`Prefer color-based serials? Open in Serial mode` → `openInSerialMode` 961) and **BlockedLinesCard**.

### 4.2 Shuffle mode — multi-file flow
1. `handleShuffleFiles` (1360) with ≥2 files (cap 50: `SHUFFLE_MAX_FILES`, limits.ts 30; over-cap toast at 1371) → `runFilePipeline` + `prepareShuffleXml` per file → `shuffleItems`.
2. Inline files Card (page 1864) + **MultiFileList**: reorder/remove → `reorderShuffleItems` 1452 / `removeShuffleItem` 1464 (clears previous results).
3. **ShuffleCard** → `handleMultiShuffle` (1470): per-file `buildSets` → `shuffleMultiSets`.
4. **MultiDownloadCard** `Download as one file (.docx)` → `handleMultiMergedDownload` (1496): per file `buildShuffledXml` (docx-exporter 90) → `replaceDocumentXml` (multi-docx 268) → `buildMergedDocxBlob` (414, one container-level font remap) → `finalizeDownload`; `Download separately (.zip)` → `handleMultiZipDownload` (1527): per-file `replaceDocumentXml(file, xml, fontSettings)` → `finalizeZipEntries` (387) → `buildZipBlob` (556) → `downloadBlob(zip, "MCQ-shuffled-files.zip")`.

### 4.3 Shuffle mode — text/paste flow (also .txt)
1. **UploadFirstCard** paste tab → textarea → `handleTextChange` (520; autosave localStorage `mcq-shuffler-text`, debounced 600 ms, effects 484–510) or upload .txt → `loadAndDetect` (549) → `runTextParse` (532) → `parseMcq` (parser 141) → auto-jumps to shuffle work view (539).
2. **DetectCard** selection / `🔧 Fix numbering automatically` → `handleAutoFix` (580) → `autoFixNumbering` (parser 223).
3. **ShuffleCard** → `handleTextShuffle` (1318) → `buildSets` → `sets`.
4. **SetsResult** exports: `⬇️ Word (.docx) — one set per page` → `handleExportDocx` (1574) → `buildSetsDocxBlob` (exporter 202; `maybeRemapPackedDocx` 192 applies font remap) → `finalizeDownload`; `.doc (legacy Word)` → `handleExportDoc` (1590) → `exportDocHtml` (299); `🖨️ Print` → `handlePrint` (1602) → `printSets` (306); copy buttons → `handleCopySet` 1611 / `handleCopyAll` 1623.

### 4.4 Serial mode — file flow
1. `🔢 MCQ Serial` → **SerialInputCard** dropzone → `loadSerialFiles` (717) → `runFilePipeline` + `analyzeColorDocx` (color-serial 231) → `serialDocs` (+ `serialSchemes` default continuous).
2. Exactly 1 file **with** colors → **ColorSerialCard**: pick color chip or `Continuous across the file` → `Download serial .docx (B1)` → `handleColorSerial` (786) → `planSerialByColor` (472) → `buildColorSerialDocxBlob` (720) → `applyColorSerialXml` (648) + `repackDocxRemapped` → `finalizeDownload`.
3. Exactly 1 file **without** colors → **NoColorSerialCard** → `Download continuous 1..N serial .docx` → same `handleColorSerial` with `{kind:"continuous"}`.
4. ≥2 files → **MultiSerialSchemeCard** (per-file scheme → `setSerialSchemes` 1821) + **MultiDownloadCard**: merged → `handleSerialMultiMerged` (827) → per-file `planSerialByColor` + `applyColorSerialXml` + `replaceDocumentXml` → `buildMergedDocxBlob(items, fontSettings)` → finalize (name `{base} (merged serial).docx`); ZIP → `handleSerialMultiZip` (859) → `"MCQ-serial-files.zip"`.

### 4.5 Serial mode — paste flow
1. **SerialInputCard** Paste tab → `🔍 Detect questions` → `handleSerialPasteDetect` (886) → `parseMcq`; clears file list (mutually exclusive).
2. **SerialPasteCard**: `🔧 Fix numbering automatically` → `handleSerialPasteFix` (917) → `autoFixNumbering`; `Download serial .docx (1..N)` → `handleSerialPasteDownload` (935) → `renumberQuestionsByPosition` (serial-paste 17) → `buildSetsDocxBlob([renumbered], {includeHeader:false, includeSetHeader:false, fileName:"MCQ-Serial-Nq.docx"}, fontSettings)` → `finalizeDownload`.

### 4.6 Redownload mode
1. `📥 MCQ Redownload` → **RedownloadInputCard** → `loadRedownloadFiles` (1155) → `runFilePipeline` with `parseRedownloadXml` (redownload 259) + `extractWatermark` (761) → `rdDocs`; all questions default-selected (1182).
2. **RedownloadPartsCard** checkboxes → `setRdParts` (page 1712); `Renumber serials 1, 2, 3…` → `setRdRenumber`.
3. **RedownloadQuestionsCard** per file: Select all/Deselect/Select range/checkboxes → page 1231–1246.
4. **MultiDownloadCard** "4. Download…": `Download as one file (.docx)` → `handleRdMerged` (1265) → `buildRdItems` (1249) → `buildRedownloadXml` (redownload 511) → 1 file: `replaceDocumentXml` / many: `buildMergedDocxBlob` → finalize (names `"{base} (redownload).docx"` / `"MCQ-Redownload-merged.docx"`); `Download separately (.zip)` → `handleRdZip` (1291) → `"MCQ-Redownload.zip"`.

---

# Part 5 — Where to change common things (quick recipes)

| I want to change… | Open this file | Touch this | Do NOT touch |
|---|---|---|---|
| Site font everywhere | `src/config/theme.ts` | `fonts.sans` (147); web-font recipe in the bottom comment (a) | globals.css font chain, theme-css.ts |
| Brand color (green) | `src/config/theme.ts` | `colors.light.brand` 600/700 (+neighbors) (181–193); recipe (b) | `--st-*` var chain, component classes |
| Popup corners / toast shadow | `src/config/theme.ts` | `popup` object (254–261); recipe (c) | `ui/toast.tsx` / `ui/select.tsx` class wiring |
| Corner radius of everything | `src/config/theme.ts` | `radius.base` (245) — single knob | sm/md/lg/xl (derived) |
| A card's title text | that card's component (Part 3 lists exact line) | the `<CardTitle>` string | page.tsx props unless the title is passed in (MultiDownloadCard titles come from page.tsx 1737/1824/1915) |
| A button label | that card's component | the `<Button>` text (many labels swap on `.docx/.pdf` — keep the `format === "pdf" ? …` template) | E2E selectors in `scripts/e2e-*.ts` — sync them in the same commit |
| Upload size limit (50MB) | `src/lib/mcq/limits.ts` | `MAX_FILE_BYTES` (24) + message `FILE_TOO_BIG_MSG` in `src/lib/mcq/file-pipeline.ts` (24) | dropzone emit logic |
| Max files in shuffle (50) | `src/lib/mcq/limits.ts` | `SHUFFLE_MAX_FILES` (30) | mode-work-bar cap logic |
| The 3 mode names / emoji / icons | `src/lib/mcq/mode-meta.ts` | `MODE_META` (25–53): title/tabTitle/description/emoji/Icon | the `id` strings & localStorage `mcq-shuffler-mode` values |
| Font choices in "Fonts in the output file" | `src/lib/mcq/font-remap.ts` | `FONT_CHOICES` (63–67) | `sanitizeFontSettings` (page 107) reads this list automatically |
| Default remap fonts | `src/lib/mcq/font-remap.ts` | `DEFAULT_FONT_REMAP_SETTINGS` (55–60) | repack-docx wiring |
| PDF page cap (300) / quality | `src/lib/mcq/pdf-export.ts` | `PDF_MAX_PAGES` (40), scale rule (157), JPEG q (199/215) | DOCX path |
| Download format default (DOCX) | `src/app/page.tsx` | `DOWNLOAD_FORMAT_KEY` (120), initial state (212), hydrate effect (345) | DownloadFormatToggle component |
| Set-name style output (সেট A / ক / ১ / Set 1) | `src/lib/mcq/set-engine.ts` | `getSetName` (93) (+ option labels in `sets-result.tsx` 190–193) | exported-file samples are functional strings |
| Parser keywords / question-start regex | `src/lib/mcq/parser.ts` (Q_RE) / `src/lib/mcq/docx-xml.ts` (SERIAL_RE, keyword fns) | ⚠️ functional Bengali patterns — change only with the unit tests (`scripts/test-mcq.ts`, `test-docx.ts`) | max serial value coupling with `MAX_SERIAL_NUMBER` (limits.ts 18) |
| .txt/.csv paste size cap (5MB) | `src/components/mcq/upload-first-card.tsx` | `TEXT_MAX_BYTES` (24) + message (59) | — |
| Hero title / badges / footer | `src/app/page.tsx` | header 1639–1659, footer 2073–2077 | layout.tsx metadata |
| Output file names | `src/app/page.tsx` (merged/zip names 843/871/1305/1544/1278) + `src/lib/mcq/docx-exporter.ts` (suffixes 182/205) | the template strings | finalizeDownload/finalizeZipEntries |
| localStorage keys | `src/app/page.tsx` | `STORAGE_KEY`/`MODE_KEY`/`FONT_SETTINGS_KEY`/`DOWNLOAD_FORMAT_KEY` (97–120) | hydration effects |
| Format-kept-exact zip surgery | — | — | `src/lib/mcq/repack-docx.ts`, `multi-docx.ts`, `docx-xml.ts` (mothers — edit only with full test suite `scripts/test-*.ts`) |

---

## Appendix — quick E2E anchor cross-reference
- `scripts/e2e-modes.ts` uses: `#step-result`, `#step-shuffle`, `#step-rd-questions`, `button:has-text("Download as one file (.docx)")`, `"Download separately (.zip)"`, `button[aria-label="Move up"]`, `button[aria-label="Remove from list"]`, `"Select all"` (exact) / `"Deselect all"`, `input[placeholder="From"/"To"]`, `"Select range"`, `#step-result button:has-text("Word (.docx)")`, `text=1/50 files`, `button[role="tab"]:has-text("MCQ Shuffle")`.
- `scripts/e2e-pdf-export.ts` uses: `data-testid="download-format"`, `format-docx`, `format-pdf`.
- `scripts/e2e-font-remap.ts` uses: `data-testid="font-settings-card"`, select ids `font-unicode`/`font-bijoy`, `"Use fonts"`.

All labels above were cross-checked between the component sources and the E2E selectors; they match the English UI conversion (worklog Task 42-finish).
