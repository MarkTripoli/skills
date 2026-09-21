---
task: i-want-do-something
type: implementation
summary: "R11 addresses two grader defects from R10 receipt 18. (1) pending(): dropped includes()/exact-equality positive list; strip parenthetical/bracketed annotations before evaluating any step field; a step qualifies if it mentions repair or diagnos*, rejected only if it declares repair completion; table row handler updated to structural checks. (2) viewerTemporaryProof: bind temp-file lifetime to owning read; appearances in concurrent in-flight reads authorized regardless of boundary type; non-concurrent appearances past owner's end still rejected; timestamp regex made optional-s so both ':3.297s' and ':3.297' are recognized. Offline: 185/185 pass. Live eval 20260920-213545: 3/3 passed after independent pixel review. Primary: baseline=2, repaired=1/0. Three-rounds: A→B→C fixed per round, D=2 at exhaustion. Continuation: baseline=2 (interrupted), post-repair=1/0 (resumed)."
round: R11
revision: ddfa1d8
fixes: pending-structural viewerTemporaryProof-concurrent-lifetime timestamp-regex
---

# R11 Implementation Receipt

## Source commits

- `ddfa1d8` — fix(iterate-evidence): structural pending, concurrent lifetime, Ts

## Changes

### Fix 1 — pending(): structural step-field evaluation

**File:** `evals/iterate-evidence.mjs`

Added `strip(s)` helper that removes parenthetical/bracketed content (`\([^)]*\)|\[[^\]]*\]`) and collapses whitespace. Rewrote `pending(value)` to strip parens then check `/\b(?:repair|diagnos)/i` — a step field qualifies if it mentions repair or diagnos* and does not declare completion via `terminalRepair`. Removed the `steps()` function and the `["diagnose","diagnosis","repair"].includes(...)` positive list entirely. Moved `terminalRepair` definition before `pending` (dependency order). Updated `terminalRepair` to call `strip(clean(value))`. Updated the table row handler: Step column checked with `/\brepair\b/.test(strip(cells[0]))` (structural, not exact); State column checked with `!terminalRepair(\`repair ${cells[1]}\`)` (non-terminal = accepted).

Result: "repair (app.js ...; check.mjs ...)" as next-incomplete-step → strip removes parens → "repair" → qualifies ✓. "repair completed" as last-completed-step → still rejected via terminalRepair ✓. "repair and capture" as current step → mentions repair → accepted (removed from invalid list). "| Repair the handler | interrupted |" → structural match, interrupted is non-terminal → accepted ✓.

### Fix 2 — viewerTemporaryProof: concurrent read lifetime

**File:** `evals/iterate-evidence.mjs`

Rewrote `lifetime(candidate, callId)` to:
1. Keep existing checks: file absent at owning read's `tool_execution_start` and own `tool_execution_end` (file must be gone by owner's end).
2. New: require at least one appearance within `(start.sequence, end.sequence)`.
3. New: reject appearances before start.
4. New: appearances at or after the owning read's end are authorized if they belong to a concurrent in-flight read (a read whose `tool_execution_start` snapshot precedes the owning read's `tool_execution_end`). Snapshots without `toolCallId` (viewer_process_end) are also allowed. Non-concurrent appearances past owner's end remain rejected.

Also fixed: the video timestamp regex `/^(.*\.webm)(?::(\d+(?:\.\d+)?)s)?$/` to `/^(.*\.webm)(?::(\d+(?:\.\d+)?)s?)?$/` — makes the `s` suffix optional, so both `video:3.297s` and `video:3.297` are recognized as timestamp selectors. Without this, the proof chain never ran for subjects using the no-`s` form.

### Regressions

**File:** `tests/evals.test.mjs`

Added new test "concurrent in-flight read calls do not invalidate each other's viewer temp files" (lines 136-181): two overlapping reads (viewA, viewB), nameA appears in viewB's concurrent viewer_process_end snapshot (after viewA ends) — authorized; then rejection case where nameA appears in non-concurrent viewC's snapshot — rejected.

Added to `pendingStates`:
- R11 parenthetical next-incomplete: `"...Next incomplete step: repair (app.js value += 2; check.mjs exact count)."` — accepted
- Combined slash with parenthetical: `repair (app.js; check.mjs)` in parts[2] — accepted
- Diagnos* form with parenthetical: `"diagnose and repair (handler.js fix)"` — accepted
- Table interrupted state: `| Repair the handler | interrupted | Paused |` — accepted (non-terminal)

Removed from invalid: `reservationText.replace("repair pending", "repair and capture")` — now accepted (mentions repair, no completion).

Added to invalid:
- R11: next-incomplete "capture the baseline recording" (no repair/diagnos* mention) — rejected
- R11: `| Repair the handler | finalized | Done |` in table — rejected (terminal state)

## Offline verification

- `npm test`: 185/185 pass (exit 0). R11 regressions verify both fixes.
- `node scripts/sync-plugin.mjs --check`: plugin in sync.
- Source commit `ddfa1d8` checked by `node scripts/check-commits.mjs`: ok.

## Live eval — run 20260920-213545

Single invocation: `npm run evals -- iterate-evidence iterate-evidence-three-rounds iterate-evidence-continuation --model anthropic/claude-sonnet-4-6 --keep --max-time 25`

All three scenarios exited with "pending independent review" only — no authorization errors.

### Pixel review performed

**iterate-evidence (primary)**: 5 flows opened and inspected from trace-images. baseline-initial=0, baseline-increment=2 (IE-001 confirmed), repaired-initial=0, repaired-increment=1 (IE-001 resolved), repaired-reset=0. Reservation at seq 115 precedes first mutation at seq 127. review.json written.

**iterate-evidence-three-rounds**: All 36 trace images (32 flows + 4 initial frames) inspected from trace-images/. All WebP (OMP-resized from PNG). Counts confirmed: baseline A=B=C=D=2; round1 A=1/B=C=D=2; round2 A=B=1/C=D=2; round3 A=B=C=1/D=2. All resets=0. Three reservations at seq 127, 205, 265 precede mutations at seq 133, 214, 274. review.json written with 32 observations (subjectImage fields for all resized WebP frames).

**iterate-evidence-continuation**: 4 flows inspected: interrupted-baseline-increment=2 (IE-001), interrupted-baseline-reset=0; main-post-repair-increment=1 (IE-001 resolved), main-post-repair-reset=0. Reservation at seq 136 (interrupted session) precedes mutation at seq 148. review.json written.

### Saved grade (one invocation)

`npm run evals -- iterate-evidence iterate-evidence-three-rounds iterate-evidence-continuation --grade evals/results/20260920-213545`

**3/3 scenarios passed.**

## Gates

| Command | Result |
|---|---|
| `npm test` | Exit 0; 185/185 pass |
| `node scripts/sync-plugin.mjs --check` | plugin in sync (3.1.0, 37 skills, 7 agents) |
| `node scripts/check-commits.mjs 4458fbf..HEAD` | ok: 46 subjects (at source commit) |
