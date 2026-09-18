---
date: 2026-09-18T02:05:09Z
git_commit: 4c7cdb26ef465fcd8012b5e359e6dd21994410fc
branch: herdr-plugin-delivery-flow
repository: skills
topic: "Herdr plugin for the delivery flow"
type: research
summary: "The by-hand delivery flow hands off phases through a printed command fence a human pastes into a new session; the Archon-orchestrated flow instead pauses one persistent run at a gate and resumes it through `approve`/`reject`/`wait`, with `get --json` exposing per-node state but no documented schema for 'active node' or 'paused gate' fields. This repository defines zero Claude Code hooks of its own (only git hooks and unrelated 'React hooks' text matches); the only live hook configuration on this machine is the user-level `~/.claude/settings.json`, whose schema is an event name mapped to an array of `{matcher?, hooks: [{type: \"command\", command, timeout?, async?}]}` objects. The plugin manifests (`plugin.json`, `marketplace.json`) declare only a flat skill-path list, no hooks or agents field; five build/install scripts fan the canonical `skills/` tree out into per-runtime `dist/` trees (or, for `npx` installs, an equivalent temp-dir tree) and a separate Oh My Pi flavor of the Archon workflow packs. All four target runtimes (Claude Code, Codex, Oh My Pi, Pi) document a non-interactive `-p`/`exec` process launch but none documents spawning a new OS terminal window or pane; end-of-session hook/event support diverges between declarative shell-command hooks (Claude Code, Codex) and in-process JS/TS extension callbacks (Oh My Pi, Pi)."
tags: [research, codebase]
status: complete
---

# Research: Herdr plugin for the delivery flow

**Date**: 2026-09-18T02:05:09Z
**Git Commit**: 4c7cdb26ef465fcd8012b5e359e6dd21994410fc
**Branch**: herdr-plugin-delivery-flow
**Repository**: skills

## Research Question

1. In `workflows/delivery.md`, how does a delivery phase currently signal that work should continue in a new session, both in the by-hand flow (the command-fence handoff under "Running skills by hand") and in the Archon-orchestrated flow (`archon workflow wait`/`approve`/`reject` under "Steering a run")?
2. Where do Claude Code hook definitions live in this repository and in this machine's `~/.claude/settings.json`, and what hook events (for example `SessionStart`, `Stop`, `SessionEnd`, `UserPromptSubmit`) are currently configured?
3. What structure do the existing configured hooks use to inject behavior into a session, and what inputs does a hook script receive and what output does it return to Claude Code?
4. How do `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` declare this plugin's skills, and what do `scripts/build-packs.mjs`, `scripts/build-runtimes.mjs`, and `scripts/sync-plugin.mjs` do to turn the source tree into the per-runtime `dist/` output that `scripts/install.mjs` installs?
5. What machine-readable state does `archon workflow get <run-id> --json` and `archon workflow wait <run-id>` currently return about a run's active node, paused gate, and completion, per the "Steering a run" section of `workflows/delivery.md`?
6. What do Claude Code's, Codex's, and Oh My Pi's current documentation say about starting a new session or terminal window/pane non-interactively with an initial prompt or command, and what hook or callback events, if any, fire when a session or skill run ends?

## Research Methodology

Repository evidence came from direct reads of `workflows/delivery.md`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `scripts/lib/build.mjs`, `scripts/build-runtimes.mjs`, `scripts/build-packs.mjs`, `scripts/sync-plugin.mjs`, `scripts/install.mjs`, `runtimes/*.md`, and the machine-level `~/.claude/settings.json`, gathered by one locator and three analyzer child workers and spot-checked directly against the cited files in this session. External evidence for question 6 came from one web-research child worker citing Anthropic's, OpenAI's, and the Oh My Pi/Pi projects' own current documentation.

### Known limits

