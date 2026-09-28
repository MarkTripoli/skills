# Verification

`verify-implementation` checks the work in a separate session. It runs the project's checks, checks each promised outcome, and saves a report. Atomic runs it after implementation and before review unless disabled. By hand, run `/verify-implementation` in a new session.

An implementation report is a list of claims, not proof. Agents can report checks they did not run or weaken tests. See the [supporting research](research/llm-output-verification.md).

## What the phase does

1. Read `task.md` and its `## Acceptance criteria`, the newest plan or structure outline (`## Desired End State` and each `### Verify` list), every implementation receipt (`### Verify` lines), and the reproduction artifact for a bugfix.
2. Record the revision and diff against the merge target. Read every changed test file for deleted, skipped, or loosened checks and product code that special-cases test inputs (`T` items).
3. Discover checks from the manifest and CI (`package.json`, `Makefile`, `Cargo.toml`, `go.mod`, `pyproject.toml`, and the CI file), never from receipts (`C` items).
4. List promised outcomes with source lines, whether the implementation report claimed them, and how to check them: command, request, or observation (`A` items). Mark outcomes that cannot be checked here as `untested`.
5. Run every command and record exit codes and decisive output lines. A receipt, summary, or CI badge is not a result.
6. Grade with exact exit codes and strings first. Other rows go to `judge.mjs grade-steps --kind command`, which returns `pass`, `fail`, or `unclear` with probability and severity. Decide `unclear` rows by hand against the independent oracle or direct observation; if that still cannot prove an acceptance item, leave it `untested`.
7. Save `NN-verification-<slug>.md` with `status: passed`, `failed`, or `blocked`. `passed` requires every acceptance item to have an independently meaningful oracle or direct observation recorded as `pass`. Any unproved acceptance item makes the result `blocked`, even when all commands pass; name the missing proof in `## Missing` and add a human `### Verify` checkbox. Contradicted evidence is `failed`.

Acceptance proof must test the promised observable result, not merely show that a command exited zero. Reject circular expected values, assertions that do not constrain the behavior, and tests whose setup does not reach the claimed path. Such tests may be reported as green repository checks, but cannot prove acceptance or permit controller advancement.

## Optional workflow input

The Atomic `delivery` workflow verifies by default:

```text
/workflow delivery request="Add a --verbose flag" workflow=lean branch=verbose-flag
/workflow delivery request="Add a --verbose flag" workflow=lean branch=verbose-flag verify=false
```

`verify=false` deliberately skips independent verification. It does not turn an unverified result into a pass. Standalone use needs no Atomic installation.

## What the artifact records

`NN-verification-<slug>.md` has frontmatter `task`, `type: verification`, `summary`, `status`, `revision`, and `target`, followed by:

- `## Findings`: one entry per contradicted item with command, source line, expected, observed, and severity;
- `## Missing`: unproved acceptance evidence or external prerequisites for blocked runs;
- `## Human Review`: commands to rerun and untested or hand-decided items to reconsider.

Verdicts are `pass`, `fail`, and `untested`. Confidence is the helper's probability, `1.00` for an exact check, or `hand` when decided without the helper. Severity is 0 none, 1 cosmetic, 2 functional, or 3 blocking.

## How failures loop back

Atomic reads the saved artifact before choosing the next step:

- `failed` routes to `iterate-implementation`, then a fresh verification stage checks the repair;
- `passed` continues toward optional app testing and review;
- `blocked` names missing acceptance proof or an external prerequisite and does not continue silently.

`max_steps` bounds repair sessions. Supply missing prerequisites before native resume or a new run with the existing `task_dir`.

By hand, use `/review-code` after a pass, `/iterate-implementation @<plan file>` after a failure, and `/show-me` when blocked.

A build or test failure caused by the change is `failed` and returns to the fix loop. `blocked` means acceptance is not proven or an outside prerequisite is missing; it never advances delivery. For an unproved acceptance item, `## Missing` names the exact oracle or observation still required, and `### Verify` gives the human a concrete way to obtain it.


## Rules the phase keeps

- It never edits product code, configuration, or tests and never commits code. Only its artifact is committed: `docs(task): verification artifacts`.
- It runs each repository-defined check, never a narrowed variant that omits the failing part.
- It sends the typed-judgment helper only `expected` and trimmed `observed` text. Repository code, diffs, and secrets stay on the machine.
- It quotes output. `observed` never paraphrases an error or printed value.

## Where the shape comes from

[research/llm-output-verification.md](research/llm-output-verification.md), "Implications for a verify node," maps the rules to evidence: run checks yourself (SWE-bench and Anthropic's environment/transcript separation); treat self-reported success as a claim (Anthropic, METR); reject tampered checks (the Claude 4 system card); use a separate verifier session (self-preference research and Chain-of-Verification); grade each item against named evidence (FActScore, SAFE, process reward models); use deterministic checks before model judgment (Anthropic and OpenAI grader guidance); give the judge a reference and an `unclear` result (MT-Bench); record probabilities and thresholds (G-Eval and OpenAI `pass_threshold`); and route low-confidence results to a person (METR monitors).