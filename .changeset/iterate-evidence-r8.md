---
"@marktripoli/skills": patch
---

fix(iterate-evidence): R8 initial-frame structural binding (F4), reservation step recognition (F5), three-rounds min budget

**F4 — initial frames now structurally bound to pre-click time:**
- Both capture fixtures (`iterate-evidence` and `iterate-evidence-three-rounds`) add a 1-second dwell after `mark("initial")` so the video encodes at least one clean counter-zero frame before the first click.
- `SKILL.md` steps 3 and 4 now require extracting the initial-zero frame at the manifest's `initial` action `videoTime` (from `capture.json`'s `actions` array) using an explicit timestamp selector (e.g., `read video.webm:Ts`); the recorder-generated `test_start` frame is explicitly forbidden as the initial-zero frame.
- `inspection_acceptance.md` adds a dedicated bullet under timing rules: the initial-zero frame must be extracted strictly before the first click action's `videoTime`; name the file to include `initial` and cite the timestamp.
- Grader (`reviewProblems`) now requires: (a) `baseline-initial` and `repaired-initial` frame filenames must contain `initial`; (b) when `capture.actions` is present, `rawTimestamp` must be strictly before the first non-initial action's `videoTime`.

**F5 — `reservation` recognized as valid pending-repair current step:**
- `activeReservation` individual `current step` handler now accepts `clean(value) === "reservation"` in addition to `pending(value)`.
- Combined three-way key handler accepts `clean(parts[0]) === "reservation"` when `pending(parts[2])` (next incomplete step is repair).
- Rejected when next step is not repair (individual `next incomplete step` handler pushes false).
- Regressions added: two accepted forms (three-labeled-line and combined slash form with `reservation` current step + `repair` next step); two rejected forms (`reservation` with `checks` or other non-repair next step).

**Three-rounds — per-scenario minimum budget:**
- `iterate-evidence-three-rounds.mjs` declares `minMinutes: 45`.
- `evals/run.mjs` computes `max(--max-time, scenario.minMinutes ?? 0)` before passing to `runEvidenceScenario`; the 25-minute CLI default no longer undercuts the proven three-rounds minimum.
- `docs/testing.md` documents the `minMinutes` field and the three-rounds 45-minute requirement.
