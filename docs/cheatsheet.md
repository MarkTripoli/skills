# Cheat sheet

Commands for the delivery packs, run from a git checkout of the project. Long form: [getting-started.md](getting-started.md), [workflows/delivery.md](../workflows/delivery.md).

## Install

```sh
curl -fsSL https://archon.diy/install | bash   # Archon 0.10 or later
archon setup                                   # provider: Claude Code, Codex, or Pi (Oh My Pi: skip, use the -omp packs)
npx github:MarkTripoli/skills                  # choose harnesses and all or specific skills, then install
```

The terminal menu preselects detected harnesses and offers a searchable skill picker. `--skill <name>` is the non-interactive equivalent; repeat it for more. A partial skill selection skips the Archon packs because their workflows require the complete collection. `--project` installs into the current repository but still writes the `~/.agents/skills` copy the packs read; `--no-packs` skips the packs, `--dry-run` prints the plan, and `--yes` skips menus and confirmation.

## One command

```sh
archon workflow run delivery-start --branch <slug> "Bug: add 1 2 prints NaN. Just fix it, no need to check with me."
archon workflow run delivery-start --branch epic-billing "Write the PRD for usage billing; I want to review the PRD and design, then split it into epics and issues"
```

The request decides the pack and the gates: hands-off wording runs unattended, "review the plan" keeps the planning gates, nothing said keeps every gate. `--input workflow=<pack>` and `--input gates=<...>` override. Unsure with gates on: the run pauses once at `confirm`; `archon workflow reject <id> "lean, outline"` names the pack and gates. In an agent session: `/deliver <request>`.

## Pick a pack

