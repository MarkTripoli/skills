# Verification

`verify-implementation` checks the work in a separate session. It runs the project's checks, checks each promised outcome, and saves a report. Run `/verify-implementation` in a new session after implementation and before review.

An implementation report is a list of claims, not proof. Agents can report checks they did not run or weaken tests. See the [supporting research](research/llm-output-verification.md).

## What the phase does

1. Read `task.md` and its `## Acceptance criteria`, the newest plan or structure outline (`## Desired End State` and each `### Verify` list), every implementation receipt (`### Verify` lines), and the reproduction artifact for a bugfix.
2. Record the revision and diff against the merge target. Read every changed test file for deleted, skipped, or loosened checks and product code that special-cases test inputs (`T` items).
3. Discover checks from the manifest and CI (`package.json`, `Makefile`, `Cargo.toml`, `go.mod`, `pyproject.toml`, and the CI file), never from receipts (`C` items).
4. List promised outcomes with source lines, whether the implementation report claimed them, and how to check them: command, request, or observation (`A` items). Mark outcomes that cannot be checked here as `untested`.
5. Run every command and record exit codes and decisive output lines. A receipt, summary, or CI badge is not a result.
6. Grade with exact exit codes and strings first. Other rows go to `judge.mjs grade-steps --kind command`, which returns `pass`, `fail`, or `unclear` with probability and severity. Decide `unclear` rows by hand and list them for a person.
7. Save `<task-root>/<slug>/artifacts/review/verification/<NNNN>.md` with `status: passed`, `failed`, or `blocked`.

## What the artifact records

`<task-root>/<slug>/artifacts/review/verification/<NNNN>.md` has frontmatter `task`, `type: verification`, `summary`, `status`, `revision`, and `target`, followed by:

- `## Run`: revision, target, check sources, receipt coverage counts, and grading method;
- an items table: id, item, deciding method, expected, observed, verdict, confidence, and severity;
- `## Findings`: one entry per failed item with command, source line, expected, observed, and severity;
- `## Missing`: only for blocked runs;
- `## Human Review`: commands to rerun and untested or hand-decided items to reconsider.

Verdicts are `pass`, `fail`, and `untested`. Confidence is the helper's probability, `1.00` for an exact check, or `hand` when decided without the helper. Severity is 0 none, 1 cosmetic, 2 functional, or 3 blocking.

## How failures loop back

Read the saved artifact status:

- `failed`: run `/iterate-implementation @<plan file>`, then `/verify-implementation` again in a fresh session;
- `passed`: continue with optional app testing and `/review-code`;
- `blocked`: the artifact names the external prerequisite; restore it before rerunning. Use `/show-me` if it helps.

The shared delivery contract preserves any owner-set evidence-repair cap across session replacement and continuation. A no-progress repair stops rather than renewing its allowance. Source changes invalidate the previous verification, review and recorded proof.

## Recorded evidence is a separate completion requirement

Passing repository checks does not satisfy the recorded-behavior gate. Prepare the evidence policy early and capture existing UI behavior, from a temporary worktree at the base commit if implementation has begun. After verification and review, record the current result, inspect the capture against every required target, and compose the authentic `BEFORE`/`AFTER` sessions where required. Net-new behavior uses current-state proof; non-UI work uses captured commands, probes or agent transcripts.

`deliver/contract.mjs` seals and reads evidence. A passed Markdown receipt alone is not sealed evidence: its binding must match the current revision and actual nonempty captures, include the required comparison and inspected targets, and bind the hosted bytes to the local capture (or record `unverified` with a reason). `status` lists what publication still lacks; the final reviewer judges it. The workflow reference documents [status](../workflows/delivery.md#executable-delivery-status).

## Blocked versus failed

A build or test failure caused by the change is `fail` and returns to the fix loop. `blocked` means an outside prerequisite is missing, such as a runtime or toolchain, a credentialed dependency install, or an unreachable service. Code cannot settle a blocked condition.

## Rules the phase keeps

- It never edits product code, configuration, or tests and never commits code. Its artifact stays in the local task directory.
- It runs each repository-defined check, never a narrowed variant that omits the failing part.
- It sends the typed-judgment helper only `expected` and trimmed `observed` text. Repository code, diffs, and secrets stay on the machine.
- It quotes output. `observed` never paraphrases an error or printed value.

## Where the shape comes from

[research/llm-output-verification.md](research/llm-output-verification.md), "Implications for a verify node," maps the rules to evidence: run checks yourself (SWE-bench and Anthropic's environment/transcript separation); treat self-reported success as a claim (Anthropic, METR); reject tampered checks (the Claude 4 system card); use a separate verifier session (self-preference research and Chain-of-Verification); grade each item against named evidence (FActScore, SAFE, process reward models); use deterministic checks before model judgment (Anthropic and OpenAI grader guidance); give the judge a reference and an `unclear` result (MT-Bench); record probabilities and thresholds (G-Eval and OpenAI `pass_threshold`); and route low-confidence results to a person (METR monitors).