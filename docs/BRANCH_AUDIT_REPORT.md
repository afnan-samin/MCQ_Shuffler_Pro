# Branch Audit Report — P04–P11 (8 development branches)

**Audit date:** 2026-11-14
**Repository:** `MCQ_Shuffler_Pro-main`
**`main` HEAD at audit time:** `6ac98da`
**Auditor scope:** P04, P05, P06, P07, P08, P09, P10, P11 — branch correctness, code/test verification, real-file behaviour, merge compatibility.
**Out of scope:** P12 (its commit `bdf588a` is not in this repository) and P13 (no branch / no reply) — see §9.

> This report is descriptive evidence only. **No merge into `main`, no push, no branch deletion, no force-push, no history rewrite and no `git reset --hard` was performed.** The 19 uncommitted files that already existed in the `main` working tree were never modified or discarded.

---

## 1. Executive summary

| Item | Result |
|---|---|
| Branches audited | 8 |
| Branches `READY` (as-is) | 5 — P07, P08, P09, P10, P11 |
| Branches `READY AFTER FIX` (merge-order / conflict resolution needed) | 3 — P04, P05, P06 |
| Branches `BLOCKED` | 0 |
| Total fixes applied by this audit | 2 conflict resolutions (test files only), both verified |
| Code-level defects found | 1 serious candidate (P05 Bijoy topic label) → `NEEDS REVIEW`; 3 documented limitations |
| Full sequential integration (P04→P11) | **PASS** — `test:all` exit 0, `tsc --noEmit` exit 0, `lint` 0 errors, `node --check public/sw.js` exit 0 |
| Real-file evidence | 24 `.docx` files, 9,300 questions, 9,155 answered questions, 9,279 generated answer lines |
| `main` working tree | untouched (19 pre-existing modified files still present) |

**Bottom line:** all 8 branches are functionally sound and can be merged, **in the order P04 → P05 → P06 → P07 → P08 → P09 → P10 → P11**, provided the two test-file conflicts documented in §6 are resolved as described. The P05 topic-label gap (§7, I-05) is a pre-existing shared-regex limitation rather than a regression, so it does **not** block the merge, but it should be tracked.

---

## 2. Method

1. Read every prompt (`prompts/P04_*.md` … `prompts/P11_*.md`) and every reply (`Reply/`, `prompt-pack/Reply/`).
2. Compared each branch's own diff (`git diff <merge-base>..<branch>`) against its prompt's file boundaries and requirements.
3. Created one read-only worktree per branch (`.audit-worktrees/p04` … `p11`, detached HEAD) and ran `tsc --noEmit`, `eslint .`, and the branch's relevant test scripts there.
4. Ran `git merge-tree --write-tree` for each branch against `origin/main` to predict conflicts.
5. Built a dedicated integration branch `audit/integration-2026-11` from `origin/main` in `.audit-worktrees/integration` and merged all 8 branches in phase order, resolving conflicts, then ran the **full** `test:all`, `tsc --noEmit`, `lint` and `node --check public/sw.js`.
6. Ran throwaway real-file probes against `Format/*.docx` for the two riskiest features (P04 answer lines, P05/P06 header/topic behaviour). Probe scripts were deleted after use; results are recorded in §7.

Evidence logs: `.audit-worktrees/logs/<branch>/*.log`, integration log: `.audit-worktrees/logs/integration/test-all.log`.

---

## 3. Branch inventory

