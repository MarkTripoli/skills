---
type: code-review-fixes
date: 2026-09-21
branch: we-need-do-something
review_artifact: 09-code-review-issue-granularity.md
reviewed_head_sha: 06d428d4e9c485789316cafadebcb4332bf282ba
fixed_head_sha: 7c7f5275df7ecd45edb8552ec87bbd8cbe14f60f
status: complete
summary: "Both advisories fixed per request. ADV-001: replaced the em dash at create-epic-plan:27 with a colon. ADV-002: removed the inline 200-400 restatement from create-epic-plan and create-structure-outline; shared/SLICING.md is now the only place the number lives. validate.mjs and sync-plugin.mjs --check pass."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: none; reviewed HEAD `06d428d` is still the tip's parent lineage, only these two follower edits added on top.
- unrelated changes preserved: yes; only the two follower `SKILL.md` files changed. `.pi/` scratch directory remains untracked and untouched.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

`None.` (the review recorded no critical- or major-severity findings)

## Advisory Decisions

### ADV-001 Em dash violates WRITING.md

- disposition: accepted
- reason: user directed treating it as actionable. The U+2014 em dash at `create-epic-plan/SKILL.md:27` was replaced with a colon, satisfying WRITING.md's "No em dashes". Confirmed no em dash remains in the file.

### ADV-002 Size number duplicated inline in two followers

- disposition: accepted
- reason: user directed removing the inline restatement. The "200-400 lines" number is deleted from `create-epic-plan/SKILL.md:27` and `create-structure-outline/SKILL.md:21`; both now reference the guide's advisory size signal by name. `shared/SLICING.md:14` is the only place the number lives. The four tests remain the binding gate in both followers.

## Verification

- command: `grep -rn "200-400" shared/ skills/`; `grep -n $'\u2014' skills/delivery/create-epic-plan/SKILL.md`; `node scripts/validate.mjs`; `node scripts/sync-plugin.mjs --check`
- result: `200-400` matches only `shared/SLICING.md:14`; no em dash in `create-epic-plan`; validate exits ok (47 skills, 0 banned tokens, Atomic entry checked); sync reports in sync (version 3.3.0).

## Remaining Blocks

- None.
