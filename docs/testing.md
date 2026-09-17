# Testing

The collection is checked at three depths. None spends tokens.

| Layer | Command | Answers |
|---|---|---|
| Skill validation | `node scripts/validate.mjs` | Are the skill files well formed: layout, frontmatter, shared links, referenced templates, actionable handoffs, terminal reply shape, banned words, phase-table coverage? |
| Pack checks | `node scripts/build-packs.mjs --check`, then `archon workflow test <pack>` | Is the generated OMP flavor current, and does each pack's DAG route as its fixtures declare, without an agent? |
| Unit tests | `node --test tests/` | Do the installer, the commit-subject rule, the pack generator, and the deterministic pack nodes behave? |

`npm test` runs the validator, the plugin manifest check (`node scripts/sync-plugin.mjs --check`), and the unit tests.

## What is deterministic and what is not

The workflow has two halves. The control flow (which node runs next, where the run pauses, when a loop ends) is Archon's DAG over the YAML in `.archon/workflows/delivery/`; every routing decision reads a gate decision, the `gates` node's flags, a JSON field the node prompt requires (`status` from `review-code`, `reproduce-bug`, `test-app`, and `verify-implementation`, `attempt` from `attempt-count`), or the plan file's checkboxes (`until_bash` in `delivery-implement`). The phase work (research, planning, implementation) needs a model.

Only the phase work needs tokens, and nothing here runs it.

## Skill validation

`scripts/validate.mjs` checks, in order: the `skills/` layout and count; frontmatter keys and names; the shared-document links on line 6; every `references/` file a skill mentions exists; every nonterminal answer template ends with one `text` fence naming an existing skill and carries `Next action:` plus the new-session instruction exactly once; terminal replies contain no fence; human-review templates have the four review headings; implementation templates declare `type` and `completed_phase`; human-gate answers carry `{artifact_link}`, a `Check:` line, and the approval sentence; banned host tokens are absent from every file; `workflows/delivery.md` mentions every delivery skill and has the phase table; and the commit subject regex and length limit written in `shared/CONVENTIONS.md` are the same values the hook enforces.

Run it on a generated runtime tree with `node scripts/validate.mjs --root dist/<runtime>`.

## Pack checks

`.archon/workflows/delivery-omp/` is generated from `.archon/workflows/delivery/` by `scripts/build-packs.mjs`, which rewrites every `prompt:` node into a `bash:` node running `omp -p`. `node scripts/build-packs.mjs --check` exits 1 when the generated tree differs from what the generator would write; run `node scripts/build-packs.mjs` after editing a native pack and commit both trees.

### Fixtures declare how a pack routes

Each pack and block carries `fixtures/<name>.stubs.yaml` next to its YAML. A fixture is a dry run with declared node outputs and a declared outcome:

```yaml
# .archon/workflows/delivery/bugfix/fixtures/not-reproduced.stubs.yaml
task__create: '{"task_dir":".agents/tasks/fixture"}'
gates: '{"reproduce":"false","pr":"false"}'
attempt-auto: '{"status":"not-reproduced","summary":"needs the failing config file","artifact":"01-reproduction-fixture.md"}'
attempt-count: '{"status":"not-reproduced","attempt":4}'
fixture:
  expect: cancelled
  inputs: { gates: none }
  reached: [attempt-auto, attempt-count, reproduce-auto, not-reproduced]
exec-code: false
```

- Every key other than `fixture` and `exec-code` is `node-id: stub output`. Included node ids are namespaced `<alias>__<node>` (`task__create`, `design__once`, `implement__phases-auto`); loop body ids are not (`implement-phase-auto`, `attempt-count`). Confirm an id with a `--json` dry-run trace before writing it.
- `fixture.expect` is `completed`, `failed`, `paused`, or `cancelled`; `fixture.reached` lists node ids that must have run; `fixture.inputs` supplies workflow inputs; `fixture.fail-node` makes one node fail. Archon 0.10.1 ignores `resolved-text-contains`; do not rely on it.
- `exec-code: true` executes the pack's `bash:` nodes for real (`delivery-task`, `gates`, the `*-done` joins) in a scratch worktree of `HEAD`; `false` needs a stub for each of them. `until_bash` is never executed in a dry run: a loop is assumed complete after one iteration, so a fixture exercises a body once, never the exit condition. `$LOOP_PREV.*` stays literal.

Run them from the checkout:

