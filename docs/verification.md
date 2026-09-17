# Verification

The `verify-implementation` phase re-runs what the implementation claims. A session that never saw the implementer's context runs the repository's own checks and every acceptance item the task's artifacts promise, records what each returned, grades the record, and saves a `verification` artifact. It runs after implementation and before the review in every pack that implements code; by hand it is `/verify-implementation` in a fresh session.

The reason it exists is in [research/llm-output-verification.md](research/llm-output-verification.md): agents believe they have succeeded when hidden tests say otherwise, describe checks they did not run, and, under pressure, weaken the tests they were given. The verifier treats the receipts as a list of claims, not as results.

## What the phase does

1. Reads `task.md` (its `## Acceptance criteria` when present), the newest plan or structure outline (`## Desired End State`, every phase's `### Verify` list), every implementation receipt (`### Verify` lines), and for a bugfix the reproduction artifact.
2. Records the revision and diffs the change against the merge target; every changed test file is read for deleted, skipped, or loosened tests and for product code that special-cases test inputs (`T` items).
3. Discovers the repository's checks from the manifest and CI (`package.json` scripts, `Makefile`, `Cargo.toml`, `go.mod`, `pyproject.toml`, the CI file), never from the receipts (`C` items).
4. Collects the acceptance items with their source lines, whether a receipt claimed each one, and how each is decided: a command, a request, or an observation (`A` items). Items nothing on the machine can decide are marked `untested`.
5. Runs every command itself and records exit codes and the decisive output lines; a receipt, a summary, or a CI badge is never a result.
6. Grades: exit codes and exact strings decide first; the rest goes to `judge.mjs grade-steps --kind command`, which returns `pass`, `fail`, or `unclear` with a probability and a severity per item. `unclear` rows are decided by hand and listed for a person.
7. Saves `NN-verification-<slug>.md` with `status: passed`, `failed`, or `blocked`.

## Pack input

Every pack that implements code (`delivery-full`, `delivery-lean`, `delivery-prd`, `delivery-oneshot`, `delivery-bugfix`) runs the `delivery-verify` block by default. `--input verify=false` skips it:

```sh
archon workflow run delivery-lean --branch verbose-flag "Add a --verbose flag"                      # verifies
archon workflow run delivery-lean --branch verbose-flag --input verify=false "Add a --verbose flag"  # skips
```

Epic children are launched with the pack defaults, so they verify.

## What the artifact records

`NN-verification-<slug>.md` carries frontmatter `task`, `type: verification`, `summary`, `status`, `revision`, `target`, then `## Run` (revision, target, where the checks came from, a coverage line saying how many acceptance items the receipts claimed and how many none did, how the grading was done), an items table (id, item, decided by, expected, observed, verdict, confidence, severity), `## Findings` (one entry per failed item: command, expected with its source line, observed, severity), `## Missing` (blocked only), and `## Human Review` with the commands a reviewer re-runs and the untested or hand-decided items a person re-decides.

Verdicts are `pass`, `fail`, or `untested`. Confidence is the helper's probability for the verdict, `1.00` for a deterministic result, `hand` when decided without the helper, so a later calibration pass can read the record. Severity is 0 none, 1 cosmetic, 2 functional, 3 blocking.

## How failures loop back

The `delivery-verify` block is a `loop_group` of three rounds. The session's claimed status is first checked against the artifact by the `verification-status` node (`judge.mjs verification-status`, which only ever moves `passed` toward `failed` or `blocked`; without the helper the claim stands). A `failed` round runs `iterate-implementation` with the artifact's `## Findings` as feedback, commits the artifact, and verifies again in a fresh session, which revises the same artifact in place and re-runs every item. `passed` ends the loop and the pack continues to `app-test` (when asked) and the review. `blocked` commits the artifact and cancels the run; supply what `## Missing` names and start the run again with the same `--input task_dir=`. Three failed rounds fail the node.

By hand the same routing is the reply's command fence: `/review-code` after a pass, `/iterate-implementation @<plan file>` after a failure, `/show-me` when blocked.

## Blocked versus failed

A build or test that fails because of the code is `fail`; the next round fixes it. `blocked` is reserved for reasons outside the change: a runtime or toolchain missing from the machine, a dependency install that needs a credential, a service the tests need that is not reachable. The distinction keeps the fix loop from spinning on something no code change can settle.

## Rules the phase keeps

- It never edits product code, configuration, or tests, and never commits code; only its artifact is committed (`docs(task): verification artifacts`).
- It runs each check as the repository defines it, never a narrowed variant that leaves out the failing part.
- It sends the typed-judgment helper `expected` and trimmed `observed` text only; repository code, diffs, and secrets stay on the machine.
- It quotes output; an error message or a printed value is never paraphrased in `observed`.

## Where the shape comes from

Each rule maps to a source in [research/llm-output-verification.md](research/llm-output-verification.md), "Implications for a verify node": run the checks yourself (SWE-bench grades by running the tests; Anthropic separates the outcome in the environment from the transcript), treat self-reported success as a claim (Anthropic's SWE-bench and long-running-agent posts, METR's reward-hacking reports), fail on tampered checks (the Claude 4 system card), keep the verifier a separate session (self-preference in LLM judges, factored verification in Chain-of-Verification), grade one item against named evidence (FActScore, SAFE, process reward models), deterministic before model judgment (Anthropic and OpenAI grader guidance), give the judge a reference and an `unclear` exit (reference-guided grading in MT-Bench), record probabilities and thresholds (G-Eval, OpenAI `pass_threshold`), and route low confidence to a person (METR's monitors as triage).
