---
task: we-need-do-something
type: verification
summary: "Re-ran the repository's full test suite and every acceptance item the plan and implementation receipt promised, from a session that did not write the code. After `npm ci` installed the previously-missing `yaml` dependency, `npm test` (validate.mjs, sync-plugin --check, 234 node tests, and the safety-dance Go suite with e2e) exits 0, and all eleven documentation acceptance items are present with line 6 unchanged in every edited skill. No item failed; status is passed. The next phase is review."
status: passed
revision: 5490cbc
target: main
---

# Verification

## Run

- Revision: `5490cbc` on `we-need-do-something`; tree clean except an untracked `.pi/` scratch directory (not part of the change).
- Target: `main`; 25 files changed vs `main...HEAD`, 0 of them test files (the size-granularity work is Markdown-only; the version-bump/CHANGELOG/plugin.json/changeset-deletion files come from pre-existing release commits `5bfb4ae`/`b85f65b` on the branch, not this task).
- Checks from: `package.json` `test` script (the same command `.github/workflows/tests.yml` runs via `npm test`).
- Coverage: 11 acceptance items; all 11 claimed by the implementation receipt's completed work, 0 claimed by none.
- Graded by: own judgment not needed — every item decided deterministically by exit code or exact-string grep; the typed-judgment helper was not invoked because no prose row remained.

## Items

| Id | Item | Decided by | Expected | Observed | Verdict | Confidence | Severity |
|---|---|---|---|---|---|---|---|
| C1 | Repository test suite | `npm ci && npm test` | Exits 0 with no failing test | Installed 116 pkgs; validate ok (47 skills, 0 banned); sync-plugin in sync (3.3.0); node tests 234 pass / 0 fail; safety-dance Go suite + e2e all `ok`, packager tests 3 pass; exit 0 | pass | 1.00 | 0 |
| A1 | SLICING carries advisory size signal ahead of the four tests (06-plan:DES) | `grep`, header inspection | `## Size signal (advisory)` present between `## The unit` and `## Four tests` | Header at line 11, between `## The unit` (7) and `## Four tests` (18); four tests remain the binding gate | pass | 1.00 | 0 |
| A2 | Follower sentence names exactly the four followers (06-plan:1.1) | `grep -q '...create-plan`, and `create-prd` follow it'` | Names `create-epic-plan`, `create-structure-outline`, `create-plan`, `create-prd` | Line 2 matches exactly | pass | 1.00 | 0 |
| A3 | start-epic-delivery described separately as re-validating (06-plan:1.1) | `grep -q '`start-epic-delivery` re-validates'` | Separate re-validation sentence present | Present in SLICING intro | pass | 1.00 | 0 |
| A4 | Old follower sentence removed (06-plan:1.1) | `grep` for old string | Old `start-epic-delivery`, `create-structure-outline`, and `create-prd` sentence gone | Not found | pass | 1.00 | 0 |
| A5 | create-plan links `shared/SLICING.md` (06-plan:2.1) | `grep -q "shared/SLICING.md"` | Guide linked in create-plan | Present in read-inputs step | pass | 1.00 | 0 |
| A6 | create-plan runs per-phase four-tests re-check (06-plan:2.2) | `grep -qi "re-size each outline phase"` | Re-size step before write step | Step 4 re-sizes, step 5 writes (renumbered correctly) | pass | 1.00 | 0 |
| A7 | create-epic-plan size-signal pre-check (06-plan:3.1) | `grep -qi "size signal"` | Size signal ahead of four tests | Present in step 5 | pass | 1.00 | 0 |
| A8 | create-epic-plan prefer-shared-contract rule (06-plan:3.2) | `grep -qi "shared shape is not a dependency"` | Prefer shared contract over `depends_on` | Present in `## Child Rules` depends_on bullet (line 47) | pass | 1.00 | 0 |
| A9 | create-structure-outline references size signal (06-plan:4.1) | `grep -qi "size signal"` | Size signal ahead of its four tests | Present in step 5 | pass | 1.00 | 0 |
| A10 | start-epic-delivery cites SLICING, no re-sizing (06-plan:4.2) | `grep`, step-4 inspection | Cites `shared/SLICING.md` re-validating slice without re-sizing | Step 4 re-validates recorded `slice` against SLICING "without re-sizing it, since sizing was decided in create-epic-plan"; not a four-tests follower | pass | 1.00 | 0 |
| A11 | One `.changeset/` entry describes the change (06-plan:4.3) | `ls .changeset/*.md | grep -qv README config`; read | New patch entry exists | `slice-granular-pull-requests.md`, `@marktripoli/skills: patch`, describes all four phases | pass | 1.00 | 0 |
| A12 | line 6 stays the shared writing-guide sentence in every edited skill (06-plan:DES) | `sed -n '6p' | grep "writing guide"` | Line 6 unchanged in all four edited skills | create-plan, create-epic-plan, create-structure-outline, start-epic-delivery all pass | pass | 1.00 | 0 |

Verdicts: `pass`, `fail`, or `untested`. Deterministic verdicts (exit code, exact string) record `1.00`. Severity: 0 none, 1 cosmetic, 2 functional, 3 blocking.

## Findings

None.

## Missing

None.

## Human Review

### Review targets

- The items table above (C1 plus A1–A12).
- The exact size-signal wording (200-400 changed lines, generated code and lockfiles excluded) carried into `shared/SLICING.md` and referenced by the followers.
- That `start-epic-delivery` received a re-validation citation only, not a four-tests follower link.

### Verify

- [ ] Run `npm ci && npm test`; it exits 0 (validate ok, plugin in sync, 234 node tests pass, safety-dance Go suite and e2e `ok`).

### Known limits

- The tree carries an untracked `.pi/` scratch directory, unrelated to the change; the checks ran against the tree as it is.
- The task branch includes pre-existing release commits (`5bfb4ae` version bump, `b85f65b` merge) ahead of `main` that touch `package.json`, `CHANGELOG.md`, `.claude-plugin/plugin.json`, and delete consumed changesets; these are not part of the size-granularity task and were not graded as acceptance items.
- The implementation receipt reported `atomic-controller` and `install` tests failing with a missing `yaml` package; that was only because dependencies were not installed. After `npm ci` those tests pass, so no failure remains.
- Documentation-only change: `validate.mjs` checks layout, line 6, template shape, and banned tokens but not the size-signal prose or follower wording; those are confirmed here by exact-string grep and header/step inspection.