```sh
archon workflow test delivery-bugfix   # one pack
archon workflow test delivery          # every fixture in the delivery folder
```

`archon workflow test` never creates a run or contacts a provider. Installed packs carry their fixtures, so the same command works from any project against `~/.archon/workflows/`. The generator copies every fixture into the OMP flavor (node ids are identical), so `archon workflow test delivery-omp` runs the same 29. The fixtures in the tree (29):

| Workflow | Fixtures |
|---|---|
| `delivery-task` | `create` (exec-code: slug, `task.md`, commit in the scratch worktree), `missing-task-dir` (exec-code; a `task_dir` without `task.md` fails) |
| `delivery-research` | `run` |
| `delivery-gate-phase` | `gated` (`cycle` pauses), `unattended` (`once`) |
| `delivery-implement` | `gated`, `unattended`, `review-each-phase` |
| `delivery-review` | `clean`, `findings`, `blocked` (cancels) |
| `delivery-full` | `gated`, `unattended`, `review-each-phase`, `review-findings`, `review-blocked` |
| `delivery-lean`, `delivery-prd`, `delivery-oneshot`, `delivery-epic` | `gated`, `unattended` |
| `delivery-bugfix` | `gated`, `unattended`, `reproduced` (exec-code), `not-reproduced` (cancels after the fourth reproduction session) |
| `delivery-resolve-reviews` | `round` |

### A raw dry run

`archon workflow run <pack> --dry-run --json` prints one trace document: each node as completed, stubbed, skipped, failed, or paused, with its resolved prompt text. `--default-stubs` fills every prompt node with a schema-valid placeholder; `--stubs <file>` supplies chosen outputs (`--stubs-init <file>` writes the scaffold); `--pause-at-gates` stops at the first approval node instead of auto-approving. Use it to find node ids and check resolved prompts; put the routing claim in a fixture.

