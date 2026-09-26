# Model routing

Run `/configure-model-routing` when a project or user-level candidate profile is missing or needs replacement. Codex users invoke `$configure-model-routing`; other harnesses use `/configure-model-routing`. It asks one setup question at a time, writes the shared profile, and verifies it through the helper.

`skills/delivery/route-model/route-model.mjs` is the shared model-selection owner for Claude Code, Codex, Oh My Pi, Pi, portable skill installs, and Atomic. It accepts exact caller-supplied candidates and returns one native model identifier; it does not proxy requests, scrape provider-private registries, probe accounts, or fall back after native execution failure.

## Machine-readable contract

Node callers pass:

```js
const result = await routeModel(skillsDir, {
  phase: 'create-plan',
  request: 'Plan the change',
  artifacts: [],
  economy: 'provider/economy',
  routing: 'auto',
  candidates: [
    { model: 'provider/economy', cost: 1, description: 'ordinary work' },
    { model: 'provider/reasoning', cost: 4, description: 'difficult reasoning' }
  ]
});
```

The equivalent JSON-over-stdin command is:

```sh
printf '%s\n' '<request JSON>' | node <skills-dir>/route-model/route-model.mjs
```

The CLI flag `--project-only` sets the `projectOnly` helper option. It preserves explicit `--candidates` precedence, otherwise ignores `SKILLS_MODEL_CANDIDATES_FILE` and reads only the project's `.agents/model-candidates.json`. Configure-model-routing uses this only for final project verification; user-level verification keeps environment lookup.

Candidate configuration precedence is explicit `--candidates <json-file>` and `--economy <model>`, then `SKILLS_MODEL_CANDIDATES_FILE`, then `<project>/.agents/model-candidates.json`. Use `/configure-model-routing` to create either supported file. The profile shape is:

```json
{"economy":"provider/economy","candidates":[{"model":"provider/economy","cost":1,"description":"ordinary work"}],"routing":"auto"}
```

Candidates are ordered weakest to strongest; costs are independent and may vary in either direction. Without a profile, routing preserves the economy behavior and reports that no profile was used, so a manual handoff enforces no model. The Herdr Stop hook uses the same precedence, requires successful routing when a profile exists, and launches no pane on malformed profiles or routing errors.

`candidates` must be a non-empty array of unique objects with an exact native `model` string, a finite non-negative caller-supplied `cost`, and a non-empty capability `description`. `economy` must identify one candidate. The response includes `model`, `source`, `candidates`, `availableCandidates`, `confidence`, and `probabilities`; JEV responses also include expected losses and helper usage. Credentials are read only by the typed-judgment helper and are never placed in request or response artifacts.

## Policy

Implementation, mutation, tool-oriented, and unknown phases always use `economy` without JEV. Eligible non-mutating phases use JEV only when more than one candidate is supplied. The helper combines JEV adequacy probabilities with normalized candidate cost and an under-provision penalty, selecting the candidate with the lowest expected loss. A standalone portable call falls back to `economy` with `source: "fallback"` and a `reason` when the sibling typed-judgment helper or JEV service is unavailable. Atomic passes `requireJev` and fails closed instead of falling back.

## Quota-aware routing

Quota mode is opt-in so portable routing keeps its existing economy behavior by default. With `quota_mode=omp`, the helper reads `omp usage --json`, validates the snapshot and each matched report's `fetchedAt`, provider capacity, account cardinality, status, and `amount.remainingFraction`, then filters exact candidates before Jev. Provider filtering means only the provider named by a candidate's model is evaluated; it does not select or switch accounts.

The safe policy is fail closed: stale or malformed snapshots or reports, unknown headroom, zero or exhausted limits, unknown account binding, no matching provider account, multiple matching accounts, exhausted provider capacity, and insufficient remaining headroom exclude a candidate. An empty eligible set or a fixed economy model excluded by quota is an error. Account binding requires one explicit report account identifier; it is evidence that the usage report is attributable, not a concurrency reservation. The snapshot creates no reservation or lock, so concurrent native runs can race after filtering; re-read at the dispatch boundary or stop.

`quota_mode=agent-router` is not a route-only reservation mode and has no safe production caller in this repository. The current upstream router exposes only a real `router run TASK --json --usage --no-enrich` launch; its output does not prove the exact phase prompt, existing task worktree, and caller-selected account binding required here. Atomic and manual First Sergent therefore report this Herdr path as externally blocked; they never use dry-run or an unbound fallback.

Atomic adapts its existing `model`, `reasoning_model`, and `available_models` inputs into this contract. Omitted availability preserves the Luna-fast economy and Sol escalation compatibility path. Explicit candidate objects are preferred for portable callers because they carry the cost and capability data required for multi-model routing.
An opted-in manual First Sergent first routes the orchestrator worker itself on the economical candidate, then uses this same helper before every phase: code-writing and other mutating phases stay on economy; eligible reasoning phases may select a stronger configured candidate. Its chat liaison is not a phase model router, and a recommendation without a native model argument does not enforce either worker's model. Atomic First Sergent uses the existing delivery controller's routing and recorded model attempts, not a parallel route or fallback. See [First Sergent delivery](../workflows/delivery.md#optional-first-sergent-at-deliver).

## Candidate discovery

Pi may discover exact candidates with `pi --list-models`, and Oh My Pi may discover them with `omp models --json`, only when those documented public commands are available. Missing or failed discovery falls back to explicit input. Claude Code and Codex require explicit caller or configuration candidates; this repository does not scrape provider-private catalogs or import provider SDK internals. A candidate list is caller-owned capability information, not proof that the current account will accept the model.

Herdr handoffs pass a selected model after the native argument separator, as `herdr agent start ... -- --model <model>`, when candidates are configured and the native command supports enforcement. Manual handoffs print `Recommendation only: <model>` because a standalone skill cannot force the next session's model.

## Evidence storage

Atomic record each model pick with stage decision under `<task-root>/<slug>/.atomic-delivery/<run-id>/`. Repo instructions configure `<task-root>`, default `.agents/tasks`. Stage still check provider availability; catalog entry no prove current account accept model.

## Defaults

The economical default is `openai-codex/gpt-5.6-luna-fast`. Atomic's reasoning compatibility default is `openai-codex/gpt-5.6-sol`. These are policy defaults, not billing or quality claims. Use `routing: fixed` to select the economy candidate without JEV.