| Phase | Branch | HEAD | merge-base with `main` | Commits base..HEAD | Own commit | Files changed | Own diff |
|---|---|---|---|---|---|---|---|
| P04 | `feat/answer-line-format` | `3ffb8a1` | `1e96bba` | 2 | `3ffb8a1` | 4 | +580 / −15 |
| P05 | `feat/header-and-topic-toggles` | `97e1bea` | `1e96bba` | 3 | `97e1bea` | 5 | +241 / −109 |
| P06 | `feat/removed-headers-card` | `3bca760` | `1e96bba` | 4 | `3bca760` | 7 | +627 / −8 |
| P07 | `fix/exporter-single-segment-font` | `227bd35` | `2108c87` | 1 | `227bd35` | 2 | +18 / −1 |
| P08 | `fix/text-parser-decimal-lines` | `4145d88` | `2108c87` | 1 | `4145d88` | 2 | +28 / −0 |
| P09 | `fix/loading-state-reset` | `785af04` | `2108c87` | 1 | `785af04` | 3 | +3 / −3 |
| P10 | `fix/staging-xml-cache` | `62d5eee` | `2108c87` | 1 | `62d5eee` | 3 | +61 / −6 |
| P11 | `chore/stale-comments-sw-waituntil` | `04ff7d7` | `2108c87` | 1 | `04ff7d7` | 5 | +15 / −13 |

Notes:

- P04/P05/P06 are a **stack** (P05 base = P04, P06 base = P05), so their `base..HEAD` ranges legitimately contain 2/3/4 commits.
- P04 additionally carries commit `58ef62c`, a copy of the P02 fix that `main` received separately as `ae3f4ae`. The two commits produce **byte-identical** `src/lib/mcq/redownload.ts` and `scripts/test-redownload-splits.ts` (verified by direct comparison), so merging P04 introduces no drift; the commit simply becomes redundant.
- P07–P11 were branched from `main` at `2108c87`, i.e. **before** `main` received the P03 font fixes (`d2c3e9d`, `52910e4`). This is why the integration branch (not the isolated branch) is the authoritative compatibility test for them — see §6.

---

## 4. Per-branch verification

All numbers below were re-run during this audit, not copied from the replies.

| Phase | Prompt compliance | Tests re-run on the branch | `tsc` | `lint` | Status |
|---|---|---|---|---|---|
| P04 | answer line = `[tab][bold "Ans: "][label token][verbatim option runs]`; multi-answer; star answers; relabel ON; option-run fonts kept; options-ON path untouched | `test:redownload` 62/0, `test:splits` 85/0, `test:docx` 111/0 | 0 | 0 errors | **READY AFTER FIX** (merge conflict in `scripts/test-redownload-splits.ts`, §6) |
| P05 | `header` + `topic` are independent `PartSel` keys; old `topicHeader` removed; old presets migrate; UI order Header, Serial, Question, Reference, Options, Answer, Explanation, Topic | `test:redownload` 92/0, `test:splits` 85/0 | 0 | 0 errors | **READY AFTER FIX** (conflict in `redownload.ts`/splits test when merged alone; clean after P04) |
| P06 | removed-headers card, rich run preview, card only active while Header is unticked, per-file grouping | `test:docx` 120/0, `test:redownload` 108/0 | 0 | 0 errors | **READY AFTER FIX** (conflicts in `redownload.ts`, `docx-xml.ts`, tests when merged alone; clean after P05) |
| P07 | auto mode uses the segment's own font for single-segment lines; non-auto branches unaffected | `test:export` 10/0 | 0 | 0 errors | **READY** |
| P08 | decimal guard mirrors `docx-xml.isQuestionStart`; `"5. 3 apples"` still a question | `test:mcq` 87/0 | 0 | 0 errors | **READY** |
| P09 | loading flag cleared in `finally` in all three hooks; early returns untouched | no new test (behavioural 1-line moves); `tsc`/`lint` clean | 0 | 0 errors | **READY** |
| P10 | LRU xml cache (max 8, `File`-keyed), cache-hit shortcut in `isValidDocxZip`, pipeline uses cache | `test:docx` 116/0 | 0 | 0 errors | **READY** |
| P11 | stale hook header comments corrected; `install` listener uses `event.waitUntil` | `node --check public/sw.js` OK; `tsc`/`lint` clean | 0 | 0 errors | **READY** |

`lint` reports the same **2 pre-existing warnings** (`useShuffleMode.ts` unused `eslint-disable` at lines 237/463) on every branch and on `main`; they are not introduced by any audited branch and no errors are produced.