`--dry-run --exec-code` runs the deterministic nodes in the current directory: `delivery-task` creates `.agents/tasks/<slug>/` and commits it on the current branch. Run it only in a scratch repository (`git init` in `mktemp -d`, copy the packs to `<scratch>/.archon/workflows/delivery/`, `--cwd <scratch>`), never in a checkout you care about. Included bash nodes do not receive `INPUTS_*` in that mode, so `delivery-task` writes `workflow: full`; see the Archon notes in [workflows/delivery.md](../workflows/delivery.md#archon-notes).

Archon resolves a workflow name by exact, then case-insensitive, suffix, and substring match: a native pack that fails to load runs its `-omp` twin without a warning. Read the resolved workflow name in the `--json` output.

## Unit tests

- `tests/install.test.mjs`: runtime detection, the destination map (including `CLAUDE_CONFIG_DIR` and `CODEX_HOME`), the plan's handling of the shared `~/.agents/skills/` directory, the managed block in `config.toml`, and a full install followed by an uninstall into a temporary home directory that must end with only the files it started with.
- `tests/commits.test.mjs`: the Conventional Commits subject rule shared by the `commit-msg` hook, `scripts/check-commits.mjs`, and the conventions document.
- `tests/judge.test.mjs`: `typed-judgment/judge.mjs` against `tests/lib/typesafe-stub.mjs`, a stand-in for the TypeSafe endpoint that answers through the test's function and records every request: exit 3 with nothing printed when the key is missing or the endpoint is dead, the probability bands of every command, phase criteria built from `##` and `###` headings outside fences, a claim moved only toward the safer status, `extract-json` taking a contained object without a call and recovering prose by enum choice plus the one artifact name, the confidence floors of `feedback-intent`, `route-workflow`, `tier`, `triage-threads`, and `grade-steps`, and `size-children` deciding an epic child on its weakest sizing test, judging acceptance sentences only when the child has them, and naming a split only above the confidence floor. The stub runs in the test process, so the helper is spawned asynchronously.
- `tests/build-packs.test.mjs`: the generator on a synthetic prompt node: `extract-json` arguments derived from the schema, the awk kept as the fallback, `model:` and `effort:` turned into `--model` under an environment guard and `--thinking`, and the generated bash run with a fake `omp` for a fenced answer, a prose answer recovered through the stub, and a prose answer with no key.
- `tests/dispatch.test.mjs`: the `delivery-start` route and resolve bodies under `/bin/bash`: explicit `workflow` and `gates` pass through, `auto` without a key is `full`, `all`, and a confirm pause, judged routes and autonomy levels map to each pack's gate names, the `program` word rule, a bogus gate name fails naming the valid set, and reject text such as `lean, outline` resolves the pack and gates.
- `tests/wave.test.mjs`: the `delivery-wave` bodies in a temp repository on an epic branch with three chained children: readiness from merged `pr-description.md` files and existing branches, the manual commands, and the parallel launcher against a fake `archon` recording its arguments.
- `tests/packs.test.mjs`:
  - the generator: refs hoisted into shell variables, inputs read from `INPUTS_*`, the workflow and its includes renamed, the flavor note appended, the committed `delivery-omp/` tree byte-identical to a fresh build;
  - the generated bash executed under `/bin/bash` 3.2 with a fake `omp` on `PATH`, including a prompt with an unpaired apostrophe, checking the flags (`-p --auto-approve --no-session --max-time=45m`) and the expanded prompt `omp` receives;
  - the task node's bash body run with `ARGUMENTS` and `INPUTS_*` in a temporary git repository: slugs per the conventions, `task.md` fields, the `docs(task): open <slug>` commit, removal of a stale `.agents/tasks/` ignore line, reuse of an existing `task_dir`, failure on a bogus one;
  - the `until_bash` of `delivery-implement` against the plan and outline templates, without a key (open boxes under `## Phase N` or `## Step N` keep the loop running, boxes under `## Human Review` do not) and against the stub (`done` ends the loop over an open box, `remaining` keeps it over ticked ones, `unclear` defers to the awk); the task node's judged slug, `complexity:`, `suggested_workflow:`, and the mismatch warning;
  - with an Archon 0.10+ on `PATH`: every pack loads without `parseWarnings`, resolves to its own name, and dry-runs in a scratch repository, with `--input gates=none` (both twins' unattended branches run and the final join executes, no pause), `delivery-full` with `--input gates=plan --pause-at-gates` (pauses once, at the plan gate), and `--input gates=bogus` (fails at node `gates` naming the valid set);
  - `archon workflow test delivery --cwd <scratch> --json --quiet`: every fixture ran, no unused or missing stub, the scratch repository keeps only its initial commit (exec-code fixtures commit in Archon's worktree), and a fixture with a wrong `expect` exits 1;
  - a real Archon run (no `--dry-run`) of the OMP flavor under a scratch `HOME`, with a fake `omp` that plays the skills: `delivery-lean-omp --input gates=none` runs seven fresh sessions, every node (included or not) reads the skills directory with `~` expanded, the review node's prompt carries its schema, a fenced answer with prose around it is filtered to the JSON object, `until_bash` ends the implementation loop after the two real steps, and the branch ends with one `docs(task)` commit per phase and nothing uncommitted; `delivery-bugfix-omp --input gates=none` with a reproduction that never succeeds makes four reproduction sessions, each seeing the previous answer through `$LOOP_PREV`, commits each artifact, and cancels naming the count; `delivery-lean-omp --input gates=outline` exits at the gate, `archon workflow reject <id> --detach "<text>"` re-runs the phase with that text in the prompt, and `archon workflow approve <id> --detach` finishes the run unattended. Archon's database and workspace registry are created under the scratch `HOME` and discarded.

## What stays manual

- A run against a real provider: whether the skills, read by a live model, produce the artifacts and the JSON-only answers the packs expect. The fake `omp` proves the plumbing, not the model.
- Real `omp -p` output was checked once by hand: stdout holds only the answer, wrapped in a ` ```json ` fence, which the generated filter strips; stderr holds progress text. Re-check after an Oh My Pi upgrade with `omp -p --auto-approve --no-session "Reply with exactly {\"ok\":true}"`.

## Adding a skill to the workflow

1. Add `skills/delivery/<name>/SKILL.md` with its `references/` templates; the validator checks the frontmatter, line 6, and the answer template's fence.
2. Add the row in the phase table of `workflows/delivery.md` (skill, artifact type, human gate, runs in).
3. When a pack should run it, add a `prompt: |` node with `context: fresh` to the pack under `.archon/workflows/delivery/` (or compose an existing block), following the Pack source conventions in [workflows/delivery.md](../workflows/delivery.md#pack-source); then `node scripts/build-packs.mjs`.
4. Dry-run the pack with `--json` for the new node's id and resolved prompt, then add or extend a fixture that reaches it and run `archon workflow test <pack>`.
5. `npm test`.
