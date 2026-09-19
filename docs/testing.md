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

Long-run resume has a separate host-lifetime requirement in Atomic 0.9.19. A `-p` control-tool call can acknowledge `running` and then pause the unfinished workflow when print mode disposes its host. A superseded paused host can also publish another pause during shutdown. Stop superseded hosts **before** resuming, keep one interactive `atomic` host open, run `/workflow status <run-id>` there to initialize durability, then `/workflow resume <run-id>`. Returning that interactive chat to idle preserves execution; exiting it does not. The retained acceptance run `6ba6144a-9806-4c7b-9ba0-ba1535b9df9f` advanced from stage 016 to 017 through this persistent-host recovery. Admission alone is not progress or completion evidence.

A terminal controller result is different from a paused native run. Run `6ba6144a-9806-4c7b-9ba0-ba1535b9df9f` later returned `blocked` after its 40-stage bound; native resume correctly refused it as non-resumable. Continue unfinished work by starting a successor delivery run with the same `task_dir` and branch, an explicit larger `max_steps`, and the required verification settings. Preserve the original blocked result and all artifacts; do not reset checkpoints or report the old run as completed. Successor `600e37e0-14f2-4b18-8348-0d00c8c8dcc7` reused that task with `max_steps=80` and `verify=true`.

For an existing `task_dir`, the runtime reads the canonical request from `task.md`; a new `request` argument does not replace it or carry repair feedback. Preserve the original request, append accepted feedback references to the task, and deliver them explicitly to the live stage when that run has already captured its inputs.

That successor later failed artifact validation: its local PR description lacked the required Purpose and Change outline sections. Recovery attempt `73ac4665-6b6e-430a-b11b-e8972a38037a` then failed with a replay/topology mismatch rather than restoring a usable frontier. These failures are not successful full-controller recovery evidence.

Run `9b65b796-f8b0-419a-bc19-2640e5ad92fc` later failed the independent-verification revision guard after fixture builds changed untracked output inside the source tree. Tracked implementation files remained unchanged, but the exact pre-stage fingerprint could not be restored from the retained generated output. Keep fixture build output outside the source tree and preserve each run's separate outcome instead of describing the sequence as one uninterrupted delivery.

Run `853af082-da2e-4c89-8afd-94500a5a20e0` also failed the guard at `009-verify-implementation-observe`: documented relative evidence paths had written recordings beneath `skills/delivery/jev-ui/.agents/`. Those recordings were preserved before relocation. A cleaned source tree alone is not proof that the exact pre-stage fingerprint has been restored; do not bypass the guard or discard regression source to manufacture a match.

The later `e4f70765-bd1a-48c4-acae-78d8c7fbc5f1` verification wrote two new runtime metadata files into source. Relocating only those files byte-identically into task evidence restored the exact pre-stage fingerprint, but continuation `f54ac46d-1d0c-45c6-9357-c7022a496059` still failed topology admission. Atomic 0.9.19 gives failed-run continuations a fresh `ctx.runId`; including that attempt ID in the completed workspace tool's arguments changed its checkpoint identity. The fix removes it from those arguments, while retaining the original ownership ID inside the cached workspace output. Old checkpoint identities are not migrated or rewritten.

A direct production-definition proof now covers that boundary. Native run `d862dec2-ce66-4aab-91de-3bad68c8a649` completed a real Luna-fast implementation session and intentionally failed the production `001-implement-plan-observe` callback. Fresh-ID continuation `41b053b4-e678-4afa-8621-cfb899abd7e7` completed: native status showed `open-task-workspace` cached, the model stage reused with zero duration and the same session ID, and the actual observer admitted. A transparent context wrapper forwarded native tasks and tool arguments unchanged, then ended the proof after observer admission. This tests internal replay, not merely replay of a cached child workflow or full delivery completion. The retained JEV task's `evidence/supervisor-independent-EE5OZZ/native-internal-replay/` contains the wrapper, tested source, fixture, receipt, native status screens, and archive hashes.

For live intercom coordination, select a recipient from the current roster and require an acknowledgement. During the same 0.9.19 run, `workflow:<run-id>/**` messages accumulated under an empty-root `[future]` recipient while real stages were active; queue admission did not prove delivery. A blocking ask can also outlive its target stage. Use observed live recipients, refresh them as stages advance, and put accepted findings into task artifacts so fresh verification sessions do not depend on an undelivered message queue.

