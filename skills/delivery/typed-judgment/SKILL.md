---
name: typed-judgment
description: Asks the TypeSafe System One (JEV) model a typed question over text, such as yes/no, one of N or a graded level, and prints a probability or label the caller thresholds instead of parsing prose. Use when a skill step names a judge.mjs command or a workflow node needs a typed judgment; never add a call the step does not ask for.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Typed Judgment

`judge.mjs` in this directory turns a decision the workflow needs about agent or human prose into a typed question for TypeSafe System One (JEV): a probability for a yes/no, one option out of a defined set with a confidence, or a level on a described scale. Code keeps the thresholds and the fallback; the model supplies the reading of the text. `JUDGE_TIMEOUT` (seconds, default 20) bounds the whole call.

## When it runs

Only when a skill step names it. Skills such as `create-epic-plan`, `resolve-pr-reviews`, `review-code`, `test-app`, and `verify-implementation` name the command to run in their steps. Never add a call the step does not ask for.

## Availability and fallback

The helper needs Node 20.12 or later and a TypeSafe key (from [console.typesafe.ai](https://console.typesafe.ai/settings/keys)): `TYPESAFE_API_KEY` in the environment, else the first line of the file `TYPESAFE_API_KEY_FILE` names, else `~/.config/typesafe/api_key` (under `$XDG_CONFIG_HOME` when set). Hooks and agent-spawned shells may not inherit interactive shell exports; write the key file once with `umask 077; mkdir -p ~/.config/typesafe; printf '%s\n' "$TYPESAFE_API_KEY" > ~/.config/typesafe/api_key`. Without a key, or when the service does not answer, every command prints nothing and exits 3. A caller then applies its own deterministic check or the agent's reading in a skill step. Never fail a step because the helper was unavailable, and never ask the user for the key mid-run: mention once in the reply that judgments were skipped.

A request the service rejects as too large exits 3 with `request too large for the model`, is never retried, and means the caller should send fewer questions.

## Commands

Run from the skill's directory under the installed skills (`<skills-dir>/typed-judgment/judge.mjs`). `--json` prints the full answer with probabilities; `@path` reads a file and `-` reads stdin for text arguments.

| Command | Prints | Used by |
| --- | --- | --- |
| `axis-coverage <artifact.md>` | `covered`, `asserted`, `skipped`, or `unclear` per review axis, with a level 0 to 3 | `review-code` |
| `route-workflow [--children file.json] [text]` | the workflow that fits a request, or one per epic child | `create-epic-plan` |
| `size-children --children file.json` | `ok`, `split`, or `unclear` per epic child, with its weakest sizing test and the split to apply | `create-epic-plan` |
| `triage-threads <threads.json>` | `fix`, `discuss`, `decline`, `clarify`, or `undecided` per thread | `resolve-pr-reviews` |
| `feedback-intent [text]` | `revise`, `proceed`, `stop` | human-review steps |
| `slug [request]` | the directory slug picked from code-proposed candidates | `deliver` and task setup |
| `tier [text]` | `small`, `medium`, `large` | delivery routing |
| `grade-steps [--kind screen\|command\|diff] <steps.json>` | `pass`, `fail`, `unclear` and a severity level per step; `screen` (default) grades what a screen showed, `command` what a command, request, or file read returned, `diff` whether a test file's diff against the merge target keeps its strength | `test-app`, `verify-implementation` |
| `rerank --query <text> <candidates.json>` | candidates ordered by how well they answer the question, with a level 0 to 3 | `create-research`, `iterate-research` |
| `coverage <questions.json> <artifact.md>` | `answered`, `partial`, `missing` per research question | `create-research`, `iterate-research` |
| `cite-artifact <artifact>` | `supported`, `unsupported`, `unclear` per backticked `path:line` pointer in the artifact, with its artifact line number (`L<n>`, `line` in JSON), checked against its cited lines; `unresolved` when the file or lines do not exist or lie outside the working directory. Run it from the repository root, since paths resolve from the working directory | `create-research`, `iterate-research` |
| `route-question <questions.json>` | `locate`, `analyze`, `pattern`, `web`, `none`, or `undecided` per question | `create-research-questions`, `iterate-research-questions`, `create-research` |
| `neutral <questions.json>` | `neutral`, `leading`, `unclear` per question | `create-research-questions`, `iterate-research-questions` |

Input shapes: `--children` is `[{name, prompt}]` for `route-workflow` and `[{name, slice, prompt, acceptance}]` for `size-children`; `triage-threads` reads `[{id, author, body, hunk?}]`; `grade-steps` reads `[{id, expected, observed}]`; `rerank` reads `[{id, text}]` (`id` a path or `path:lines`, `text` the excerpt); `coverage`, `route-question`, and `neutral` read `[{id, text}]` questions.

`size-children` asks the four tests of the [slicing guide](https://github.com/MarkTripoli/skills/blob/main/shared/SLICING.md) as one probability each (single obligation, vertical slice, one day, safe to merge alone), plus one probability for whether the child's acceptance sentences name observable state, plus the speculative question of which split would apply. A child fails on whichever test sits furthest below its bar. The effort question carries lower bars than the text questions because the model cannot see the codebase and hedges on every child; the bars come from a calibration set of eight children, four of them one pull request each and four oversize. A child whose `slice` is `enabler` skips the vertical test, since stopping at a layer boundary is what it declares; its consumer is the skill's check, not the model's.

## Rules

- What the command sends leaves the machine: the named artifact, request, feedback, thread bodies, or step observations, nothing else. Do not add repository code, diffs, or secrets to the state.
- Record the judgment where the skill's template has a place for it (the answer word and its probability or confidence), so a reader can see why the workflow branched. An answered call writes `judge: model <model>, tokens <n> in / <m> out` to stderr; record that model and those counts on the same line, so two artifacts that disagree can be compared by version. `jev-latest` resolves to a moving version, which is the reason to pin it in the record.
- Thresholds live in the helper; a skill step overrides none of them. When a printed verdict is `unclear` or `undecided`, the step's own rule decides.
