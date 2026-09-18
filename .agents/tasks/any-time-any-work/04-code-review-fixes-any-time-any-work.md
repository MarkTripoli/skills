---
type: code-review-fixes
date: 2026-09-17
branch: any-time-we-do
review_artifact: 03-code-review-any-time-any-work.md
reviewed_head_sha: d15a47e2c35197e8974f846481dc64f5d93a2baa
fixed_head_sha: 9b0c8a2162422a0077186d8c3fd2a88812d9228b
status: complete
summary: "Both major findings addressed. CR-002 (the delivery.md self-contradiction) is fixed. CR-001 (unrelated, unverified deliver-starts-run change) is resolved by option 2 at the user's direction: the change is folded into this task's stated scope and acceptance so it is verified before merge, rather than split to its own branch. Both advisories accepted. npm test exits 0, 61 tests, 0 failures."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: none. Review HEAD was `d15a47e`; the branch then gained `788c4d4` (the `03` review artifact) before this pass. Base `main` unmoved. `git status` clean apart from the untracked `.ignore`, unchanged.
- unrelated changes preserved: the untracked `.ignore` was left untouched; no unrelated tracked file was modified.

## Finding Dispositions

### CR-001 — Unrelated, unverified change bundled into the worktree task

- disposition: fixed (option 2, per user)
- evidence: The review offered two remedies. Splitting `d15a47e` out rewrites branch history, so the user was asked and chose option 2: keep the change on this branch and bring it into scope with acceptance. `task.md` now has a `## Scope` section naming both behaviors (worktree default; deliver starts the run) and an `## Acceptance` section with the deliver-starts-run items the verification will exercise. The change is therefore no longer out of scope; it is documented, and its behavior has acceptance items that `/verify-implementation` must re-run against current HEAD (verification `02` is pinned at `b6ad5a2`, before `d15a47e`).
- files changed: `.agents/tasks/any-time-any-work/task.md`
- regression check: `node scripts/validate.mjs` via `npm test`; prose/scope change only, no code path.
- residual: the deliver-starts-run behavior still needs `/verify-implementation` to re-run against a current revision so its two acceptance items are graded; that is a verification-phase action, not a fix-phase one, and is flagged in Remaining Blocks.

### CR-002 — workflows/delivery.md contradicts itself about what `deliver` does

- disposition: fixed
- evidence: `workflows/delivery.md:18` read "makes the same call and prints the command"; it now reads "makes the same call, starts the run in the foreground, and replies with the run id and the first pause", matching the table row at `:238`, `docs/cheatsheet.md:22`, and `SKILL.md` step 4. `grep -rn 'prints the command'` across `workflows/`, `docs/`, `AGENTS.md`, `runtimes/`, and `skills/delivery/deliver/` returns no deliver match (the only `prints the commands` hit is the unrelated `delivery-wave` row at `:52`).
- files changed: `workflows/delivery.md`
- regression check: `npm test` (validator + pack tests) exits 0.

## Advisory Decisions

### ADV-001 — workflows/delivery.md omits the `git worktree remove` line

- disposition: accepted
- reason: The receipt claimed all three docs carry the removal line; `workflows/delivery.md` did not. Added `git worktree remove <path>` after the merge to the "Running skills by hand" section so the three docs agree and the receipt's claim holds. `grep -c 'worktree remove' workflows/delivery.md` now returns 1.

### ADV-002 — "already in a worktree" skip case matches any worktree, not this task's

- disposition: accepted
- reason: This is the worktree rule this task owns, and the over-broad test could wrongly skip when a session sits in a different task's worktree. Rewrote the first skip bullet in `shared/CONVENTIONS.md` to key on being on branch `<slug>` (the task's own worktree), and noted that `git worktree add` runs the same from any worktree so being in another task's worktree still opens the correct one. Low-risk, in-scope prose fix.

## Verification

- command: `npm test`
- result: exit 0; `ok: 41 skills, 54 answer templates, 20 human-review templates, 0 banned tokens, packs checked`, then `tests 61`, `pass 61`, `fail 0`, `skipped 0`.
- command: `grep -rn 'prints the command' workflows/ docs/ AGENTS.md runtimes/ skills/delivery/deliver/`
- result: no deliver match; contradiction gone.

## Remaining Blocks

- The deliver-starts-run behavior (folded in under CR-001) needs `/verify-implementation` to re-run against current HEAD so its two acceptance items in `task.md` are graded; verification `02` predates that commit. This is a verification-phase action outside this fix pass.
- The by-hand `/deliver` worktree path still needs a live non-Archon agent session to confirm (verification A3, unchanged); no automated check exercises the new prose.
