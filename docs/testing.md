# Testing and evaluation

The collection is tested at three depths. The first two cost no tokens and run in seconds; the third runs real agents and is measured, not asserted.

| Layer | Command | Tokens | Answers |
|---|---|---|---|
| Static validation | `npm run validate` | none | Are the files well formed: frontmatter, shared links, templates, fences, banned words, and does the phase table match the code? |
| Simulation | `npm run simulate -- <scenario>` and `node --test tests/` | none | Does the workflow wiring hold end to end: does every reply's fence name the command the table predicts, do gates stop where the table says, does recovery from artifacts alone work? |
| Evaluation | `npm run eval -- --driver <omp\|claude\|codex>` | yes | Does a real agent, following a skill, produce the artifact and reply the contract requires, how often (pass@k), and at what cost? |

`npm test` runs the first two.

## What is deterministic and what is not

The workflow has two halves. The state machine (which command comes next, whether the last phase was a gate, which backend to use, what the status report says) is pure logic over files in `.agents/tasks/<slug>/`. The phase work (research, planning, implementation) needs a model.

The state machine lives in code: `skills/run-task/scripts/workflow.mjs`, a dependency-free Node module that ships inside the `run-task` skill so an installed copy is self-contained. `run-task` calls it (`next`, `status`, `create-task`) instead of reasoning through the phase table, the simulator drives it, the eval harness grades with it, and a runtime plugin can import it. `scripts/validate.mjs` checks that its `PHASES` table and the human-readable table in `workflows/delivery.md` agree, so the two cannot drift.

Only the phase work needs tokens, and only the eval layer spends them.

## Static validation

`scripts/validate.mjs` checks, in order: the `skills/` layout and count; frontmatter keys and names; the shared-document links on line 6; every `references/` file a skill mentions exists; every answer template ends with one `text` fence naming an existing skill and carries the fresh-session sentence exactly once (terminal `/show-me` replies excepted); human-review templates have the four review headings; implementation templates declare `type` and `completed_phase`; human-gate answers carry `{artifact_link}`, a `Check:` line, and the approval sentence; banned host tokens are absent from every file; `workflows/delivery.md` mentions every skill; and the phase table matches `workflow.mjs`.

Run it on a generated runtime tree with `node scripts/validate.mjs --root dist/<runtime>`.

## Simulation

`scripts/simulate.mjs` is a fake agent. Given a phase, it writes the artifact from the skill's real template (frontmatter kept, placeholders filled with fixture text) and the reply from the skill's real answer template (variant chosen the way the skill would choose it), then validates both. The chain runner loops `nextCommand` from `workflow.mjs`, runs the fake phase, and asserts that the fence the template produced is the command the table predicted. That single assertion, repeated across a whole chain, is what proves the wiring: templates, table, worktree probe, and reply parser agree.

Scenarios:

```sh
npm run simulate -- full          # research-questions through pull request, plan with two phases
npm run simulate -- lean          # workspace disabled: outline hands straight to implement-outline
npm run simulate -- prd           # fixture is a git worktree: plan hands straight to implement-plan
npm run simulate -- oneshot
npm run simulate -- review-loop   # review-code findings -> fix-code-review -> review-code clean -> describe-pr
npm run simulate -- iterate       # changes requested at the plan gate; iterate-plan re-presents the gate
npm run simulate -- epic          # epic plan -> child task directories -> each child's start command
npm run simulate -- recovery      # replies/ deleted mid-chain; next command derived from artifacts alone
```

Each prints one line per step (`NN  <skill>  -> <next command>  [gate]`) and exits 1 on any validation issue. `--keep` leaves the temp fixture on disk so you can open the files. `node scripts/simulate.mjs phase <skill> <task dir>` runs one fake phase against a real task directory, which is how the eval harness tests itself without a model.

`tests/workflow.test.mjs` covers the module directly (reply parsing and validation, plan checkbox accounting, artifact listing, next-command decisions including loop ends, backend choice, status report shape, task creation, worktree probe). `tests/simulate.test.mjs` runs every scenario above and asserts the observed skill sequence and gate positions against the chains in `workflows/delivery.md`.

What simulation cannot tell you: whether a model following `create-plan` writes a good plan. It proves the contract around the model, not the model.

## Evaluation

`scripts/eval.mjs` runs one phase with a real agent against a small fixture, grades the result with the same deterministic checks the simulator uses, repeats `k` times, and reports pass@k (at least one success in k runs) and pass^k (all k succeed), with wall time and token counts when the runtime reports them.

```sh
npm run eval -- --driver fake --k 2                              # harness self-test, no tokens
npm run eval -- --driver omp --case research-questions-lean --k 3
npm run eval -- --driver claude --k 3
npm run eval -- --driver codex --case plan-from-outline --k 1
```

Drivers run the runtimes headless: `omp -p --mode json`, `claude -p --output-format json`, `codex exec --json`. Each run gets a fresh fixture under the OS temp directory and the same file-form prompt `run-task` uses (`Read and follow <skill path>/SKILL.md ... write your complete final reply verbatim to <reply path>`), so an eval measures exactly what the orchestrator would get. Nothing is installed into your home directory.

Graders are code and rule graders only (the taxonomy is in the `eval-harness` skill): the reply file exists and passes `validateReply` with the expected next skill; the artifact of the expected type exists and passes `validateArtifact`; the phase wrote nothing outside the gitignored task directory; no banned tokens; optional regexes the reply must match. A model grader is deliberately absent: a phase whose output a rule cannot check is a phase whose contract is too loose, and that is a finding for the skill text, not for a judge.

Cases live in `eval/cases/*.json`; `eval/README.md` documents the schema. Results are written to `eval/results/` (gitignored). Start with `k >= 3`; a single green run proves nothing about an agent.

Treat eval results as measurements to compare across skill edits, models, and runtimes, not as a gate: they cost tokens and depend on account state.

## Adding a skill to the workflow

1. Add the `PHASES` entry in `skills/run-task/scripts/workflow.mjs` (artifact type, gate, interactive, `next(ctx)`).
2. Add the matching row in `workflows/delivery.md`; `npm run validate` fails until both agree.
3. Add the artifact template and answer template under `references/`; the simulator's template mapping picks them up by the skill's type.
4. Extend the relevant simulation scenario so the new phase appears in an observed chain.
5. Optionally add an eval case.

## What an Oh My Pi extension would add

Oh My Pi loads extensions as modules that register commands, tools, and session event handlers, and its handler context exposes `getContextUsage()`, `newSession()`, `ui.confirm()`, and `ui.setWidget()`. That is every primitive the roadmap in [Context management](context-management.md#what-a-runtime-plugin-could-add) needs, and `workflow.mjs` is the logic it would call:

- `registerCommand("run-task")`: `nextCommand`, then `newSession()` and send the phase prompt, so each phase gets a fresh session without a Herdr pane or a subagent.
- `registerTool("task_status")`: returns `statusReport` so the model never re-derives state from the table.
- `session_start`: `ui.setWidget` with the status report for the task in the current worktree.
- `agent_end`: when the reply carries a handoff fence and the phase is a gate, `ui.confirm` to approve or request changes; on approve, start the next phase in a new session.
- `turn_end`: read `getContextUsage()` and warn when a phase passes the budget; record the number next to the reply file for the eval's cost column.

The skills stay unchanged; the extension replaces the manual steps with the same decisions taken by the same code. Building it is the next step once the simulation layer is green.
