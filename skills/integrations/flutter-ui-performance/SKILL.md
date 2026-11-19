---
name: flutter-ui-performance
description: Audits the list and screen rebuilds of a Flutter app, ranks each finding by impact and risk, then fixes one screen per slice with tests that fail on the base and a rebuild-scope test. Use when the user runs /flutter-ui-performance or reports jank, too many rebuilds, a list that flashes or flickers on sync or reload, setState in a list, expanded rows that collapse after scrolling, or slow ListView performance; not for a single reproduced functional bug (use /fix-bug).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Flutter UI performance

Audit first, then fix one screen per slice. A slice is one screen (or one shared list widget) and the rules it needs, in one reviewable change with its tests.

Discover the app root, Flutter version, SDK wrapper, and test commands from repository instructions and configuration. Examples use a fictional Teams screen, not a required project structure. Audit-only requests stop before implementation.

Copy this checklist and tick it off:

```
UI performance progress:
- [ ] 1. Audit: every list screen inventoried, ranked by impact and risk
- [ ] 2. Slice chosen: one screen, its rules, its tests named
- [ ] 3. Rules applied
- [ ] 4. Reload concurrency checklist done (only when a Loading state is replaced)
- [ ] 5. Proof: each new test fails on the base and passes on the change
- [ ] 6. Reported: audit, slice, proof, follow-ups
```

## 1. Audit

Inventory every screen that renders a scrolling list, using the signals and search commands in [references/audit.md](references/audit.md). Read code; change nothing in this step.

For each screen record: `setState` sites and what each rebuilds, `ListView(children:)` or a builder, cache extent, per-item `State` lost when the row scrolls off, whether the state class has `==`, per-item work (sorting, filtering, lookups inside `itemBuilder`), and where a reload clears data so the UI shows unknown as empty.

Rank by impact times risk:

- Impact: what the user sees (flash, lost expansion, jank on tap) times how often (every sync, every tap, once per open). A static list of a few rows has no impact.
- Risk: how much behavior the fix touches. Moving a flag into a notifier is low. Replacing a Loading state is high, because Loading often acts as a concurrency guard (step 4).

Write the audit as the table in the reference, highest rank first, with `path:line` for each finding. Put it in the reply. If a task directory is supplied, record the audit using that task's artifact and root contracts from the collection conventions; never edit an indexed immutable artifact or assume a task-root path.

## 2. Choose a slice

Take the highest-ranked screen. Pick the rules it needs from [references/rebuild-rules.md](references/rebuild-rules.md) and name, before editing, the test that proves each one (step 5).

- The slice replaces a Loading state with keep-loaded-during-reload: it is a concurrency change. Plan the guards in step 4 before code, and give each guard its own test.
- The fix is adding `==` to a state class so unchanged emissions are skipped: make it a separate slice. A wrong `==` hides real updates, so list it as a candidate and do not bundle it.
- A shared list widget used by several screens needs a new option: add it as optional, with a default that leaves every caller unchanged.

## 3. Apply the rules

Follow [references/rebuild-rules.md](references/rebuild-rules.md). The short form:

1. Keep data in the view model; the widget only renders.
2. Unknown is not empty: while a value is unknown, show the last known value read-only, with no actions. A known value, including empty, replaces it.
3. Per-item notifiers instead of parent `setState` for per-item UI state.
4. Local UI state that must survive scroll-off (expanded, selected) lives in the view model, outside the published state.
5. Prefetch rows with `scrollCacheExtent: const ScrollCacheExtent.viewport(1.5)` (Flutter 3.41 and later), not keep-alive and not the deprecated `cacheExtent`.
6. Stable keys (`ValueKey(row.id)`) on stateful rows.
7. Work once per state: sort and filter once per build or once per published state, never per item.
8. Paging resets only when the scope or filters change or the list becomes empty.
9. Kept rows show during a reload only when filters and scope are unchanged since the last settled render.

## 4. Reload concurrency checklist

Only when the slice stops publishing a Loading state during reload. Work through [references/reload-concurrency.md](references/reload-concurrency.md): list every caller that relied on Loading as a guard, add the reload flag and the newest-load check, and write one Completer-gated test per guard that fails when the guard is removed. Have the plan reviewed for races before writing code.

## 5. Prove it

Follow [references/proof.md](references/proof.md). Tests run with the app's own Flutter SDK (`flutter test`); without one, write the tests, say they were not run, and stop before claiming proof.

1. Behavior tests at the screen boundary that fail on the base: expansion survives scroll-off, no flash of empty during reload, page count kept after a new list object, row `State` kept after an insert above.
2. A rebuild-scope test with `debugPrintRebuildDirtyWidgets`, restored in `finally`, asserting only the touched row rebuilt. When the base already rebuilt only that row, label the test a regression guard, not proof of the fix.
3. Prove each new test fails without its fix in an isolated temporary worktree containing the base source and the new tests. Keep the working checkout and its dirty files untouched. Do not use a shared `git stash`.
4. Live before and after captures, when the repository requires them, with the emulator caveat in the reference.

## 6. Report

Reply with the audit table (or its link), the slice done with its `path:line` changes, each test with its result on the base and on the change, and the remaining ranked rows as follow-ups. List `==` candidates as separate follow-ups.