| Pack | When | Gates | Start |
|---|---|---|---|
| `delivery-oneshot` | small, fully specified, no design choice | `pr` | `archon workflow run delivery-oneshot --branch verbose-flag "Add a --verbose flag to the CLI"` |
| `delivery-bugfix` | observed differs from expected; no product code is edited before it reproduces | `reproduce`, `pr` | `archon workflow run delivery-bugfix --branch config-exit-code "Missing config file: the CLI exits 0; it should exit 2 and name the file"` |
| `delivery-lean` | shape is clear; several files and an ordering | `outline`, `phases`, `pr` | `archon workflow run delivery-lean --branch split-loader "Split the config loader into parser and validator modules"` |
| `delivery-full` | competing approaches, cross-module impact, a shared interface | `design`, `plan`, `phases`, `pr` | `archon workflow run delivery-full --branch plugin-formatters "Add a plugin system for output formatters"` |
| `delivery-prd` | the requirement itself is open; product-facing | `prd`, `tdd`, `plan`, `phases`, `pr` | `archon workflow run delivery-prd --branch csv-export "Export reports as CSV from the dashboard"` |
| `delivery-epic` | several mergeable deliverables, or more than about eight phases | `plan` | `archon workflow run delivery-epic --branch epic-build-billing-module "Build the billing module"` |
| `delivery-program` | requirements first, then epics and issues, then the children run | `prd`, `tdd`, `plan` | `archon workflow run delivery-program --branch epic-billing "Usage-based billing for teams"` |
| `delivery-epic-wave` | the next wave of an epic after its pull requests merged | none | `archon workflow run delivery-epic-wave --branch epic-billing --input epic_dir=.agents/tasks/epic-billing "next wave"` |
| `delivery-resolve-reviews` | reviewers commented on a pull request a run opened | none | [PR review rounds](#epics-and-pr-review-rounds) |

Other inputs: `--input review_each_phase=true` (full, lean, prd: one review pass after every phase), `--input task_dir=.agents/tasks/<slug>` (reuse a task directory), `--input skills_dir=<dir>` (default `~/.agents/skills`).

## Run and steer

```sh
archon workflow run delivery-full --branch plugin-formatters "Add a plugin system for output formatters"   # exits at the first gate, prints the run id
archon workflow approve <run-id> --detach
archon workflow reject <run-id> --detach "<what should change>"   # runs the iterate skill with this text, gates again
archon workflow wait <run-id>                                     # blocks until the next gate or the end
archon workflow get <run-id> --json                               # every node's state and output; --verbose adds summaries
archon workflow abandon <run-id>                                  # dead run; `runs` lists ids, `resume <run-id>` re-runs the failed node
```

`--quiet` on any command hides the JSON log lines. A fresh `run` of a pack refuses `--detach`; `approve`, `reject`, `respond`, and `resume` take it. `--branch` needs a git remote whose base branch exists (Archon cuts the worktree from it); `--no-worktree` runs in the live checkout instead.

## Model tiers

```sh
archon ai tier list                                                     # what small, medium, large resolve to (defaults: claude/haiku, sonnet, opus)
archon ai tier set large claude opus --effort high                      # persistent binding
archon workflow run delivery-lean --branch split-loader --model large=claude/sonnet "..."   # rebind for one run; repeat per tier
```

Every prompt node names its tier (`model: large` for authoring, implementing, and reviewing; `medium` for research, fixes, and reproduction); the `-omp` flavor reads `OMP_MODEL_SMALL|MEDIUM|LARGE` instead. Table, reasons, and routing by request: [model-routing.md](model-routing.md).

## Gates

`--input gates=all` (default) | `none` | `plan,pr` (comma list of the pack's names; an unknown name fails the run at node `gates`). With a gate off:
- `design`, `outline`, `prd`, `tdd`, `plan`, `pr`: the create skill runs once, no revision pass.
- `phases`: phases run back to back until the newest plan or outline has no `- [ ]` under a `## Phase N` or `## Step N` heading; 16 iterations fail the node.
- `reproduce`: up to 4 reproduction sessions, then the run cancels pointing at the artifact's `## Missing` list. The verification (every implementing pack, never gated, `--input verify=false` skips it) re-runs the repository's checks and the acceptance items in a fresh session, `iterate-implementation` on `failed`, at most 3 rounds; `blocked` cancels the run ([verification.md](verification.md)). The review loop (every pack, never gated) runs review-code, fix-code-review until `clean`, at most 4 rounds; `blocked` cancels the run.

Gates are fixed per run (`--input` and `--resume` are mutually exclusive); to add gates, start a new run on the same `--branch` with `--input task_dir=.agents/tasks/<slug> --input gates=<names>`.

## Where things go

`.agents/tasks/<slug>/` is committed on the run's branch: `task.md` as `docs(task): open <slug>`, each phase's artifacts as `docs(task): <phase> artifacts` (`research`, `design`, `outline`, `prd`, `tdd`, `plan`, `implement`, `review`, `reproduce`, `fix`, `pr`, `review-round`).

Slug: the request's first line, lower-cased, punctuation and hyphens to spaces, stop words dropped (`a an the to of for in on and or with that this add make create please fix bug`), first four words, `-2` when the directory exists: "Missing config file: the CLI exits 0; ..." gives `missing-config-file-cli`, "Add a plugin system for output formatters" gives `plugin-system-output-formatters`.

Artifacts are `NN-<type>-<slug>.md` (`04-plan-plugin-system-output-formatters.md`): `NN` is the highest present plus one, a revision edits the file in place. `pr-description.md` is unnumbered and published verbatim as the pull request body.

## Epics and PR review rounds

```sh
archon workflow run delivery-epic --branch epic-build-billing-module "Build the billing module"   # .agents/tasks/build-billing-module/, gate: plan
archon workflow approve <run-id> --detach   # start-epic-delivery creates one task dir per child, commits `docs(task): open epic children`, prints:
archon workflow run delivery-<child workflow> --base epic-build-billing-module --input task_dir=.agents/tasks/<child slug> '<child prompt>'
archon workflow run delivery-resolve-reviews --adopt <run-id> --input task_dir=.agents/tasks/<slug> "address the review comments"   # one review round
```

Run each child command from the project root on the epic branch; write prompt apostrophes as ` '\'' `, and a later wave starts after its dependencies merge into that branch. `--base` is the child's pull request target unless its existing pull request or `task.md` `base:` says otherwise. `--adopt` reuses the worktree and branch of the run that opened the pull request (`--branch <pr branch>` also works); run it again when reviewers respond.

## Oh My Pi

Same packs with an `-omp` suffix (`archon workflow run delivery-full-omp --branch ...`), installed when `oh-my-pi` is an install target; every AI node runs `omp -p --auto-approve --no-session --max-time=45m`, so `omp` must be on `PATH`. The flavor has no per-node cost, retry, or idle timeout: `--max-time=45m` is the only bound on a stuck session.

## Skills by hand

- Claude Code: `/create-plan @.agents/tasks/<slug>`; new session per phase with `/clear`.
- Codex: `$create-plan @.agents/tasks/<slug>`; fences show `/`, type `$`; new session with `/new`.
- Oh My Pi: `/create-plan @.agents/tasks/<slug>`; new session with `/new`.
- Pi: `/create-plan @.agents/tasks/<slug>`; new session with `/new`; worker roles run inline.

A skill given no task directory creates one and commits `docs(task): open <slug>`; a by-hand run commits its artifact as `docs(task): <type> artifact`. Paste the reply's fenced command into the next session.

## Develop / test

```sh
npm test                                # validator, plugin manifest check, node --test tests/
archon workflow test delivery           # every pack's fixtures/*.stubs.yaml; no agent, no run
node scripts/build-packs.mjs --check    # exit 1 when the OMP flavor is stale; drop --check to regenerate
npm run metrics -- --serve 9464          # serve Archon metrics for Prometheus
```
