# Testing

Keep three kinds of evidence separate: deterministic repository checks, live skill evals, and optional Atomic runtime execution. Passing one does not prove the others.

## Repository checks

`npm test` is the repository's aggregate check; its exact command list lives in `package.json`. The main surfaces are:

| Surface | Entry point | Contract |
|---|---|---|
| Skill validation | `node scripts/validate.mjs` | Layout, frontmatter, shared links, templates, handoff fences, phase-table coverage, and source conventions |
| Plugin sync | `node scripts/sync-plugin.mjs --check` | Published plugin resources match canonical skills |
| Unit tests | `node --test tests/` | Installer ownership, runtime adaptation, commit rules, typed helper behavior, and workflow helpers |

Offline checks must not require an installed Atomic runtime or live provider credentials to prove independent skill installation. Installer tests use temporary homes/projects and check both selected skills and the optional `--atomic` resources. Test the no-workflow default, project-local portable skills, independent partial selection, workflow discovery entry, and scoped uninstall without touching real user installations.

Do not reinterpret historical engine fixtures as Atomic execution evidence. The optional TypeScript workflow and its helpers are the only current orchestration source.

## Atomic runtime proof

Use a scratch repository and a scratch Atomic agent directory for integration work. Keep task artifacts and unrelated user state out of cleanup scope. Follow the native [authoring](https://docs.bastani.ai/workflows/authoring) and [operations](https://docs.bastani.ai/workflows/operations) contracts:

1. Install the complete portable collection with `--atomic` into the scratch destination.
2. Start Atomic and run `/workflow reload`, `/workflow list`, and `/workflow inputs delivery`. Confirm the registered name and input schema. Discovery is non-recursive, so test the installed top-level `skills-delivery.mjs` entry as well as its nested source tree.
3. Exercise a small real task with an explicit workflow, inspect the saved artifact, and check native run status. A fake context proves helper/control-flow behavior only; it does not prove real stage execution.
4. For gate changes, exercise the interactive UI with `gates=all` or `plan`: inspect the artifact, request changes, then approve the revised artifact. Inspect pause/quit/resume behavior with the saved run id.
5. For headless changes, use `gates=none`; no path may reach `ctx.ui` prompts. Exercise blocked and failed results rather than accepting them as completed.
6. For automatic routing changes, exercise the existing JEV helper with an available key and separately check its visible failure path when unavailable. A deterministic explicit chain is not proof of automatic routing.

Record exact commands, version, observed status, and blockers. Registration, module import, stubbed stages, or one deterministic helper result must not be reported as a successful end-to-end workflow run. Runtime integration is optional for skill-only changes; claims about it still require live proof.
The current verified runtime boundary is Atomic 0.9.19's native two-model-session artifact handoff. A separate proof also exercised recovery: failed native run `0a18d915-142a-4f1a-a8d6-c453f86d4032` was resumed from a separate process through the native workflow CONTROL TOOL; DBOS metadata showed `completed`, `count-effects=1`, and the `completed-once` callback was not replayed. The direct headless `/workflow resume <run-id>` command initially errored because DBOS durability was not ready; the native tool recovery path initialized it and succeeded. This is the observed narrow limitation, not a claim that all CLI recovery paths were tested. Raw proof: `/tmp/atomic-migration.JBu9Sk/recovery-proof.json`.
Full controller end-to-end delivery, including every route and durable control, remains unverified.

## Evals

`npm run evals` runs skill scenarios against a live model; it is not part of the offline test suite. The harness in `evals/run.mjs` builds an OMP skill tree and runs each phase in its own `omp -p` session against a throwaway repository from a per-run snapshot under `evals/results/<stamp>/.dist/`. That snapshot includes the current `shared/WRITING.md` and `shared/CONVENTIONS.md` plus the fixtures; each phase is explicitly told to read the local pinned guides, not published or host-checkout copies. Prompts, answers, stderr, artifacts, and grading results are retained under `evals/results/`. Pass `--model <selector>` to choose the OMP model explicitly, for example `npm run evals -- lean-with-sources --model openai-codex/gpt-5.6-luna --keep`; without it, OMP's configured default is used.

Scenarios under `evals/scenarios/` cover document conversion and research/design chains. They check consumer-visible facts: source-backed claims, unresolved requirements, real repository citations, artifact shape, operational handoff (one text command fence naming the expected next skill and, where applicable, the expected artifact), prior artifacts remaining unchanged, and no implementation changes by document phases. A phase artifact must be the only path in the commit at `HEAD`; that commit must use a valid Conventional Commit subject with the focused `docs(task):` prefix. The subject is intentionally not compared to an incidental phrase. Read a scenario's source for its exact behavioral contract; avoid assertions that only pin wording or formatting.

The fixture repository is the only codebase an artifact may describe. Source snapshots and local-guide copies prevent a phase from reading mutable host files after the run starts. Re-grading uses the saved `.dist` templates and fixture snapshot; legacy recordings without that snapshot are skipped rather than reading the current checkout.

A live skill eval proves the exercised phase behavior in that harness. It does not prove Atomic discovery, its human UI, durable resume, epic child scheduling, or another harness's tool implementation. Provider credentials and OMP must be available for these evals.

## Adding a skill to the workflow

1. Add `skills/delivery/<name>/SKILL.md` and its `references/` templates, preserving the frontmatter and shared links on line 6.
2. Add its row under the exact `| Skill | Artifact type | Human gate | Runs in |` header in [workflows/delivery.md](../workflows/delivery.md#phase-table).
3. Preserve independent invocation and artifact-first replies. Human handoffs should provide the operational next command and any required artifact reference in a text command fence; terminal replies have no next-command fence.
4. Add optional controller integration only when the workflow should invoke it. Keep the graph and decisions visible in `atomic/workflows/delivery.ts`, and cohesive helpers in `atomic/lib/`. Every skill stage uses `context: "fresh"`; each bounded-loop iteration creates a new stage identity rather than a graph cycle.
5. Add or adjust tests only for a plausible observable regression. A change to live artifact content may need an eval scenario; a workflow API change needs runtime proof.
6. Run `npm test` after all related edits land. During concurrent work, one integration owner runs aggregate checks after the shared tree is coherent.
