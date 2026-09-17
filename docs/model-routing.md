# Model routing

Every `prompt:` node in the native packs names a tier, `model: small`, `model: medium`, or `model: large`, and Archon resolves the word to a provider and model when the node runs. The packs never name a model, so one binding change moves every run; `scripts/validate.mjs` (section 12) fails a prompt node without a tier word. Archon 0.10.1 ships `small` as `claude/haiku`, `medium` as `claude/sonnet`, and `large` as `claude/opus`; `archon ai tier list` shows the effective binding.

## Tier per phase

| Node | Tier | Reason |
|---|---|---|
| `delivery-research`: `create-research-questions`, `create-research`; `delivery-prd` `research` | medium | Reads code and writes it down; breadth over reasoning depth. |
| `delivery-gate-phase`: create and iterate authoring (design discussion, PRD, TDD, structure outline, plan, epic plan) and `describe-pr` | large, `effort: high` | Every later phase builds on the artifact; a wrong plan costs the rest of the run. |
| `delivery-implement`: `implement-phase`, `implement-phase-auto` | large | Multi-file code changes against a plan, one phase per fresh session. |
| `delivery-implement`: `review-phase`, `review-phase-auto`; `delivery-review`: `review-code` | large | A missed finding ships; the reviewer needs the strongest reader. |
| `delivery-implement`: `fix-phase`, `fix-phase-auto`; `delivery-review`: `fix-review` | medium | The findings are enumerated; the fix is scoped by the review artifact. |
| `delivery-bugfix`: `attempt`, `attempt-auto` | medium | Follows reproduction steps and records what happened. |
| `delivery-bugfix`: `fix` | large | Root cause and fix from the reproduction; the session commits its own code. |
| `delivery-oneshot`: `implement` | large | The only session doing the work; no plan to lean on. It commits itself, so there is no commit prompt. |
| `delivery-app-test`: `test-app`, `iterate-app` | large | Writes the test charter and grades what it observed; the iterate node changes code like `implement-phase`. |
| `delivery-epic`: `start` | medium | Creates child task directories from an approved plan. |
| `delivery-resolve-reviews`: `round` | medium | Answers enumerated review threads one by one. |

Workflow-level `model:` stays unset in every pack, so `archon ai tier set` and `--model` decide what a tier means.

## Effort

`effort:` is Archon's reasoning-depth field. The loader accepts `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, and `ultra` (its error for anything else lists exactly these); a provider without a rung clamps to its nearest one (`ultra` to `max` on Claude and Pi, `xhigh` on Copilot; `minimal` to `low` on Claude and Copilot). Only the gate-phase authoring nodes set it (`high`); the other nodes take the provider's default.

## Bind a tier

```sh
archon ai tier list                                   # effective binding per tier; --json for scripts
archon ai tier set large claude opus --effort high    # persistent; --scope user or --scope install
archon ai tier unset large                            # back to the built-in default
archon workflow run delivery-lean --branch split-loader --model large=claude/sonnet "Split the config loader"   # this run only
```

`--model <tier>=<provider>/<model>` repeats per tier and accepts only `small`, `medium`, `large`, or a `@alias` from `archon ai alias set`. Archon passes the model string to the provider SDK unchanged, so a misspelled model fails at the node, not at load.

## Oh My Pi flavor

Archon has no provider for Oh My Pi, so `-omp` nodes are `bash:` nodes and Archon's tiers do not reach them. The generator maps the fields instead: `model: <tier>` becomes `--model="$OMP_MODEL_<TIER>"` on the `omp -p` command when `OMP_MODEL_SMALL`, `OMP_MODEL_MEDIUM`, or `OMP_MODEL_LARGE` is set in the environment (unset: `omp` uses its own default); `effort: <level>` becomes `--thinking=<level>`, with `ultra` written as `max`. Neither field survives on the generated bash node, so Archon has nothing to warn about.

```sh
OMP_MODEL_LARGE=<provider/model> OMP_MODEL_MEDIUM=<provider/model> archon workflow run delivery-lean-omp --branch split-loader "Split the config loader"
```

## Route a run by the request

The static table assumes a request the pack was chosen for. A small request on `delivery-full` still runs its design and plan on `large`; rebind for that run when a cheaper tier is enough. `judge.mjs tier` (the `typed-judgment` skill) grades a request `small`, `medium`, or `large` from its complexity; it prints nothing and exits 3 without `TYPESAFE_API_KEY` or when the service is unreachable, so the `case` below falls through to no rebinding.

```sh
request="Add a --verbose flag to the CLI"
tier=$(node ~/.agents/skills/typed-judgment/judge.mjs tier "$request" 2>/dev/null) || tier=""
case "$tier" in
  small)  set -- --model large=claude/sonnet --model medium=claude/haiku ;;   # authoring and review on sonnet, research and fixes on haiku
  medium) set -- --model large=claude/sonnet ;;                              # authoring and review on sonnet, the rest as bound
  *)      set -- ;;                                                          # large or unknown: the bindings as configured
esac
archon workflow run delivery-lean --branch verbose-flag "$@" "$request"
```

The `delivery-task` block records the same grade as `complexity:` in `task.md` frontmatter (omitted when the helper is unavailable), which shows afterwards whether the run's bindings matched the request. `scripts/metrics.mjs` labels every node's duration, tokens, and cost with the resolved `model`, so a query on that label compares cost per tier ([observability.md](observability.md)).
