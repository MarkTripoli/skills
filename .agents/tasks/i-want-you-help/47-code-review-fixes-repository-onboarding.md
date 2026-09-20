---
type: code-review-fixes
date: 2026-09-20
branch: i-want-you-help
review_artifact: .agents/tasks/i-want-you-help/46-code-review-repository-onboarding.md
status: passed
summary: "Fixed CR-032 and CR-033 with direct regression coverage. Retained regrading now rejects hard-linked files, and Git environment sanitization removes every case variant before installing controlled configuration overrides."
---

# Code Review Fixes

## Findings Addressed

### CR-032 Retained files can alias external hard links

- resolution: fixed
- implementation: `retainedTreeProblem()` rejects regular files whose link count is not one and duplicate retained `(device, inode)` identities before any retained input is read.
- regression: `regrade rejects retained files with external hard-link aliases`
- commit: `c3e37e2 fix(evals): reject retained hard links`

### CR-033 Mixed-case Git environment keys survive sanitization

- resolution: fixed
- implementation: Environment key filtering now normalizes keys to uppercase before matching the `GIT_` prefix, then installs the controlled config overrides.
- regression: `Git environment sanitization removes every case variant`
- commit: `8a577b2 fix(evals): normalize Git environment keys`

## Verification

- focused environment regression: 1/1 passed
- retained-integrity suite: 34/34 passed
- aggregate offline suite: 249/249 passed
- portable build and generated-tree validation: 44 skills, 0 workers, passed
- inventory: 44 skills, 7 workers, 37 plugin skills
- Node static checks: passed
- Deno static checks: passed
- retained setup run `20260920-205454`: 5/5 scenarios passed, including all 14 safety phases
- whitespace check: passed
- LSP: unavailable because the harness rejects the external task-worktree path; Node, Deno, and repository checks cover the changed JavaScript files.

## Scope Limit

The retained-tree gate protects a static local recording before regrading. It does not claim authenticated evidence or protection from a concurrent writer with filesystem access during regrade.
