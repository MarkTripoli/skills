# Cheat sheet

First time? [getting started](getting-started.md). Full workflow: [delivery reference](../workflows/delivery.md).

## Install

Need Node 20.12+. Terminal:

```sh
npx github:MarkTripoli/skills
npx github:MarkTripoli/skills codex --skill create-plan --yes
npx github:MarkTripoli/skills portable --project --yes
```

| Option | Effect |
|---|---|
| `claude-code`, `codex`, `oh-my-pi`, `pi`, `portable`, `all` | Pick agent. `portable` = plain skill file. `all` = all four |
| `--skill <name>`, `-s <name>` | Pick skill. Repeat for more, or `'*'` all |
| `--project` | Install in repo |
| `--global` | Install for user. Default |
| `--dry-run` | Show change, no write |
| `--yes`, `-y` | Skip menu + confirm. Default: found agent + all skill |
| `--uninstall` | Remove picked managed file |
| (every install, `--uninstall`) | Remove retired collection resources only when exact packaged historical fingerprints match; links, names and headers alone never establish ownership. Recheck fingerprints on apply; keep edited/unknown files, extra tree content and symlinks with notes. Sweep every runtime at the selected scope; dry-run lists actions. |
| `--list`, `--help` | List skill or usage, stop |

Uninstall no kill task doc or worktree.

### Opt-in nightly updates

The scheduler updates only an explicit runtime/skill selection from public release tags. Ordinary installation does not enable it.

```sh
# Preview scheduler files and selection without writes:
node scripts/install-updater.mjs --targets codex --skill show-me --print
# Enable the displayed selection:
node scripts/install-updater.mjs --targets codex --skill show-me
# Disable only the scheduler, preserving skills and updater state:
node scripts/install-updater.mjs --uninstall
```

Runs at 23:00 local time through macOS launchd or Linux user systemd. Repeat `--skill` for more names; `--skill '*'` deliberately selects the whole collection. For project scope, run the script by absolute path from the consumer checkout with `--project`. Re-enabling replaces the single saved selection. Runtime/model environment overrides and the selection live in `config.json` under `${XDG_STATE_HOME:-~/.local/state}/marktripoli-skills`; `--state-dir` chooses another external directory. It installs no team policy or instruction loader. After abrupt termination, confirm no updater is running before removing a stale `update.lock`.


### Configure model routing

```text
/configure-model-routing
```

Model-called skill. Use when no usable candidate profile exists. Codex users invoke `$configure-model-routing`; other harnesses use `/configure-model-routing`. Write project profile or user file named by `SKILLS_MODEL_CANDIDATES_FILE`, check with `route-model`.


Recorded look-and-fix: install companion + recorder dependency:

```sh
npx github:MarkTripoli/skills oh-my-pi --skill iterate-evidence --project --yes
```

