# Testing

Keep these evidence types separate: offline repository checks, live skill evals, and optional Atomic runtime runs. One passing type does not prove another.

## Repository checks

`npm test` is the aggregate check; `package.json` owns its exact command list.

| Surface | Entry point | Contract |
|---|---|---|
| Skill validation | `node scripts/validate.mjs` | Layout, frontmatter, shared links, templates, handoff fences, phase-table coverage, and source conventions |
| Plugin sync | `node scripts/sync-plugin.mjs --check` | Published plugin resources match canonical skills |
| Unit tests | `node --test tests/` | Installer ownership, runtime adaptation, commit rules, typed helper behavior, and workflow helpers |

Offline checks must not need an Atomic installation or live provider credentials. Installer tests use temporary homes and projects and cover:

- the no-workflow default;
- project-local portable skills;
- independent partial selection;
- workflow discovery entry; and
- scoped uninstall without touching real user installations.

Historical engine fixtures are not Atomic execution evidence. The optional TypeScript workflow and its helpers are the current controller source.

## Atomic runtime proof

Use a scratch repository and scratch Atomic agent directory. Keep task artifacts and unrelated user state outside cleanup scope. Follow the native [authoring](https://docs.bastani.ai/workflows/authoring) and [operations](https://docs.bastani.ai/workflows/operations) contracts.

1. Install the complete portable collection with `--atomic` into the scratch destination.
2. Start Atomic and run `/workflow reload`, `/workflow list`, and `/workflow inputs delivery`. Confirm the registered name and input schema. Discovery is non-recursive, so check both the installed top-level `skills-delivery.mjs` entry and its nested source tree.
3. Run a small real task with an explicit workflow. Inspect its saved artifact and native run status. A fake context proves only helper/control flow, not stage execution.
4. For gate changes, use `gates=all` or `plan`: inspect the artifact, request changes, approve the revision, and inspect pause/quit/resume with the saved run id.
5. For headless changes, use `gates=none`; no path may reach `ctx.ui`. Exercise blocked and failed results rather than accepting them as complete.
6. For automatic routing, test JEV with an available key and its visible unavailable-service failure path. A deterministic explicit chain does not prove automatic routing.

Record exact commands, version, observed status, and blockers. Registration, module import, stubbed stages, or one deterministic helper result is not successful end-to-end workflow evidence. Runtime integration is optional for skill-only changes, but any claim about it needs live proof.

### Retained Atomic 0.9.19 evidence

The current verified runtime boundary is Atomic 0.9.19's native two-model-session artifact handoff. The following table keeps the observed results and limits separate:

| Run or evidence | Observed result | Limit or required handling |
|---|---|---|
| `0a18d915-142a-4f1a-a8d6-c453f86d4032` | Failed native run resumed from another process through the native workflow CONTROL TOOL. DBOS metadata showed `completed`, `count-effects=1`, and no replay of the `completed-once` callback. Raw proof: `/tmp/atomic-migration.JBu9Sk/recovery-proof.json`. | Direct headless `/workflow resume <run-id>` first errored because DBOS durability was not ready; native tool recovery initialized it. This is a narrow recovery result, not proof of every CLI path. |
| `6ba6144a-9806-4c7b-9ba0-ba1535b9df9f` | With a persistent interactive host, recovery advanced stage 016 to 017. | A `-p` control-tool call can acknowledge `running` and then pause when print mode disposes its host; a superseded paused host can publish another pause during shutdown. Stop superseded hosts, keep one interactive `atomic` host open, run `/workflow status <run-id>` to initialize durability, then `/workflow resume <run-id>`. Returning chat to idle preserves execution; exiting does not. Admission alone is not progress or completion evidence. |
| `b5e7dca8-8820-4d41-a8a5-e342ba386c03` | After host and device-service restoration, the run resumed from `crashed` with its first four stages cached. | Keep the supervising host and owned device services alive across harness teardown. An open terminal screen does not prove liveness. Restore services, check authorized targets, inspect status and cached stages, then resume; stop persistent services after acceptance. Cached checkpoints do not prove remaining delivery or UI assertions. |
| `600e37e0-14f2-4b18-8348-0d00c8c8dcc7` | Successor run reused the task with `max_steps=80` and `verify=true`. | The original `6ba6144a-9806-4c7b-9ba0-ba1535b9df9f` run later returned `blocked` at its 40-stage bound; native resume refused it as non-resumable. Continue with the same `task_dir` and branch, a larger explicit `max_steps`, and required verification settings. Preserve the blocked run and artifacts; do not reset checkpoints or call it complete. |
| Existing `task_dir` behavior | The runtime reads the canonical request from `task.md`. | A new `request` does not replace it or carry repair feedback. Preserve the original request, append accepted feedback references to the task, and send them explicitly to a live stage that already captured inputs. |
| `73ac4665-6b6e-430a-b11b-e8972a38037a` | Recovery after the successor's local PR description lacked the required Purpose and Change outline failed with a replay/topology mismatch. | Not successful full-controller recovery evidence. |
| `9b65b796-f8b0-419a-bc19-2640e5ad92fc` | Independent-verification revision guard failed after fixture builds wrote untracked output in the source tree; tracked implementation files stayed unchanged. | The exact pre-stage fingerprint could not be restored from retained generated output. Keep fixture build output outside the source tree and preserve each run's outcome. |
| `853af082-da2e-4c89-8afd-94500a5a20e0` | Guard failed at `009-verify-implementation-observe` because relative evidence paths wrote recordings under `skills/delivery/jev-ui/.agents/`; recordings were preserved before relocation. | A cleaned tree does not prove the exact fingerprint. Do not bypass the guard or discard regression source to manufacture a match. |
| `e4f70765-bd1a-48c4-acae-78d8c7fbc5f1` and `f54ac46d-1d0c-45c6-9357-c7022a496059` | Moving two runtime metadata files byte-identically into task evidence restored the fingerprint, but continuation still failed topology admission. Atomic 0.9.19 gives failed-run continuations a fresh `ctx.runId`; including that attempt ID in completed-workspace arguments changed checkpoint identity. | The fix removes the attempt ID from those arguments but keeps the original ownership ID in cached workspace output. Old checkpoint identities are not migrated or rewritten. |
| `d862dec2-ce66-4aab-91de-3bad68c8a649` → `41b053b4-e678-4afa-8621-cfb899abd7e7` | A real Luna-fast implementation session intentionally failed `001-implement-plan-observe`; fresh-ID continuation completed with cached `open-task-workspace`, zero-duration model reuse, the same session ID, and observer admission. A transparent context wrapper forwarded native tasks and arguments unchanged. | This proves internal replay after observer admission, not cached-child replay or full delivery completion. Evidence: `evidence/supervisor-independent-EE5OZZ/native-internal-replay/`. |
| Live intercom | During the same 0.9.19 run, `workflow:<run-id>/**` messages accumulated under empty-root `[future]` while stages ran. A blocking ask can outlive its target. | Queue admission is not delivery. Select a current roster recipient, require acknowledgement, refresh recipients as stages advance, and put accepted findings in task artifacts so fresh sessions do not depend on an undelivered queue. |
| Repair handoff | A fresh native `openai-codex/gpt-5.6-luna-fast` worker consumed the final `iterate-implementation` prompt in isolated `notifyctl`. The padded channel selector failed with exit 1 before repair and succeeded after; whitespace, case, canonical logged channel identity, and input artifacts were preserved. | The stale uppercase-message finding was not applied. Evidence and archive hashes: `evidence/supervisor-independent-EE5OZZ/controller-repair-handoff/`. This proves the repair input contract, not a complete route or recovery path. |

Full controller end-to-end delivery, including every route and durable control, remains unverified.

## Evals

`npm run evals` runs skill scenarios against a live model and is not part of the offline suite. `evals/run.mjs` builds an OMP skill tree and runs each phase in its own `omp -p` session against a throwaway repository from `evals/results/<stamp>/.dist/`. The snapshot includes the current `shared/WRITING.md`, `shared/CONVENTIONS.md`, and fixtures. Each phase is told to read those pinned local guides, not published or host-checkout copies. Prompts, answers, stderr, artifacts, and grading results remain under `evals/results/`. Choose a model with `--model <selector>`, for example `npm run evals -- lean-with-sources --model openai-codex/gpt-5.6-luna --keep`; otherwise OMP's configured default is used.

Scenarios in `evals/scenarios/` check consumer-visible facts: source-backed claims, unresolved requirements, repository citations, artifact shape, the one-command operational handoff, unchanged prior artifacts, and no implementation changes by document phases. The artifact must be the only path at `HEAD`, and the commit must use a valid Conventional Commit subject with `docs(task):`. The subject is not compared with incidental wording. Read each scenario's source for its exact contract; do not pin wording or formatting alone.

The fixture repository is the only codebase an artifact may describe. Saved source snapshots and local guides prevent reads from mutable host files. Regrading uses saved `.dist` templates and the fixture snapshot; legacy recordings without that snapshot are skipped.

`verify-required-arguments` tests command discovery when a package build needs a runtime argument. It requires a passing verification artifact and `dist/runtime.txt` from the supported build; a bare invocation's usage error is not a product defect. The command below passed its one phase in 261 seconds with the final notification-CLI request and clarified evidence-retention guidance; results remain under `evals/results/20260919-170601/`:

```text
npm run evals -- verify-required-arguments --model openai-codex/gpt-5.6-luna --keep --max-time 15
```

This tests command discovery and preservation of a documented build output, not relocation of unexpected runtime evidence. A live skill eval proves only the exercised phase in that harness. It does not prove Atomic discovery, its human UI, durable resume, epic child scheduling, or another harness's tools. Provider credentials and OMP are required.

### Recorded repair evidence

The `iterate-evidence` family uses a selected installed companion and recorder, not the full document-skill tree. Its pinned installer inputs, JSON tool trace, source and receipt snapshots, checks, raw videos, extracted frames, and installation inventory stay under the result directory. The only repairable fixture paths are `app.js` and `check.mjs`; specification and capture support remain fixed.

```sh
npm run evals -- iterate-evidence --keep --max-time 25
npm run evals -- iterate-evidence --grade evals/results/latest
```

The primary case requires an agent-authored repair and strengthened check, including failure against preserved defective source and success against repaired source. Independent recorded-pixel review must observe baseline `2`, repaired increment `1`, and Reset `0`. Save exact media hashes, sample timestamps, observations, and subject trace references in the retained review. Automated evidence retention alone leaves inspection pending; missing review cannot pass saved regrading.

The live command exits `1` while independent review is pending. Open the retained frames yourself, write `iterate-evidence/1-iterate-evidence/review.json` using its `review-schema.json`, then run saved grading. The review binds observed pixels to media/frame hashes, subject trace entries, pre-edit receipt history, and final coverage; it is not generated from labels or receipt prose.

Phase 2 uses the same helper for real viewing denial and misleading recorder labels:

```sh
npm run evals -- iterate-evidence-viewer-blocked iterate-evidence-label-disagreement --keep --max-time 25
npm run evals -- iterate-evidence-viewer-blocked iterate-evidence-label-disagreement --grade evals/results/latest
```

The denied-view case launches a fresh isolated HOME/config with an environment-only Codex credential exported through `omp token openai-codex`. It defaults to `openai-codex/gpt-6-astra`; an explicit model must use that provider. No credential is copied into evidence. The extension records the live effective settings because OMP 18.1.22's standalone `config list` does not apply the session overlay. A finite list permits text reads, unchanged fixed capture/finalization, and receipt-only Git commands; only the named receipt is writable. This fault boundary is not an operating-system sandbox.

Review the actual denied `read` result after successful capture, active tools, effective settings, shell/write policy, and all source snapshots. OMP rejects policy-denied reads before extension `tool_call`; retained execution-start/end snapshots bind that denied attempt. Missing provider/setup/media or a usable alternative viewer fails acceptance; it is not the expected blocked result.

The disagreement case supplies an external baseline with evaluator-added `passed` assertions through the unchanged recorder CLI. The subject receives no diagnosis, has limit `0`, and must inspect pixels against the unchanged specification. Original baseline media, labels, and metadata are hashed at every tool boundary. Independently open increment `2` and Reset `0`, retain timestamps and matching image-result hashes, and review failed/exhaustion with no source/check mutations. Fill each case's `review.json` from its retained review guide before saved grading. Original live reports remain pending-review evidence rather than being rewritten as successful runs.

Phase 3 covers bounded work and a fresh-session continuation:

```sh
npm run evals -- iterate-evidence-no-progress iterate-evidence-zero-limit iterate-evidence-three-rounds iterate-evidence-continuation --keep --max-time 25
```

The no-progress subject delegates one unused-setting edit to a real, bounded OMP worker. Review its retained trace and the unchanged defective handler, not a simulated worker result. The zero-limit subject records truthful baseline evidence without editing source or checks. The four-counter case omits an explicit limit and requires baseline plus three productive passes: increment values `2222`, `1222`, `1122`, `1112`; every Reset stays `0`.

Continuation pauses the fixed capture entry after source/check work and a persisted reservation. The harness terminates the owned subject and its paused capture child, preserves both traces and the receipt, then starts a new OMP invocation naming that receipt. Releasing an orphaned capture is not fresh-session proof: the accepted capture must start after the new session and complete the same consumed round without replaying edits.

Open each case's recordings and exact retained subject image payloads before filling `review.json`. Large source PNG sheets may be resized to WebP by the subject's viewer; retain and independently inspect both identities instead of equating their hashes. Missing review, worker/session trace, transformed image, or any required pass observation must fail grading.

Use explicit result directories, especially after rerunning only rejected cases. These retained commands each passed their named scenarios; original live reports and rejected attempts remain unchanged:

```sh
npm run evals -- iterate-evidence-no-progress iterate-evidence-zero-limit --grade evals/results/20260920-060301
npm run evals -- iterate-evidence-three-rounds iterate-evidence-continuation --grade evals/results/20260920-061857
```

The first run's three-rounds recording missed its initial state, and its continuation left an orphaned capture alive. Neither establishes acceptance. The fresh second run follows a capture paint flush plus initial dwell, and termination of the paused owned capture before fresh-session launch. `phase-3-grade-controls.json` in each directory retains evidence-removal failures and the restored passing grade.

Saved regrading reads retained repair evidence, not a reconstructed original fixture or mutable host source. It does not execute the agent or supply missing inspection. The complete plan contains exactly seven live cases: primary repair, viewer blocked, label disagreement, no progress, zero limit, three rounds, and continuation. Grade each phase's explicit directory separately: the runner skips absent names, and skipped names never count toward acceptance. These cases do not establish other harnesses, broader fault coverage, or Atomic execution.

## Adding a skill to the workflow

1. Add `skills/delivery/<name>/SKILL.md` and `references/` templates, preserving frontmatter and the shared links on line 6.
2. Add its row under the exact `| Skill | Artifact type | Human gate | Runs in |` header in [workflows/delivery.md](../workflows/delivery.md#phase-table).
3. Preserve independent invocation and artifact-first replies. Human handoffs use one text command fence naming the next skill and required artifact; terminal replies have no fence.
4. Add controller integration only when the workflow should invoke the skill. Keep graph and decisions in `atomic/workflows/delivery.ts` and cohesive helpers in `atomic/lib/`. Every skill stage uses `context: "fresh"`; each bounded-loop iteration creates a new stage identity, not a graph cycle.
5. Add tests only for plausible observable regressions. Live artifact changes may need an eval; workflow API changes need runtime proof.
6. Run `npm test` after related edits land. During concurrent work, one integration owner runs the aggregate checks after the tree is coherent.