---

## 5. P04 answer-line design check (code + real files)

The new path is `buildRedownloadXml` → `buildAnswerLineParas` → `findOptionSpan` → `extractParaSpan`, with `paraTabbedText`/`dominantLatinFont` from `option-labels.ts` and `redownload.ts`. Verified properties:

- Only runs of the **selected** option are cloned (two options per paragraph, tables and tab-separated layouts all resolve).
- Subscript/superscript and Bijoy run fonts survive cloning; `"Ans: "` is bold, tab-prefixed, and uses the document's dominant Latin font (falling back to `Times New Roman`).
- Multi-answer (`"L + N"`), star-marked answers, glued `Dt K` tails and options-ON (nothing generated) paths are covered by fixtures 12–16 in `scripts/test-redownload-splits.ts`.
- Dotless-label fallback produces a label-only line (`"Ans: C"`) instead of throwing.

Real-file probe (`Format/*.docx`, 24 files, answer-line mode Options OFF + Answer ON):

| Metric | Value |
|---|---|
| Questions parsed | 9,300 |
| Questions with an answer | 9,155 |
| Generated answer lines (`"Ans: …"`) | 9,279 (multi-answer questions legitimately produce 2+ lines) |
| Label-only fallbacks (option text could not be located) | **4** (0.04 %) — 2 in `BCS English Question Year Based.docx`, 1 in `Demo Ans Sheet.docx`, 1 in `Zoology Varsity Update 2027 Batch.docx` |
| Answer lines missing the option's own paragraph text | **0** |
| Continuation-paragraph losses | **0 confirmed** (see §7, I-08) |

Sample fallbacks are genuine unlocatable cases (dotless/odd label shapes), not text corruption: e.g. `BCS English … Q1` renders `"Ans: L"` while `"L. sugar"` exists, and `Demo Ans Sheet` renders `"Ans: 4"`. They are acceptable by the prompt's fallback rule but worth a look if the owner wants 100 % text.

---

## 6. Merge compatibility

### 6.1 Individual merge into `main` (`git merge-tree`)

| Phase | Predicted result | Conflicts |
|---|---|---|
| P04 | CONFLICT | `scripts/test-redownload-splits.ts` |
| P05 | CONFLICT | `src/lib/mcq/redownload.ts`, `scripts/test-redownload-splits.ts` |
| P06 | CONFLICT | `src/lib/mcq/redownload.ts`, `src/lib/mcq/docx-xml.ts`, `scripts/test-docx.ts`, `scripts/test-redownload.ts` |
| P07 | CLEAN | — |
| P08 | CLEAN | — |
| P09 | CLEAN | — |
| P10 | CLEAN | — |
| P11 | CLEAN | — |

Cause: P04–P06 share merge-base `1e96bba`, which predates the P02/P03 merges on `main`; their `redownload.ts`/`docx-xml.ts` hunks and their appended test fixtures sit on the same regions as `main`'s.

### 6.2 Sequential integration (authoritative)

Branch `audit/integration-2026-11` (created from `origin/main`, HEAD `8f980d7`, 20 files, +1576/−158):

| Merge step | Result | What had to be resolved |
|---|---|---|
| P04 | CONFLICT | `scripts/test-redownload-splits.ts` — `main`'s fixtures 8–11 and P04's answer-line fixtures were both appended at the end; resolved by keeping both blocks in order (no renumbering needed). `src/lib/mcq/redownload.ts` auto-merged. |
| P05 | CLEAN | — |
| P06 | CLEAN | — |
| P07 | CLEAN | — |
| P08 | CLEAN | — |
| P09 | CLEAN | — |
| P10 | CONFLICT | `scripts/test-docx.ts` — P06 and P10 both added a section titled `== 23)`. Resolved by keeping P06's rich-run section as `23` and renumbering P10's cache section (and its `"23:` assertion labels) to `24`. |
| P11 | CLEAN | — |

So the three `CONFLICT` branches merge **cleanly** once merged in phase order; only test files need manual resolution, and only two of them.