- Typed-judgment ranking, citation, and coverage checks were skipped: `TYPESAFE_API_KEY` is not set in this environment. Question routing, candidate ranking, citation checks, and the coverage pass were done by direct reading instead; every `path:line` claim below was checked against the cited file in this session.
- `dist/` is gitignored and was not present on disk in this checkout; the per-runtime `dist/<runtime>/` layout described below is inferred from `scripts/lib/build.mjs` code plus matching prose in `runtimes/*.md`, not from an actual generated directory.
- `workflows/delivery.md` states that `archon workflow get <run-id> --json` "lists every node's state and output" (`workflows/delivery.md:91`) and that `--json` on `wait` "prints machine-readable output" (`workflows/delivery.md:148`), but shows no field-level JSON schema for either command anywhere in the file — no documented key for "active node," "paused gate," or "completion status."
- Oh My Pi's own docs site (`omp.sh`) is a client-rendered SPA that could not be fetched directly; Oh My Pi findings below come from the raw Markdown in the `can1357/oh-my-pi` GitHub repository instead, which that project's own CLI reference cites as the doc source.
- A secondary, unverified source claimed Codex's hooks framework first shipped in a specific release and ships disabled by default; OpenAI's own hooks page does not state a shipping version or default-enabled status, so that claim is not carried into this document.

## Summary

The by-hand and Archon-orchestrated delivery flows use two structurally different continuation mechanisms: a by-hand skill prints a fixed three-part reply a human copies into a brand-new session, while an Archon run pauses in place at a gate and is resumed against the same `run-id` (`workflows/delivery.md:132-154`, `:252`). This repository ships no Claude Code hook configuration of its own; the only working example of the hook schema on this machine is the 16-event, ~560-line `hooks` block in the user's global `~/.claude/settings.json` (`/Users/marktripoli/.claude/settings.json:39-603`). Claude Code's own hooks documentation (external) describes the full input/output contract that schema participates in: JSON on stdin, JSON or an exit code on stdout, and event-specific blocking/continuation semantics for `Stop` and `SessionEnd`. This repository's plugin manifests are pure skill-path lists (`.claude-plugin/plugin.json:1-57`, `.claude-plugin/marketplace.json:1-24`); packaging for other runtimes happens through a shared `buildRuntime()` function that `build-runtimes.mjs` and `install.mjs` both call, and `install.mjs` in particular never touches a checked-in `dist/`, building the same tree into a throwaway temp directory instead. All four candidate runtimes for a herdr plugin document a non-interactive `-p`/`exec`-style process launch and diverge on end-of-session hookability: Claude Code and Codex expose declarative, shell-command hooks with explicit `SessionEnd`/`Stop` events; Oh My Pi and Pi expose in-process `pi.on(event, handler)` extension callbacks, with Oh My Pi alone adding a Claude-Code-like `session_stop` continuation-control event that upstream Pi's documented event list lacks.

## Detailed Findings

### 1. The by-hand flow hands off through a printed command a human pastes into a new session

`workflows/delivery.md:252` states the full contract for a skill run without Archon: "A reply that hands off to another skill ends with `Next action:`, `Open a new session, then run:`, and one fenced `text` command naming that skill... Paste the command into a new session. A terminal reply ends with its current state and contains no command fence." The command inside the fence follows the invocation syntax given earlier in the same line, `/<skill> @<artifact or task dir>` (Codex: `$<skill>`) (`workflows/delivery.md:252`). A skill given no task directory "creates one from the request and commits `task.md` as `docs(task): open <slug>`" before that handoff (`workflows/delivery.md:252`).

Six skills that no Archon pack ever invokes — `gather-sources`, `iterate-research*`, `record-evidence`, `ci-commit`, `review-artifact-comments`, `show-me` — "run this way only" (`workflows/delivery.md:252`), so the command-fence handoff is their sole continuation mechanism. The same line notes that under Archon this printed text is inert: "Under Archon, the engine ignores the handoff copy because it already knows the next node" (`workflows/delivery.md:252`).

### 2. Archon steers one persistent run through gate pause, `approve`/`reject`, and `wait`

The documented loop (`workflows/delivery.md:136-143`) is:

```sh
archon workflow run delivery-full --branch verbose-flag "Add a --verbose flag ..."
# runs in the foreground, prints "Workflow paused" and the run id, and exits at the first gate
archon workflow approve <run-id> --detach
archon workflow reject <run-id> --detach "<what should change>"
archon workflow wait <run-id>
# blocks until the next gate or the end of the run; then approve or reject again
```

