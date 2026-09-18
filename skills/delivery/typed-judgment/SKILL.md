---
name: typed-judgment
description: Run when a skill step or workflow node asks for a typed judgment over text. Ask the TypeSafe System One model a yes/no, one-of-N, or graded question and get a probability the caller thresholds, instead of parsing prose.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Typed Judgment

`judge.mjs` in this directory turns a decision the workflow needs about agent or human prose into a typed question for the TypeSafe System One model (`jev`): a probability for a yes/no, one option out of a defined set with a confidence, or a level on a described scale. Code keeps the thresholds and the fallback; the model supplies the reading of the text. One attempt takes well under a second and a few thousand tokens; a rate-limited or failing attempt is retried inside `JUDGE_TIMEOUT`, so the worst case is the timeout, 20 seconds by default, and not the round trip.

## When it runs

Only when a skill step or a pack node names it. The packs call it from bash nodes; skills such as `create-epic-plan`, `resolve-pr-reviews`, `test-app`, and `verify-implementation` name the command to run in their steps. Never add a call the step does not ask for.

## Availability and fallback

The helper needs `TYPESAFE_API_KEY` in the environment (from [console.typesafe.ai](https://console.typesafe.ai/settings/keys)). Without it, or when the service does not answer, every command prints nothing and exits 3; `extract-json` prints its input unchanged instead. A caller then applies its own rule: the pack's deterministic check, or the agent's own reading in a skill step. Never fail a step because the helper was unavailable, and never ask the user for the key mid-run: mention once in the reply that judgments were skipped.

`TYPESAFE_BASE_URL` points the helper at another endpoint (tests use a stub); `TYPESAFE_DEFAULT_MODEL` picks the model; `JUDGE_TIMEOUT` is seconds, default 20, and bounds the whole call; `JUDGE_RETRIES` is how many transient failures (429, 529, any 5xx) are retried with `retry-after` or exponential backoff, default 2. A request the service rejects as too large exits 3 with `request too large for the model`, is never retried, and means the caller should send fewer questions.

## Commands

Run from the skill's directory under the installed skills (`<skills dir>/typed-judgment/judge.mjs`). `--json` prints the full answer with probabilities; `@path` reads a file and `-` reads stdin for text arguments.

| Command | Prints | Used by |
| --- | --- | --- |
| `plan-remaining <plan.md>` | `done`, `remaining`, `no-phases`, `unclear`; `--json` adds `next` | implement block |
| `review-status <artifact.md> <claimed>` | effective `clean`, `findings`, `blocked`; moves a claim only toward the safer status | review block |
| `reproduction-status <artifact.md> <claimed>` | `reproduced` or `not-reproduced` | bugfix pack |
| `verification-status <artifact.md> <claimed>` | effective `passed`, `failed`, `blocked`; moves a claim only toward the safer status | verify block |
| `extract-json --required a,b --enum status=x,y [--dir d] [file]` | the JSON object an answer contains or implies, else the answer as is | generated omp packs |
| `route-workflow [--children file.json] [text]` | the pack that fits a request, or one per epic child | task node, `create-epic-plan` |
| `size-children --children file.json` | `ok`, `split`, or `unclear` per epic child, with its weakest sizing test and the split to apply | `create-epic-plan` |
| `triage-threads <threads.json>` | `fix`, `discuss`, `decline`, `clarify`, or `undecided` per thread | `resolve-pr-reviews` |
| `feedback-intent [text]` | `revise`, `proceed`, `stop` | gate blocks |
| `slug [request]` | the directory slug picked from code-proposed candidates | task node |
| `tier [text]` | `small`, `medium`, `large` | task node, launch scripts |
| `autonomy [text]` | `none`, `pr`, `plan`, `all`: how much the request wants a person involved | `delivery-start`, `deliver` |
| `grade-steps [--kind screen\|command\|diff] <steps.json>` | `pass`, `fail`, `unclear` and a severity level per step; `screen` (default) grades what a screen showed, `command` what a command, request, or file read returned, `diff` whether a test file's diff against the merge target keeps its strength | `test-app`, `verify-implementation` |
| `rerank --query <text> <candidates.json>` | candidates ordered by how well they answer the question, with a level 0 to 3 | `create-research`, `iterate-research` |
| `coverage <questions.json> <artifact.md>` | `answered`, `partial`, `missing` per research question | `create-research`, `iterate-research` |
| `cite <claims.json>` | `supported`, `unsupported`, `unclear` per claim against its fetched source lines | `create-research`, `iterate-research` |
| `route-question <questions.json>` | `locate`, `analyze`, `pattern`, `web`, `none`, or `undecided` per question | `create-research-questions`, `create-research` |
| `neutral <questions.json>` | `neutral`, `leading`, `unclear` per question | `create-research-questions`, `iterate-research-questions` |
| `ask --state <json> --questions <json>` | the raw answers object | ad hoc |

Input shapes: `--children` is `[{name, prompt}]` for `route-workflow` and `[{name, slice, prompt, acceptance}]` for `size-children`; `triage-threads` reads `[{id, author, body, hunk?}]`; `grade-steps` reads `[{id, expected, observed}]`; `rerank` reads `[{id, text}]` (`id` a path or `path:lines`, `text` the excerpt); `coverage`, `route-question`, and `neutral` read `[{id, text}]` questions; `cite` reads `[{id, claim, source}]` where `source` is the text at the claim's `path:line` pointer, fetched by the caller.

`size-children` asks the four tests of the [slicing guide](https://github.com/MarkTripoli/skills/blob/main/shared/SLICING.md) as one probability each (single obligation, vertical slice, one day, safe to merge alone), plus one probability for whether the child's acceptance sentences name observable state, plus the speculative question of which split would apply. A child fails on whichever test sits furthest below its bar. The effort question carries lower bars than the text questions because the model cannot see the codebase and hedges on every child; the bars come from a calibration set of eight children, four of them one pull request each and four oversize. A child whose `slice` is `enabler` skips the vertical test, since stopping at a layer boundary is what it declares; its consumer is the skill's check, not the model's.

## Rules

- What the command sends leaves the machine: the named artifact, request, feedback, thread bodies, or step observations, nothing else. Do not add repository code, diffs, or secrets to the state.
- Record the judgment where the skill's template has a place for it (the answer word and its probability or confidence), so a reader can see why the workflow branched.
- Thresholds live in the helper; a skill step overrides none of them. When a printed verdict is `unclear` or `undecided`, the step's own rule decides.