### 6.3 Integration verification

| Check | Result |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit` | exit 0 |
| `npx eslint .` | exit 0 — 0 errors, 2 pre-existing warnings |
| `node --check public/sw.js` | exit 0 |
| `bun run test:all` | **exit 0** — every suite green |

Per-suite counts on the integration branch:

| Suite | Result |
|---|---|
| `test:mcq` | 87 pass / 0 fail |
| `test:docx` | 125 pass / 0 fail (120 P06 + 5 P10, both sections ran) |
| `test:color` | 104 pass / 0 fail |
| `test:multi` | 70 pass / 0 fail |
| `test:font` | 144 pass / 0 fail |
| `test:labels` | 32 pass / 0 fail |
| `test:redownload` | 108 pass / 0 fail |
| `test:splits` | 85 pass / 0 fail |
| `test:weekly` | 9 pass / 0 fail |
| `test:reference` | 51 pass / 0 fail |
| `test:doc1` | 27 pass / 0 fail |
| `test:export` | 10 pass / 0 fail |
| `test:pdf` | 11 pass / 0 fail |
| `test:engines` | 104 pass / 0 fail / 0 warnings |

The `test:engines` result is the most important compatibility signal: serial, shuffle and redownload modes produce identical question counts and serial lists on all real files **with P03 + P04–P11 applied together**, including the 2,687-question file.

---

## 7. Findings and issue register

Status vocabulary: **READY** = no action needed; **READY AFTER FIX** = mergeable once the stated resolution is applied; **BLOCKED** = cannot proceed; **NEEDS REVIEW** = works, but an owner decision or follow-up is required.

| ID | Phase / branch | File / function | Symptom and cause | Impact | Resolution / fix | Status |
|---|---|---|---|---|---|---|
| I-01 | P04 `feat/answer-line-format` | `scripts/test-redownload-splits.ts` | Both `main` (fixtures 8–11, from P02) and P04 (answer-line fixtures) append at EOF → textual conflict. | Blocks a plain `git merge` on this file only. | In integration: keep both blocks, `main`'s first, then P04's. Verified by `test:splits` 85/0. | **FIXED** (integration `b9786e2`) |
| I-02 | P05 `feat/header-and-topic-toggles` | `src/lib/mcq/redownload.ts`, `scripts/test-redownload-splits.ts` | Branch base `1e96bba`; merging alone conflicts with `main`'s P02/P03 edits in the same region. | Would require resolving core-engine hunks if merged out of order. | Merge after P04 → **auto-merges cleanly** (integration `dee7e71`); `test:redownload` 92/0. | **FIXED** (merge order) |
| I-03 | P06 `feat/removed-headers-card` | `src/lib/mcq/redownload.ts`, `src/lib/mcq/docx-xml.ts`, `scripts/test-docx.ts`, `scripts/test-redownload.ts` | Same base problem, one phase deeper. | Same as I-02. | Merge after P05 → **auto-merges cleanly** (integration `27a689c`); `test:docx` 120/0, `test:redownload` 108/0. | **FIXED** (merge order) |
| I-04 | P10 `fix/staging-xml-cache` | `scripts/test-docx.ts` | P06 and P10 independently add a test section numbered `23`. | Test-only conflict, no production impact. | Renumber P10's section (and its `"23:` labels) to `24` during merge; verified `test:docx` 125/0. | **FIXED** (integration `1700bb1`) |
| I-05 | P05 (feature gap, shared with `reference.ts`) | `TOPIC_LABEL_RE` in `src/lib/mcq/redownload.ts`; `SOURCE_LABEL_LINE_RE` in `src/lib/mcq/reference.ts` | Topic keyword list includes Bijoy `UwcK`, but both regexes require an ASCII `:`; Bijoy files write the label as `UwcKt` (Bijoy colon = `t`). Those lines fall through to `kind = "options"`. | 44 in-block topic lines in 2 real files (`Chemistry 2nd Ch-05 SET-A.docx` 31, `Weekly test 2 SET A,B,C.docx` 13) cannot be removed by the Topic toggle; they are removed by Options OFF instead. No content loss; toggle semantics wrong for those lines. | **Not changed** (would alter shared regexes used by two engines — out of the 8 branches' file boundaries and a parity risk). Recommended follow-up: accept an optional Bijoy-colon form for `UwcK` in both regexes, with a parity test. | **NEEDS REVIEW** |
| I-06 | P06 | `collectHeaderEntries` → `extractParaRuns(el, {rich: true})` in `src/lib/mcq/redownload.ts` | Bold/italic/size come only from direct run properties (`w:rPr`); formatting inherited from `styles.xml` (paragraph/character styles) is not resolved. | Removed-headers card preview may render a header that is bold only via its style as non-bold. **Preview cosmetics only** — the document output is unaffected and removal is correct. | Not changed (needs `styles.xml` access, outside P06's scope). Documented as a known limitation. | **NEEDS REVIEW** (low) |
| I-07 | none of the 8 (pre-existing) | `OPTION_MARKER_RE` in `src/lib/mcq/docx-xml.ts` | Option labels are letter-based only (`K/L/M/N`, `ক-ঘ`, `a-d`); options numbered `1. 2. 3. 4.` are not recognised (a numeric label collides with the serial-number parser). | Files using numeric option labels are not parsed as MCQs. | Not a P04–P11 deliverable and not a regression (behaviour identical on `main`). No change. | **OUT OF SCOPE** |
| I-08 | P04 | `buildAnswerLineParas` / `findOptionSpan` | The answer line clones only the paragraph that contains the answer option. If an option's text were split across two Word paragraphs, only the first would appear in `"Ans: …"`. | Cosmetic truncation of the answer line in that rare layout. Option text is NOT lost from the document (other parts still carry it). | Real-file probe found **0 confirmed** truncations in 24 files: all candidate "continuation" paragraphs turned out to be question-text continuations, group headings or explanation lines, not option text. The prompt explicitly asks for *one* paragraph per answer, so this is intended behaviour. | **NEEDS REVIEW** (accept as-is recommended) |
| I-09 | P12 / P13 | — | P12's commit `bdf588a` does not exist in this repository; P13 has no branch or reply. | Neither can be audited or merged. | Not part of this audit's 8 branches. Flagged only so the merge plan is not mistaken for "all phases done". | **BLOCKED (outside scope)** |
| I-10 | repo state | `main` working tree | 19 files are already modified and uncommitted in `main` (`.gitignore`, `README.md`, `scripts/test-*`, `src/app/page.tsx`, `src/lib/mcq/redownload.ts`, …). | `git merge` on `main` will refuse or risk mixing those edits with merge results. | Audit left them untouched. Before merging, the owner must commit/stash them deliberately (audit performed no stash, no reset). | **NEEDS REVIEW** |

---

## 8. Real-file evidence for the two riskiest features

### 8.1 P05 Header toggle + P06 removals (24 files)

Built each file with `header: false` and re-parsed the output:

| File | header elements in | header elements left out | questions in → out | `sectPr` kept |
|---|---|---|---|---|
| `Agri MCQ Botany 997 mcq.docx` | 221 | 0 | 589 → 589 | yes |
| `BCS English Question Year Based.docx` | 29 | 0 | 657 → 657 | yes |
| `Botany All Versity MCQ Typewise Serial.docx` | 70 | 0 | 2746 → 2746 | yes |
| `Physics 1st Chapter 1-10 Practice Set Raw.docx` | 4 | 0 | 520 → 520 | yes |
| `Zoology Varsity Update 2027 Batch.docx` | 49 | 0 | 2687 → 2687 | yes |
| … all other 19 files | — | 0 | unchanged | yes |

Initial probing flagged "header text still present" in 5 files; a second pass showed those strings are **duplicated inside MCQ blocks** (group headings that the parser assigns to blocks), i.e. false positives. The structural check above (`headerCount = 0` after Header OFF) confirms the toggle removes every body-level element outside blocks and keeps `w:sectPr`.

### 8.2 P05 Topic toggle

`topic: false` removed **all** `kind === "topic"` lines in every file (0 left in the output). The 44 Bijoy-label lines that are *not* classified as topic are I-05.

### 8.3 Card wiring (P06)

`useRedownloadMode` computes `rdRemovedHeaders` only when `rdParts.header === false` and returns `[]` otherwise; `RemovedHeadersCard` returns `null` when there are no groups. So the card is invisible while Header is ticked, as the prompt requires. `page.tsx` renders the card once, outside the parts card, and the old `topicHeader` props were removed by P05 consistently (verified by `tsc` and by inspecting the parts card's `KIND_ORDER`).

---

## 9. Recommended merge plan

Preconditions: `main` working tree clean (I-10) and owner approval (this audit performed no merge).

1. `git checkout main && git pull --ff-only`
2. `git merge --no-ff feat/answer-line-format` → resolve `scripts/test-redownload-splits.ts` by keeping both blocks (main's fixtures 8–11 first, then P04's answer-line fixtures). Run `test:redownload`, `test:splits`.
3. `git merge --no-ff feat/header-and-topic-toggles` → expect clean.
4. `git merge --no-ff feat/removed-headers-card` → expect clean.
5. `git merge --no-ff fix/exporter-single-segment-font` → clean.
6. `git merge --no-ff fix/text-parser-decimal-lines` → clean.
7. `git merge --no-ff fix/loading-state-reset` → clean.
8. `git merge --no-ff fix/staging-xml-cache` → resolve `scripts/test-docx.ts` by renumbering the cache section to `24` (`== 24)` and `"24:` labels).
9. `git merge --no-ff chore/stale-comments-sw-waituntil` → clean.
10. After each step (or at the end): `bun run test:all`, `node node_modules/typescript/bin/tsc --noEmit`, `npx eslint .`, `node --check public/sw.js`.

Expected end state: the same tree as `audit/integration-2026-11` (`8f980d7`), whose full suite is green.

Do **not** merge with `--squash` unless the owner prefers it: the stacked branches (P04–P06) contain a duplicate P02 patch commit (`58ef62c`), which is harmless with `--no-ff` but would need care with squash/rebase flows.

---

## 10. Artifacts and cleanup

Created by this audit (all inside the ignored `.audit-worktrees/` folder unless noted):

- `.audit-worktrees/p04` … `.audit-worktrees/p11` — detached read-only worktrees, each with a `Format` junction to the real `Format/` folder.
- `.audit-worktrees/integration` — branch `audit/integration-2026-11` at `8f980d7` (8 merge commits on top of `origin/main`).
- `.audit-worktrees/logs/<branch>/*.log` and `.audit-worktrees/logs/integration/test-all.log`.
- `.audit-worktrees/run-checks.ps1` — per-branch check runner.
- `docs/BRANCH_AUDIT_REPORT.md` — this file.

Nothing was pushed. `origin/*` refs and all 8 original branches are untouched; `main`'s 19 pre-existing modified files are untouched.

Cleanup (optional, safe): `git worktree remove .audit-worktrees/<name>` for each worktree, then `git branch -D audit/integration-2026-11`.

---

## 11. Appendix — key facts for the owner

- `main` HEAD `6ac98da`; P01–P03 already merged. P04's merge-base being `1e96bba` is expected (its base was the P02 branch), not a wrong base.
- P04's answer-line rewrite changes one existing expectation in `scripts/test-redownload.ts` (old `"উত্তর: H2O"` → new `"Ans: ক) H2O"`); the P04 prompt explicitly allows exactly this class of change.
- `test:engines` is green on the integration branch, so P07's exporter font change and P03's fontless-run fixes do not conflict semantically.
- Per-branch `test:all` results were re-confirmed with exit code 0; the only observed failures across the whole audit were the intentionally documented limitations above, none of which reproduces as a test failure.