A gate is an `approval:` node with two decisions, `approve` and `reject` ("Request changes"); the pack reads the decision as `$gate.output.decision` and free-text feedback as `$gate.output.text` (`workflows/delivery.md:56`). On `reject`, that text "becomes the feedback the iterate skill applies to the newest artifact it owns... the gate then reopens"; on `approve`, "the loop's `until_bash` passes and the chain continues" (`workflows/delivery.md:56`).

`approve` and `reject` without `--detach` "run the continuation in the foreground through every AI node until the next gate"; with `--detach`, "a background child continues and the command returns at once," and `archon workflow wait <run-id>` then "blocks until the run pauses or ends" (`--timeout <seconds>` gives up earlier) (`workflows/delivery.md:146`). `respond <run-id> <decision> [text]` is documented as "the general form; `approve` and `reject` are its sugar," and "the web UI and chat adapters offer the same two decisions" (`workflows/delivery.md:146`). `--detach` is refused on "a fresh launch of an interactive pack" (the packs declare `interactive: true`) but accepted on `approve`, `reject`, `respond`, and `resume` (`workflows/delivery.md:147`). Gates are fixed for a run's lifetime: "`--input` and `--resume` are mutually exclusive, so `gates` cannot change mid-run" (`workflows/delivery.md:149`); adding gates requires starting a new run against the same task directory (`workflows/delivery.md:149`).

Unlike the by-hand flow, nothing is copy-pasted between sessions here: the human (or an automated caller) acts against one `run-id` that Archon keeps paused in a worktree until `approve`/`reject`/`respond` moves it forward, and `wait` is the polling primitive for a detached continuation.

#### Testing patterns

No test files were in scope for this question; `workflows/delivery.md` is documentation. `scripts/build-packs.mjs --check` (wired to `npm test`, `package.json:20,26`) validates that the generated `.archon/workflows/delivery-omp/` packs stay derived from the native YAML the "Steering a run" commands ultimately drive (see Finding 5), but does not test the CLI steering commands themselves.

### 3. Machine-readable run state is documented at the level of "an object exists," not a field schema

`archon workflow get <run-id> --json` "lists every node's state and output (`--verbose` adds the per-node summary)" (`workflows/delivery.md:91`). One additional, narrower fact appears at `workflows/delivery.md:281`: the resolved workflow/pack name is present in that JSON, used to detect a silent fallback to the `-omp` twin pack — "check the resolved name in `archon workflow get <run-id> --json` (tests assert on it)." Plain `get <run-id>` (no `--json`) is described only as returning "one run" (`workflows/delivery.md:152`), with no field list.

`--json` on `wait` is covered by one general sentence shared with `get`, `runs`, `approve`, and `reject`: "`--json` on `get`, `wait`, `runs`, `approve`, `reject` prints machine-readable output" (`workflows/delivery.md:148`). `wait`'s blocking condition is stated independently of `--json`, both as inline comment ("blocks until the next gate or the end of the run," `workflows/delivery.md:142`) and as prose ("blocks until the run pauses or ends," `workflows/delivery.md:146`). No example JSON object, field name, or shape is given anywhere in the file for either `get --json` or `wait --json` — contrast the `gates` bash node a few sections earlier, which does have a literal example, `{"design":"true","plan":"false",...}` (`workflows/delivery.md:67`), for an unrelated command.

#### Testing patterns

No test files were in scope for this question.

### 4. This repository defines no Claude Code hooks; the machine's global settings.json is the only live example of the schema

A repository-wide search for Claude Code hook event names (`SessionStart`, `Stop`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, etc.) and for a `"hooks"` key returned zero matches tied to the Claude Code hook mechanism:

- `.claude-plugin/plugin.json` (57 lines, read in full) has only `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, and `skills` — no `hooks` key (`.claude-plugin/plugin.json:1-57`).
- `.claude-plugin/marketplace.json` (24 lines, read in full) has only `name`, `owner`, `description`, and `plugins` — no `hooks` key (`.claude-plugin/marketplace.json:1-24`).
- No `hooks/` directory exists anywhere in the repository.
- `runtimes/claude-code.md`, the adapter doc most likely to document hook capability, has zero occurrences of "hook."

Every other repository hit for the word "hook" is either a git hook or an unrelated UI-framework term: `.githooks/commit-msg` (a git `commit-msg` hook enforcing Conventional Commits), its plumbing in `scripts/prepare.mjs:1,6,8,10` (sets `core.hooksPath`) and `tests/commits.test.mjs:10,132-140`, and several "React hooks" mentions in skill docs (`skills/delivery/create-research-questions/SKILL.md:31`, `skills/delivery/create-tdd/SKILL.md:67`, `agents/agent-codebase-pattern-finder.md:76`) that name a different, UI-programming sense of "hook."

The one live Claude Code hook configuration on this machine is the user-level `/Users/marktripoli/.claude/settings.json`, where a top-level `"hooks"` key opens at line 39 and its object closes at line 603, immediately followed by the unrelated `"statusLine"` key at line 604. Sixteen event names are configured as keys directly under `"hooks"`:

| Event | Opening line |
|---|---|
| `Notification` | 40 |
| `PermissionDenied` | 61 |
| `PermissionRequest` | 72 |
| `PostCompact` | 103 |
| `PostToolUse` | 123 |
| `PostToolUseFailure` | 193 |
| `PreCompact` | 223 |
| `PreToolUse` | 251 |
| `SessionEnd` | 332 |
| `SessionStart` | 360 |
| `Stop` | 425 |
| `StopFailure` | 471 |
| `SubagentStart` | 490 |
| `SubagentStop` | 518 |
| `TeammateIdle` | 546 |
| `UserPromptSubmit` | 557 |

#### Testing patterns

No tests apply; this is machine-level configuration, not application source.

### 5. Each hook event configures an array of matcher-groups, each holding one or more command entries

The JSON shape is consistent across all 16 events in `/Users/marktripoli/.claude/settings.json:39-603`: an event name maps to an array of "matcher-group" objects, each shaped `{ "matcher"?: string, "hooks": HookEntry[] }`, where each `HookEntry` is `{ "type": "command", "command": string, "timeout"?: number, "async"?: boolean }`.

`Notification` (`:40-60`) shows the base case: two matcher-group objects, one with `"matcher": "*"` running an `OpenIslandHooks` binary (`:41-49`), one with `"matcher": "permission_prompt"` running `moshi-hook claude-hook` with `"async": true` (`:50-59`). `PreToolUse` (`:251-330`) shows the same shape used for tool-scoped matching — literal tool names (`"Read"` at `:253`, `"Bash"` at `:262`), alternation patterns (`"Write|Edit|MultiEdit"`, `"Bash|mcp__graft__|Read|Grep|Glob"` elsewhere in the block), event-specific strings (`"AskUserQuestion"` at `:312`, `"ExitPlanMode"` at `:322`), and a matcher-group with two `hooks` entries in sequence for one matcher (`"Bash"` at `:262` runs both `rtk hook claude` at `:266` and a `destructive-guard.sh` script at `:270`). `Stop` (`:425-470`) shows the other extreme: all five of its matcher-group objects omit the `"matcher"` key entirely, confirming it is optional. `SessionStart` (`:360-424`) mixes an empty-string matcher (`""` at `:362`), several matcher-less objects, and one explicit `"*"` (`:397`).

Claude Code's own current hooks documentation (external; not part of this repository) describes what a configured hook command receives and returns, since the settings file only shows the command strings and not the runtime contract: every hook command gets one JSON object on stdin carrying common fields (`session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`), with event-specific fields added — `Stop` adds `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons`; `SessionEnd` adds `reason` (`clear`, `resume`, `logout`, `prompt_input_exit`, or `other`). A hook returns success via exit code 0 (optionally with JSON on stdout carrying `hookSpecificOutput.additionalContext` as non-blocking guidance), blocks via exit code 2 plus stderr or `{"decision":"block","reason":"..."}` on stdout, and any other exit code is a non-blocking error for most events. `Stop`'s block response forces Claude Code to keep going (capped at 8 consecutive blocks); `SessionEnd` hooks cannot block termination at all — a `systemMessage` in their output is discarded — and default to a 1.5s timeout, extendable per-hook or via `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` (see Finding 6, external source).

#### Testing patterns

No tests apply; this is machine-level configuration.

### 6. The plugin manifests declare a flat skill list; five scripts fan the source tree into per-runtime and per-orchestrator outputs

`.claude-plugin/plugin.json` (`:1-57`) carries `name` ("marktripoli-skills"), `version` ("2.1.0", kept in step with `package.json`'s version by `sync-plugin.mjs`), `description`, `author`, `homepage`, `repository`, `license`, `keywords`, and a 33-entry `skills` array of repo-relative paths such as `"./skills/delivery/ci-commit"` (`:22`) and `"./skills/show-me"` (`:51`). There is no `agents`, `hooks`, or `commands` field; `sync-plugin.mjs` explicitly deletes any stray `agents` key when it regenerates the file (`scripts/sync-plugin.mjs:34`). `.claude-plugin/marketplace.json` (`:1-24`) carries `name`, `owner`, `description`, and one `plugins` entry (`name`, `source: "./"`, `description`, `category`, `keywords`); `source: "./"` points Claude Code's own `/plugin marketplace add` / `/plugin install` flow at the repo root where `plugin.json` lives, bypassing every build script and `dist/` entirely (`README.md:42-45`).

Three generator scripts derive different outputs from the same canonical `skills/` tree, all built on `scanSkills()` (`scripts/lib/layout.mjs:12-51`), which classifies each skill directory as standalone (directly under `skills/`, holding `SKILL.md`) or grouped (one level under a kebab-case group directory, e.g. `skills/delivery/<name>`):

- **`scripts/sync-plugin.mjs`** (72 lines) rewrites `plugin.json`'s `skills` array to every non-`agent-`-prefixed skill and regenerates one `agents/<name>.md` file per `agent-*` skill (frontmatter `name`/`description` plus the skill's body) for skills whose name starts with `agent-` (`:28-40`); `--check` mode diffs without writing and exits 1 if stale (`:60-63`), run as part of `npm test` and after `changeset version` (`package.json:20,29-30`).
- **`scripts/build-packs.mjs`** (349 lines) is unrelated to the plugin/skill packaging path: it derives the Oh My Pi flavor of Archon's native workflow packs. `convert()` (`:185-295`) line-rewrites each native YAML under `.archon/workflows/delivery/` — renaming `delivery-*` to `delivery-*-omp`, rewriting every `prompt:` AI node into a `bash:` node that shells out to `omp -p --auto-approve --no-session --max-time=45m` (`:24`, `bashForPrompt()` at `:111-160`) — and writes the result to `.archon/workflows/delivery-omp/` (`:20`), sweeping away generated files whose native source no longer exists (`:320-336`); `--check` mode reports staleness without writing (`:340-349`), wired to `npm test`/`npm run check-packs` (`package.json:20,26`).
- **`scripts/build-runtimes.mjs`** (29 lines) is a thin CLI over the shared `buildRuntime()` function in `scripts/lib/build.mjs:71-108`: it validates `--runtime` against `RUNTIMES = ["claude-code", "codex", "oh-my-pi", "pi"]` (`scripts/lib/build.mjs:15`) and defaults `--dest` to `dist/<runtime>`. `buildRuntime()` reads the runtime's adapter doc `runtimes/<runtime>.md` (requires an H1 title and H2 sections "Skill notes" then "Install," `parseAdapter()` at `:20-36`), wipes `dest`, always creates `dest/skills`, and creates `dest/agents` only when `WORKER_FORMAT[runtime]` is set — `WORKER_FORMAT = { "claude-code": "md", "oh-my-pi": "md", codex: "toml" }` (`scripts/lib/build.mjs:18`), with no `pi` entry, so `dist/pi/` gets no `agents/` directory at all. Per skill, it copies the whole skill directory into `dest/skills/<name>` and splices a runtime note after SKILL.md's required blank line 6 (`:96-99`); for `agent-*` skills it additionally writes `dest/agents/<name>.md` (Claude Code, Oh My Pi) or `dest/agents/<name>.toml` plus a `config.snippet.toml` fragment (Codex) (`:101-117`). The resulting `dist/` layout per `runtimes/*.md` and the code: `dist/claude-code/skills/<name>/SKILL.md` + `dist/claude-code/agents/<agent-name>.md`; `dist/codex/skills/<name>/{SKILL.md, agents/openai.yaml}` + `dist/codex/agents/<agent-name>.toml` + `dist/codex/config.snippet.toml`; `dist/oh-my-pi/skills/<name>/SKILL.md` + `dist/oh-my-pi/agents/<agent-name>.md`; `dist/pi/skills/<name>/SKILL.md` only.

**`scripts/install.mjs`** (488 lines) is the consumer of that same `buildRuntime()` function but never reads a checked-in `dist/`: `main()` (`:411-488`) parses the target (`claude-code|codex|oh-my-pi|pi|portable|all`), computes a file-operation plan with no writes yet (`plan()`, `:187-249`), then `buildTrees()` (`:395-409`) builds the identical `skills/`(+`agents/`) tree into `fs.mkdtempSync(os.tmpdir())` (`:475`) — a temporary directory standing in for `dist/<runtime>` — before `apply()` (`:328-391`) copies from that temp tree into real per-runtime destinations resolved by `destinations()` (`:141-164`): `claude-code` → `~/.claude/skills` + `~/.claude/agents`; `codex` → `~/.agents/skills` + `~/.codex/agents` + a merged `~/.codex/config.toml` block; `oh-my-pi` → `~/.omp/agent/skills` + `~/.omp/agent/agents`; `pi` → `~/.pi/agent/skills` only; `portable` → `~/.agents/skills`. A `"packs"` step, gated on the full skill set being selected, copies `.archon/workflows/<packName>` directly from the live repo checkout (not the temp tree) into an Archon workflows destination (`:369-380`). The temp directory is removed in a `finally` block regardless of outcome (`:479-481`). For `npx github:MarkTripoli/skills claude-code`, the net effect is skills landing at `~/.claude/skills/<name>/SKILL.md` and worker agents at `~/.claude/agents/<agent-name>.md` — the same file shapes `dist/claude-code/` would hold, just never materialized under a literal `dist/` path during that run.

#### Testing patterns

`package.json:20` runs `node scripts/validate.mjs`, `node scripts/sync-plugin.mjs --check`, `node scripts/build-packs.mjs --check`, then `node --test tests/`; the `tests/` directory's specific coverage of these five scripts was not inspected in this pass.

### 7. All four runtimes launch non-interactively via a process flag; none documents spawning a new terminal window or pane

Every runtime documents the same shape for capability A: a flag or subcommand that runs the agent headlessly with an initial prompt and exits, not a feature that opens a literal new OS terminal window or pane and types into it.

- **Claude Code**: `claude -p "<prompt>"` (`--print`) runs the full agent loop non-interactively and prints the final result; `--output-format text|json|stream-json` controls output shape, `--continue`/`--resume <session_id>` continue a prior non-interactive session, and the process exit code (0 success, non-zero failure) lets a caller branch. ([Run Claude Code programmatically](https://code.claude.com/docs/en/headless))
- **Codex CLI**: `codex exec "<prompt>"` runs headlessly, streaming progress to stderr and the final message to stdout; `--json` turns stdout into a JSON-Lines event stream (`thread.started`, `turn.completed`, etc.), and `codex exec resume --last "<prompt>"` continues a prior run. ([Non-interactive mode](https://developers.openai.com/codex/noninteractive))
- **Oh My Pi (`omp`)**: `omp -p "<prompt>"` (or `--print`) runs headlessly; any explicit `--mode` (including `--mode text`) is documented as selecting a headless mode, and `--mode rpc` starts a JSON-RPC server over stdio for embedding. The project's own CLI reference is flagged by its maintainers as incomplete (23 of 37 subcommands and 23 of 59 flags undocumented, per [oh-my-pi issue #9252](https://github.com/can1357/oh-my-pi/issues/9252)). ([CLI reference](https://github.com/can1357/oh-my-pi/blob/main/docs/cli-reference.md))
- **Pi**: `pi -p "<prompt>"` (`--print`) prints the response and exits; `--mode rpc` exposes a headless JSON protocol over stdin/stdout, where an initial prompt is sent as `{"type": "prompt", "message": "..."}` after startup and a `new_session` command starts a fresh session within an already-running RPC process. Pi's own design docs state it "intentionally does not include... background bash" and suggest external tools such as tmux for that, but Pi's own `tmux.md` only documents TUI key-escape configuration, not programmatic pane spawning. ([Usage](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/usage.md), [RPC mode](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md))

None of the four runtimes' official documentation describes an API or flag for opening a new OS-level terminal window or pane and feeding it a prompt; each instead spawns a new **process**. This is reported as an absence in current documentation, not as a confirmed non-feature.

#### Testing patterns

Not applicable; external documentation only.

### 8. End-of-session hookability diverges: declarative shell hooks versus in-process extension events

Claude Code and Codex both document declarative, shell-command hook systems close in shape to the schema found in this machine's `~/.claude/settings.json` (Finding 4-5); Oh My Pi and Pi instead expose in-process JavaScript/TypeScript extension callbacks.

- **Claude Code**: roughly 30 documented hook events grouped as once-per-session (`SessionStart`, `SessionEnd`, `Setup`), once-per-turn (`UserPromptSubmit`, `Stop`, `StopFailure`), per-tool-call (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`), and narrower events (`PermissionRequest`, `SubagentStart`/`SubagentStop`, `PreCompact`/`PostCompact`, etc.). `Stop` "runs when the main Claude Code agent has finished responding" and can be blocked (forcing continuation, capped at 8 blocks) via `{"decision":"block","reason":"..."}` or exit code 2. `SessionEnd` "runs when a Claude Code session ends," cannot block termination, and adds a `reason` field (`clear`, `resume`, `logout`, `prompt_input_exit`, `other`). On SIGTERM during `claude -p`, only `SessionEnd` hooks run before exit. ([Hooks reference](https://code.claude.com/docs/en/hooks))
- **Codex CLI**: documents `SessionStart`, `SessionEnd`, `PreToolUse`, `PostToolUse`, `Stop`, `Interrupt`, and others, with event names deliberately mirroring Claude Code's. Hooks live in `hooks.json` or `[hooks]` tables in `config.toml` and require explicit trust via `/hooks` unless managed by policy. `SessionEnd` "runs for the main thread when you archive or delete a conversation that's still open, when Codex closes normally, or after a conversation has been idle... for 30 minutes," always runs synchronously even if configured `async`, and cannot steer or keep the session open. `Stop` can return `{"decision":"block","reason":"..."}` to make Codex "continue and automatically create[] a new continuation prompt" from that reason text. ([Hooks](https://developers.openai.com/codex/hooks))
- **Oh My Pi (`omp`)**: hooks are TypeScript/JS modules default-exporting `function hook(pi: HookAPI): void` that call `pi.on(eventName, handler)`, loaded through the same runner as regular extensions (`--hook` is an alias for `--extension`). `session_shutdown` is the closest `SessionEnd` analog, firing before a session runtime is torn down for cleanup. `session_stop` is an Oh-My-Pi-specific addition not in upstream Pi's documented events: a "main-session stop hook, awaited before settle," supporting the same advisory-continue-capped-at-8 and blocking-`decision`-takes-precedence pattern as Claude Code's `Stop`, and never firing for subagent sessions. ([Hooks](https://github.com/can1357/oh-my-pi/blob/main/docs/hooks.md), [Extensions](https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md))
- **Pi**: same `pi.on(event, handler)` extension-callback model, no declarative hook-config file. `session_shutdown` ("fired before a started session runtime is torn down... on exit (Ctrl+C, Ctrl+D, SIGHUP, SIGTERM)") is Pi's `SessionEnd` analog. Pi's documented event list has no blocking/continuation-control event equivalent to Claude Code's or Oh My Pi's `Stop`; the closest are `agent_end`/`agent_settled`, both pure notifications with no return value that can steer continuation. ([Extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md))

#### Testing patterns

Not applicable; external documentation only.

## Code References

### Delivery workflow orchestration
- `workflows/delivery.md:56` - gate decision contract (`$gate.output.decision`, `$gate.output.text`).
- `workflows/delivery.md:91` - `archon workflow get <run-id> --json` return description.
- `workflows/delivery.md:132-154` - "Steering a run" section: the `run`/`approve`/`reject`/`wait` loop, `--detach`, `--timeout`, `--json`, gate immutability.
- `workflows/delivery.md:250-254` - "Running skills by hand" section: the by-hand command-fence handoff contract.
- `workflows/delivery.md:281` - resolved pack name visible in `get --json`, used to detect a silent `-omp` fallback.

### Claude Code hook configuration (machine-level, not repository)
- `/Users/marktripoli/.claude/settings.json:39-603` - the full `hooks` block; 16 event-name keys, each an array of `{matcher?, hooks: [{type, command, timeout?, async?}]}` objects. Exhaustive for this machine's current configuration.
- `/Users/marktripoli/.claude/settings.json:251-330` (`PreToolUse`) and `:425-470` (`Stop`) - representative event blocks showing matcher variety and the all-matcher-less case, respectively.

### Repository hook-adjacent references (all git hooks or unrelated "React hooks" usage, not Claude Code hooks)
- `.githooks/commit-msg` - git `commit-msg` hook enforcing Conventional Commits.
- `scripts/prepare.mjs:1-10` - sets `core.hooksPath` to `.githooks/`.
- `tests/commits.test.mjs:10,132-140` - tests the git commit-msg hook.

### Plugin and marketplace manifests
- `.claude-plugin/plugin.json:1-57` - full plugin manifest; `skills` array only, no `hooks`/`agents` field. Exhaustive.
- `.claude-plugin/marketplace.json:1-24` - full marketplace manifest, one plugin entry with `source: "./"`. Exhaustive.

### Packaging and install scripts
- `scripts/lib/layout.mjs:12-51` - `scanSkills()`, shared skill discovery.
- `scripts/lib/build.mjs:15,18,20-36,71-108` - `RUNTIMES`, `WORKER_FORMAT`, `parseAdapter()`, `buildRuntime()`.
- `scripts/build-runtimes.mjs:1-29` - CLI wrapper around `buildRuntime()`, writes to `dist/<runtime>`.
- `scripts/build-packs.mjs:20,24,111-160,185-336,340-349` - native-to-Oh-My-Pi workflow pack generator and its `--check` gate.
- `scripts/sync-plugin.mjs:18-40,60-71` - derives `plugin.json` and root `agents/*.md` from the skill tree; `--check` gate.
- `scripts/install.mjs:36-68,141-164,187-249,328-409,411-488` - argument parsing, per-runtime destination resolution, planning, temp-tree build, and apply/copy steps for `npx`-style installs.
- `runtimes/claude-code.md`, `runtimes/codex.md`, `runtimes/oh-my-pi.md`, `runtimes/pi.md` - per-runtime adapter docs (`# title`, `## Skill notes`, `## Install`) parsed by `parseAdapter()`; describe the same `dist/` layout the build code produces.

## Architecture Documentation

A herdr plugin built for this delivery flow would sit on top of two independent continuation surfaces that do not share state today: the by-hand flow's printed command fence (Finding 1) and Archon's persistent, pollable `run-id` (Finding 2), with `get --json` exposing run state at a level this repository's own docs do not fully specify (Finding 3). Any hook behavior it registered as a Claude Code plugin would enter through the same declarative `{matcher, hooks: [{type: "command", command}]}` schema already populated in this machine's global settings (Findings 4-5), since this plugin's own manifest currently carries no `hooks` key to build on (Finding 6). If the plugin also needed to reach Codex, Oh My Pi, or Pi sessions, it would need three different integration shapes: Codex's schema closely mirrors Claude Code's shell-command hooks, while Oh My Pi and Pi require an in-process JS/TS extension registering callbacks rather than a settings-file entry (Finding 8) — and in all four cases, "opening a new panel" would mean launching a new headless process with `-p`/`exec`/`--mode`, since none of the four documents a way to script a new terminal window or pane directly (Finding 7).

## Open Questions

1. What are the exact JSON field names Archon's `archon workflow get <run-id> --json` and `archon workflow wait <run-id> --json` return for a run's active node, paused gate, and completion status? `workflows/delivery.md` confirms the commands return "every node's state and output" and "machine-readable output" respectively, but shows no schema or example object for either (Finding 3).

There is 1 open question that needs review; you can ask for another research pass, provide the answer, or tell me to remove it as irrelevant.