The repair handoff has a separate live proof. A fresh native `openai-codex/gpt-5.6-luna-fast` worker consumed the final generated `iterate-implementation` prompt in an isolated `notifyctl` repository. The padded channel selector failed with exit 1 before repair and succeeded afterward; message whitespace and case, canonical logged channel identity, and the input artifacts were preserved. The stale uppercase-message finding was not applied. The retained JEV task contains the before/after outputs, generated prompt, fixture, and archive hashes under `evidence/supervisor-independent-EE5OZZ/controller-repair-handoff/`. This proves the repair input contract, not a complete workflow route or recovery path.

Full controller end-to-end delivery, including every route and durable control, remains unverified.

## Evals

`npm run evals` runs skill scenarios against a live model; it is not part of the offline test suite. The harness in `evals/run.mjs` builds an OMP skill tree and runs each phase in its own `omp -p` session against a throwaway repository from a per-run snapshot under `evals/results/<stamp>/.dist/`. That snapshot includes the current `shared/WRITING.md` and `shared/CONVENTIONS.md` plus the fixtures; each phase is explicitly told to read the local pinned guides, not published or host-checkout copies. Prompts, answers, stderr, artifacts, and grading results are retained under `evals/results/`. Pass `--model <selector>` to choose the OMP model explicitly, for example `npm run evals -- lean-with-sources --model openai-codex/gpt-5.6-luna --keep`; without it, OMP's configured default is used.

Scenarios under `evals/scenarios/` cover document conversion and research/design chains. They check consumer-visible facts: source-backed claims, unresolved requirements, real repository citations, artifact shape, operational handoff (one text command fence naming the expected next skill and, where applicable, the expected artifact), prior artifacts remaining unchanged, and no implementation changes by document phases. A phase artifact must be the only path in the commit at `HEAD`; that commit must use a valid Conventional Commit subject with the focused `docs(task):` prefix. The subject is intentionally not compared to an incidental phrase. Read a scenario's source for its exact behavioral contract; avoid assertions that only pin wording or formatting.

The fixture repository is the only codebase an artifact may describe. Source snapshots and local-guide copies prevent a phase from reading mutable host files after the run starts. Re-grading uses the saved `.dist` templates and fixture snapshot; legacy recordings without that snapshot are skipped rather than reading the current checkout.

The `verify-required-arguments` scenario covers command discovery when a package build needs a runtime argument. It requires a passing verification artifact and the expected `dist/runtime.txt` emitted by the supported build; a bare invocation's usage error is not a product defect. `npm run evals -- verify-required-arguments --model openai-codex/gpt-5.6-luna --keep --max-time 15` passed its one phase in 261 seconds with the final notification-CLI request and clarified evidence-retention guidance, with local results retained under `evals/results/20260919-170601/`. This exercises command discovery and preservation of a documented build output, not relocation of unexpected runtime evidence.

A live skill eval proves the exercised phase behavior in that harness. It does not prove Atomic discovery, its human UI, durable resume, epic child scheduling, or another harness's tool implementation. Provider credentials and OMP must be available for these evals.

## Adding a skill to the workflow

1. Add `skills/delivery/<name>/SKILL.md` and its `references/` templates, preserving the frontmatter and shared links on line 6.
2. Add its row under the exact `| Skill | Artifact type | Human gate | Runs in |` header in [workflows/delivery.md](../workflows/delivery.md#phase-table).
3. Preserve independent invocation and artifact-first replies. Human handoffs should provide the operational next command and any required artifact reference in a text command fence; terminal replies have no next-command fence.
4. Add optional controller integration only when the workflow should invoke it. Keep the graph and decisions visible in `atomic/workflows/delivery.ts`, and cohesive helpers in `atomic/lib/`. Every skill stage uses `context: "fresh"`; each bounded-loop iteration creates a new stage identity rather than a graph cycle.
5. Add or adjust tests only for a plausible observable regression. A change to live artifact content may need an eval scenario; a workflow API change needs runtime proof.
6. Run `npm test` after all related edits land. During concurrent work, one integration owner runs aggregate checks after the shared tree is coherent.