Run `/iterate-evidence @<task-directory-or-iteration-receipt>` with wanted behavior + fix power. No default fix-round cap; owner can set one. `0`: look only. Picked uninstall take companion, leave recorder. Repo installer for dependency closure; plain skill copy no guarantee. See [the independent loop](getting-started.md#inspect-and-repair-recorded-behavior).
### File locations

| Agent | User skills | User workers |
|---|---|---|
| Claude Code | `~/.claude/skills/` | `~/.claude/agents/` |
| Codex | `~/.agents/skills/` | `~/.codex/agents/` + managed config block |
| Oh My Pi | `~/.omp/agent/skills/` | `~/.omp/agent/agents/` |
| Pi | `~/.pi/agent/skills/` | Worker role same session |
| Portable | `~/.agents/skills/` | Worker role same session |

Project skill: `.claude/skills/`, `.agents/skills/`, `.omp/skills/`, or `.pi/skills/`. Claude Code + Oh My Pi also local `agents/` dir. Codex project install skip worker + user config; install without `--project` for those.

### Other install methods

- Claude Code plugin: `/plugin marketplace add MarkTripoli/skills`, then `/plugin install marktripoli-skills@marktripoli`.
- [skills CLI](https://skills.sh): `npx skills@latest add github:MarkTripoli/skills` skill only.
- Pinned release: `npx github:MarkTripoli/skills#v<version>`.
- Checkout: `node scripts/install.mjs`. Build `dist/` with `npm run build -- --runtime <claude-code|codex|oh-my-pi|pi|portable>`.

Updating this checkout does not refresh installed skills unless you opted in with `git config skills.autoInstall auto` ([README](../README.md#working-from-a-clone)). Without it, after changing delivery, refresh the complete chain from the checkout rather than copying only `deliver`:

```sh
node scripts/install.mjs oh-my-pi codex --yes
```

Start a new agent session afterward. Existing sessions retain their loaded instructions. The installer preserves unrelated skills, configuration outside its managed worker block, task artifacts, and worktrees.

## Jira issue bodies

Use standalone [`jira-issue-hierarchy`](../skills/jira-issue-hierarchy/SKILL.md) and its [portable policy and Markdown bodies](../skills/jira-issue-hierarchy/references/jira-issue-templates/README.md) for a new Jira feature. Resolve the selected project and inspect its hierarchy, fields, QA labels and transitions before adapting templates. Plan Epics and Stories first; create implementation children when work starts. `video-iterative-orchestration` installs this companion for Jira work.

For a single `/deliver` ticket, [jira-issue-refinement](../skills/jira-issue-refinement/SKILL.md) reads the live issue and context before planning, saves confirmed functional specifications, QA steps, open questions, and exact plan deltas in a task artifact, and leaves Jira unchanged. An existing plan or outline is revised before implementation. A description rewrite requires separate approval for each ticket. Use the stronger model for planning/orchestration and delegated economy-model workers for bounded execution. Apply [SLICING.md](../shared/SLICING.md) before implementation; split a near-10,000-line or otherwise unreviewable PR into a small number of independent child PRs. When configured, `slack-coordinator` starts one run and its saved `slack_run_id` carries status and owner input across stages. UI delivery calls for tablet and mobile video plus screenshots in the PR's `## UI Evidence`, then current-head pipeline and review follow-up.

## Tool approval preflight

When unattended work is requested or a prompt appears, `/deliver` checks the invoking session and reports `no-prompt`, `prompts possible`, or `unknown`. It **warns and continues** when the live mode is not exposed; a config file or a second CLI process cannot certify this session. The skill never switches permissions. Opt into full access only in a trusted, externally isolated environment:

| Harness | Check the live session | Opt in to no-prompt tools for a new session |
|---|---|---|
| Claude Code | CLI footer or `/permissions` | `claude --permission-mode auto` for background safety review; `claude --dangerously-skip-permissions` for bypass |
| Codex | `/status` (`Full Access` requires both no sandbox and `never` approval) | `codex --sandbox danger-full-access --ask-for-approval never`; `codex --approve-for-me` uses automatic review but keeps workspace-write limits |
| Oh My Pi | `/settings` → Interaction → Approvals, including per-tool policies | `omp --approval-mode yolo` (ACP: `omp acp --yolo`) |
| Pi | Core Pi has no per-call approval mode; check permission extensions if installed | Core needs no switch; configure any prompting extension through its own controls (`pi --approve` is project trust, not tool approval) |

Auto tool decisions do not advance manual phase handoffs. Profile `routing: auto` is model selection, not approval. Explicit tool/organization policies can still deny or prompt.


## Manual phases

```text
/create-research-questions
/create-research @01-research-questions-example.md
/create-design-discussion @02-research-example.md
/create-plan @03-design-discussion-example.md
/record-evidence @<task-directory>
/implement-plan @04-plan-example.md
/verify-implementation
/review-code
/record-evidence @<task-directory>
/describe-pr
```

Each **new session**, in checkout + branch named by last reply. New branch: `<dev-name>/<issue-key-if-known>-<short-description>`; reuse existing. Real file name, not example. Codex: `$skill-name`. Change doc: its `iterate-*` skill + feedback.

The first recording invocation prepares the evidence policy and captures the authentic baseline before implementation when existing behavior changes. The second captures and inspects the result at the current revision. New behavior needs no fabricated baseline. Follow the saved contract's next action rather than running every example command unconditionally.

## `/deliver`

```text
/deliver Add a diagnostic --verbose flag across the CLI
```

`/deliver` is one orchestrator session: it picks the workflow from the request and the [size check](../shared/SLICING.md), plans, delegates each unit of work to a builder, and has a fresh reviewer on the strongest model check it. It stops on `done`, `needs-human`, `blocked` or `no-progress`; `/deliver <task-dir>` resumes. Without subagents it builds inline and prints a fresh-session handoff for each review. Codex: `$deliver`. `gates` is `plan` (default: stop for plan approval) or `none`; older `all` reads as `plan`. See [workflow choices](../workflows/delivery.md#workflow-choices-and-manual-chains), [model selection](model-routing.md).

## Existing tasks, PR feedback, and epic waves

Resume with `/deliver <task-dir>` in the task's original worktree, or run a phase by hand on its saved task directory: `/implement-plan @<plan>` for implementation, `/resolve-pr-reviews` for PR feedback, `/start-epic-delivery @<epic-plan>` for ready epic children. Create child worktrees from the epic branch, then copy each child's `<task-root>/<child slug>/` directory from the epic worktree into that child worktree. Child tasks wait for prerequisite branch merges. PR text does not prove merge.

## Authoring a skill

`/author-skill` creates or revises a skill in this collection: it starts from an eval scenario, scaffolds `skills/<name>/`, and loops over `node scripts/validate.mjs` and `node scripts/check-skill-practices.mjs` until both pass. [Skill instructions](../skills/author-skill/SKILL.md), [rules](../skills/author-skill/references/rules.md).

`/explain <topic>` selects an audience, grounds claims in inspected evidence and optionally creates an HTML page outside task roots. `/land-pr-stack <explicit PR scope>` lands a selected stack only with recorded merge authority, using GitHub by default and repository-declared release requirements. See the [workflow table](../workflows/delivery.md#phase-table).


## Additional independent skills

Install a row with `node scripts/install.mjs <runtime> --skill <name> --yes`; Codex invokes `$<name>`, other runtimes `/<name>`.

| Skill | Outcome | Prerequisites and boundary |
|---|---|---|
| [`product-brief`](../skills/product-brief/SKILL.md) | Source-backed product brief, reader feedback and optional sketches | Supplied request or sources; not an implementation plan |
| [`technical-writing`](../skills/technical-writing/SKILL.md) | Reader-specific technical prose and revision | Does not override the active artifact's required shape or approvals |
| [`assess-merge-risk`](../skills/assess-merge-risk/SKILL.md) | Source-scoped merge-risk report with checked evidence | Repository and selected change; not authorization to merge |
| [`static-implementation-audit`](../skills/delivery/static-implementation-audit/SKILL.md) | Ticket/design/code audit with submitted-video review | Accessible source material; not fresh runtime or hosted-publication proof |
| [`gitlab-inline-comments`](../skills/gitlab-inline-comments/SKILL.md) | Persisted GitLab diff comments verified at their actual positions | Explicit GitLab selection, authentication and posting authority |
| [`figma-design-system-sync`](../skills/figma-design-system-sync/SKILL.md) | Compare and update a repository-owned design system from Figma | Supplied design export, discovered token/component ownership and real render proof |
| [`flutter-ui-performance`](../skills/flutter-ui-performance/SKILL.md) | Audit rebuild/reload behavior, then implement measured slices | Flutter checkout and requested runtime proof |
| [`coasts`](../skills/coasts/SKILL.md) | Discover and operate a repository's declared Coast runtime | Coast CLI and repository configuration; no assumed application topology |
| [`simview`](../skills/simview/SKILL.md) | Make selected Android, iOS or browser work visible | Separately built [viewer](../tools/simview/README.md), selected device/browser and applicable companion tools |

## Where things live

- Skills: `skills/delivery/<name>/SKILL.md`, `skills/show-me/`, `skills/slack-coordinator/`. Slack daemon built + installed apart; see [Slack coordinator](slack-coordinator.md).
- Task doc: `<task-root>/<slug>/task.md`, authoritative `index.json` and immutable semantic artifacts, local to the worktree. Default root `.agents/tasks`; configured roots and explicit existing task directories follow the shared contract.

Worktree belong owner. No kill old/dead-run worktree as install cleanup.

GitHub delivery needs authenticated `gh` for the origin repository; `/resolve-pr-reviews` handles review threads. Existing GitHub Actions and releases remain authoritative.

Security scanning remains explicit opt-in through [`security-check`](../skills/delivery/security-check/SKILL.md), not a new mandatory delivery gate.
