# Eval harness

`scripts/eval.mjs` measures whether an agent runtime, given one skill from this collection and a task directory, produces what the next phase needs: the artifact the skill owns, filled with content grounded in the task rather than template text, a reply that links that artifact and ends in the right handoff fence, and no writes or commits outside `.agents/tasks/`. Each case runs one phase against a throwaway fixture, is graded by deterministic rule graders, and is repeated `k` times so the report says how reliable the skill is on that runtime, not whether it worked once.

The harness has no dependencies beyond Node 20 and the runtimes it drives. Graders come from `skills/delivery/run-task/scripts/workflow.mjs` (`validateReply`, `validateArtifact`, `listArtifacts`, `parseReply`), the same code `run-task` uses, so the harness and the orchestrator agree on what a valid reply and artifact are; the content grader adds checks against the skill's own artifact template.

## Running

```sh
node scripts/eval.mjs --driver <omp|claude|codex|fake> [--case <name>...] [--k 3] [--model <spec>] [--json] [--keep] [--timeout <seconds>]
node scripts/eval.mjs --driver <driver> --chain <full|lean|prd|oneshot> [--model <spec>] [--with <skill,...>] [--strict] [--max-phases 12] [--json] [--keep]
```

| Flag | Meaning |
|---|---|
| `--driver` | Which runtime executes the phase (required). |
| `--case <name>` | Run only `eval/cases/<name>.json`; repeatable. Default: every case. |
| `--k <n>` | Runs per case (default 3). |
| `--model <spec>` | Model passed to the runtime (`omp --model`, `claude --model`, `codex -m`), recorded as `driver.model`. Use a cheap model for routine runs, for example `anthropic/claude-haiku-4-5` with `omp`. |
| `--chain <type>` | Run a whole workflow instead of cases; see Chains below. |
| `--strict` | Chain mode: stop at the first failed phase instead of continuing while the reply is still usable. |
| `--with <skill,...>` | Chain mode: optional phases to insert before `describe-pr` (`review-loop`, `record-evidence`), merged with the chain fixture's `with` list. |
| `--max-phases <n>` | Chain mode: safety cap on phases (default 12). |
| `--json` | Print the full result object instead of the Markdown report. |
| `--keep` | Keep the fixtures under the system temp directory and record their paths. |
| `--timeout <seconds>` | Per-run limit (default 1200). A run that hits it is killed with its process tree and recorded as a failure with reason `timeout`. |

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Every case has pass^k = 1. |
| 1 | At least one run failed a grader, timed out, or could not be spawned. |
| 2 | Usage error: unknown flag, unknown `--driver`, unknown `--case`, `--k` or `--timeout` not a positive number, or a case file with an invalid `kind` or `expect.artifactMode`. One line on stderr plus the usage line, no stack trace. |
| 130 | Interrupted. `SIGINT` or `SIGTERM` sends `SIGTERM` to the agent's process group, then `SIGKILL` 1.5 seconds later, removes the fixtures (unless `--keep`) and any codex temp directory, and exits. A second signal exits at once. |

### Drivers

Every driver receives the same prompt, the file form `run-task` uses:

```text
Read and follow <repo>/skills/<group>/<skill>/SKILL.md, the installed skill for /<skill>[ @<arg>], for task directory <task dir>. When finished, also write your complete final reply verbatim to <task dir>/replies/<NN>-<skill>.md.
```

`<NN>` is the next reply number for the task directory (`01` when the case seeds no replies). A case with `feedback` appends a blank line and `Feedback: <text>` to the prompt, which is how an `iterate-*` phase receives the change request. Each driver runs with the fixture as its working directory and returns `{ exitCode, stdout, stderr, durationMs, tokens: { input, output } | null, costUsd | null, model | null, argv }`; token, cost, and model extraction is best-effort and yields `null` when the runtime prints nothing recognizable. The whole stdout stream is parsed; only the copy stored in the results file is clipped.

| Driver | Command | Reply source when the reply file is missing | Tokens, cost, model |
|---|---|---|---|
| `omp` | `omp -p --mode json --no-title --auto-approve [--model <spec>] <isolation> "<prompt>"` (`--auto-approve` because print mode has no UI for approval prompts; the fixture is a throwaway repository) | Text of the last assistant `message_end` event, else the last assistant message in `agent_end` | Sum over assistant `message_end` events of `message.usage.input` plus `cacheRead` and `cacheWrite`, and `.output`; cost from `usage.cost.total`; model from the first event carrying a `model` string |
| `claude` | `claude -p "<prompt>" --output-format json --permission-mode acceptEdits <isolation> --allowedTools Read Write Edit Glob Grep Skill "Bash(git:*)" "Bash(ls:*)" "Bash(mkdir:*)" "Bash(cat:*)"` | Top-level `result` | Top-level `usage` (input plus cache tokens, output) and `total_cost_usd`; model from `result.model`, else the first key of `modelUsage` |
| `codex` | `codex exec -C <fixture> -s workspace-write --skip-git-repo-check <isolation> --json -o <tmp file> "<prompt>"` | The `-o` last-message file (its temp directory is always removed) | `usage.input_tokens` and `.output_tokens` from `turn.completed` events, else any event carrying those keys; no cost; model from `thread.started` or `turn.started`, else any event |
| `fake` | Parses skill, task directory, `@<arg>`, reply path, and feedback back out of the prompt text, then runs `node scripts/simulate.mjs phase <skill> <task dir> [@<arg>] --reply <reply file> [--feedback "<text>"]`; for a `run-task ... --status` prompt, `node skills/delivery/run-task/scripts/workflow.mjs status <task dir>` | stdout | none; model `fake` |

#### Isolation from home configuration

Real runtimes load skills, extensions, rules, hooks, and advisors from the user's home directory, which would make results depend on the machine. Each driver checks the runtime's `--help` output at start and passes every isolation flag it finds; the flags used are recorded as `driver.isolation` in the results and in the report header, so a run on an older runtime that lacks a flag is visible as such.

| Driver | Flags passed when present | What stays |
|---|---|---|
| `omp` | `--no-skills --no-extensions --no-rules --no-session` | Auth, model selection, built-in tools. `--profile` is not used because it also isolates auth, leaving the run without credentials. |
| `claude` | `--safe-mode --no-session-persistence` | Auth, model selection, built-in tools, permissions (`--safe-mode` disables CLAUDE.md, skills, plugins, hooks, MCP servers, custom agents). |
| `codex` | `--ignore-user-config --ignore-rules --ephemeral` | Auth from `CODEX_HOME`; the model falls back to the runtime default because `config.toml` is not read. |
| `fake` | none | n/a |

The `fake` driver costs nothing and exercises the harness, the cases, prompt composition, and the workflow module end to end: it reads the prompt the way an agent would, so a prompt that names the wrong skill, task directory, argument, or reply path fails the run. Run it before and after touching any of them:

```sh
node scripts/eval.mjs --driver fake --k 2
```

Real drivers spend tokens on every run. Start with one case and `--k 1`:

```sh
node scripts/eval.mjs --driver omp --case research-questions-lean --k 1
```

## Chains

`--chain <type>` runs the whole workflow the way `run-task` does, with the eval's fixture and graders: build the fixture from `eval/chains/<type>.json` (`slug`, `request`, `fixture.files`, `artifactContains`), then loop `nextCommand` from `workflow.mjs`, run the phase in a **fresh agent process**, grade it, and continue until the pull request handoff. Each phase is graded like a case whose expectations come from the phase table: artifact type, next skill, gate. Two chain-specific rules:

- Human gates are auto-approved and marked `autoApproved` in the results. This is test mode; a real user reviews the artifact there.
- `implement-*`, `oneshot`, `ci-commit`, and `fix-code-review` may edit and commit the repository (`allowCommits`, `allowedWrites: ["**"]`); `setup-worktree` may write under `.agents/`; every other phase must leave the repository untouched.

A phase that fails a grader but still ends with the predicted fence lets the chain continue, so one run measures every phase; the failure is recorded and the chain reports `FAIL`. A reply the module cannot follow (no fence, wrong command) stops the chain, exactly as `run-task` would stop. `--strict` stops at the first failure.

The additional `fence-command` grader compares the reply's whole fence line with the command the table predicts (`predictNext`), including the `@<file>` argument. Each phase record carries the runtime's session id when the driver reports one, so a chain result shows one session per phase.

The shipped chain fixture `eval/chains/lean.json` is a small Node CLI with tests and a `.agents/workspace.json` that has `disabled: true`, so no git worktree is created outside the temp fixture.

```sh
node scripts/eval.mjs --driver fake --chain lean                                        # no tokens
node scripts/eval.mjs --driver omp --chain lean --model anthropic/claude-haiku-4-5 --keep
```

## What a run does

1. Builds a fixture in `os.tmpdir()`: `git init`, the case's `fixture.files`, a `.gitignore` carrying `.agents/tasks/`, `.agents/tasks/<slug>/task.md` from the case's `request` and `workflow`, then any seeded `artifacts` and `replies` written verbatim, and one commit so the working tree starts clean. Records `HEAD` and `git stash list`.
2. Composes the prompt (above, or the case's `prompt` override) and runs the driver.
3. Grades the fixture. Every grader is a rule or code check; there are no model graders.
4. Deletes the fixture unless `--keep` was given.

### Graders

| Grader | Passes when |
|---|---|
| `reply-file` | `replies/<NN>-<skill>.md` exists. When it is missing, this grader fails; if the driver returned a final message, the remaining reply graders run against that message and the run carries a warning, so the report shows whether only the file was missed. Skipped (the last message is graded) when the case sets `expect.replyFile: false`. |
| `reply-shape` | `validateReply(reply, { expectSkill: expect.nextSkill })` reports no issue: one final `text` fence holding `/<nextSkill>[ @<file>]`, nothing after it, the fresh-session sentence once, no unfilled placeholders. Skipped when `expect.nextSkill` is null. |
| `artifact` | With `expect.artifactMode: "created"` (default): a new artifact (not one the case seeded) with frontmatter `type: <expect.artifactType>` exists. With `"modified"`: a seeded artifact of that type changed content and no new artifact of that type was added, which is how `iterate-*` phases are graded. In both modes `validateArtifact` must pass for it, including the `## Human Review` headings when the phase is a human gate. Skipped when `expect.artifactType` is null. |
| `artifact-content` | The body of the artifact found above (outside its frontmatter) holds no template placeholders: no `[Capitalized bracket text]` that is not a Markdown link, no bracketed phrase of more than three words, no `eng-xxxx`, no `{UPPER_CASE}` token. Every required `## ` section of the artifact template under `skills/delivery/<creating skill>/references/*_template.md` is present (a heading like `## Phase 1: [title]` matches by its prefix) and has at least one non-empty line that is not a heading or rule; a template section whose first line says it may be omitted or repeated is not required. Every regex in `expect.artifactContains` matches the body, which is how a case ties the artifact to its fixture and request (`src/index\.js`, `verbose`, `stderr`) so an artifact about some other task fails. Skipped when there is no artifact to check. |
| `reply-links` | When the fence carries `@<file>`, that file exists in the task directory; with `expect.fenceArgIsArtifact: true` it must be the artifact the `artifact` grader found. Every `Artifact saved:` or `Review artifact:` line carries a Markdown link whose target exists relative to the fixture root, and when the case expects an artifact one of those lines links it, so a reply of only the fresh-session sentence and a fence fails. |
| `scope` | `git status --porcelain --untracked-files=all` lists nothing outside `expect.allowedWrites`, `HEAD` did not move (the phase did not commit), and `git stash list` is unchanged. |
| `banned` | No file under the task directory contains a banned host token. |
| `reply-contains <regex>` | One grader per `expect.replyContains` entry; the regex (multiline) matches the reply. |

A run passes when no grader fails. Timeouts and spawn failures fail the run with that reason.

## Metrics

For each case with `k` runs:

- **pass@k**: 1 when at least one of the `k` runs passed, else 0. Measures capability: can the runtime do this phase at all.
- **pass^k**: 1 when all `k` runs passed, else 0. Measures stability: does it do it every time. This is the bar for phases that run unattended.

The report also gives `passes/k`, mean duration (over every run, including failed ones), mean tokens (input plus output, over runs that reported tokens), and mean cost when the driver reports one.

## Results

Every invocation writes `eval/results/<ISO timestamp>-<driver>.json` and `--json` prints the same object. The directory is gitignored; keep a result by copying it elsewhere. The object holds:

| Field | Meaning |
|---|---|
| `driver.name`, `driver.binary`, `driver.version` | The driver, its executable, and `<binary> --version` trimmed (null when it fails; the fake driver records the Node version). |
| `driver.isolation` | The isolation flags actually passed (see above). |
| `skills.root`, `skills.commit`, `skills.dirty` | The collection the run used: its path, `git rev-parse HEAD`, and whether `git status --porcelain` was non-empty. Compare results only across the same commit, or note the difference. |
| `node`, `platform` | `process.version` and `<platform> <os release> <arch>`. |
| `k`, `timeoutMs`, `startedAt`, `finishedAt` | Options and timing. |
| `cases[].name`, `kind`, `command`, `arg`, `workflow`, `expect`, `summary` | The case as loaded and its pass@k, pass^k, passes, mean duration, tokens, cost. |
| `cases[].runs[]` | Per run: `pass`, `reason`, `failed`, every grader with PASS/FAIL/SKIP and a message, `warnings`, `artifact` (the graded artifact's file name), `exitCode`, `durationMs`, `tokens`, `costUsd`, `model`, `argv` (the exact command the driver ran, prompt included), `fixture` (with `--keep`), `prompt`, `reply`, `stdout`, `stderr`, `outputTruncated`. |

Driver output is parsed in full for tokens, cost, model, and the last message; `stdout` and `stderr` in the file keep the first and last 64 KiB with an `[eval: N characters omitted]` marker in between, and `outputTruncated` says whether that happened.

## Cases

A case is one JSON file in `eval/cases/`:

```json
{
  "name": "research-questions-lean",
  "kind": "phase",
  "workflow": "lean",
  "slug": "verbose-flag",
  "request": "Add a --verbose flag to the CLI ...",
  "fixture": { "files": { "src/index.js": "...", "README.md": "..." } },
  "artifacts": { "01-research-questions-verbose-flag.md": "..." },
  "replies": { "01-create-research-questions.md": "..." },
  "command": "create-research-questions",
  "arg": null,
  "feedback": null,
  "prompt": null,
  "expect": {
    "artifactType": "research-questions",
    "artifactMode": "created",
    "artifactContains": ["src/index\\.js", "verbose"],
    "nextSkill": "create-research",
    "fenceArgIsArtifact": false,
    "gate": false,
    "replyContains": [],
    "allowedWrites": [],
    "replyFile": true
  }
}
```

| Field | Meaning |
|---|---|
| `name` | Case name; equals the file name without `.json`. |
| `kind` | `phase` (default): the case runs a workflow phase and grades its artifact and reply. `smoke`: the case checks instruction following against a fixed expected output, not a phase; the report labels it so its pass rate is not read as phase reliability. |
| `workflow` | `full`, `lean`, `prd`, or `oneshot`; written to `task.md`. |
| `slug` | Task directory name under `.agents/tasks/` (default `demo`). Seeded artifact names must end in `-<slug>.md`. |
| `request` | Body of `task.md`; its first line becomes `title`. |
| `fixture.files` | Project files, path to content, committed before the run. |
| `artifacts` | Files written verbatim into the task directory before the run (`NN-type-slug.md`). |
| `replies` | Files written verbatim into `replies/` before the run (`NN-skill.md`). |
| `command` | Skill to run, without the slash. |
| `arg` | Optional argument appended after `/<command>` in the prompt; a bare file name gets an `@` prefix, values starting with `@` or `-` are used as written. |
| `feedback` | Optional change request appended to the prompt as `Feedback: <text>` for `iterate-*` phases. |
| `prompt` | Optional prompt override. Placeholders `{repo}`, `{taskDir}`, `{skill}`, `{replyFile}` are substituted. |
| `expect.artifactType` | Frontmatter `type` the phase must produce, or null to skip the artifact graders. |
| `expect.artifactMode` | `created` (default): a new artifact of that type must appear. `modified`: a seeded artifact of that type must change in place and none may be added. |
| `expect.artifactContains` | Regexes (multiline) the artifact body must match; tie them to the fixture and request. |
| `expect.nextSkill` | Skill the final fence must name, or null to skip the reply-shape grader. |
| `expect.fenceArgIsArtifact` | When true, the fence's `@<file>` must be the graded artifact. Set it on phases whose handoff passes the artifact on (`create-plan` to `/setup-worktree @<plan>`). |
| `expect.gate` | Whether the artifact must carry the human-review sections (default: the phase's gate flag in `PHASES`). |
| `expect.replyContains` | Regexes the reply must match. |
| `expect.allowedWrites` | Globs of paths the phase may change outside the task directory. |
| `expect.replyFile` | Set false when the phase writes no reply file and the driver's last message is the reply (default true). |

To add a case: copy the closest existing file, change `command` and `expect`, seed the artifacts the skill reads (fill the real templates under `skills/delivery/<skill>/references/`; `validateArtifact` and the content grader must accept them), then run `node scripts/eval.mjs --driver fake --case <name> --k 1` to check the case itself before spending tokens on a real driver.

### Shipped cases

| Case | Kind | Phase | Seeds | Expects |
|---|---|---|---|---|
| `research-questions-lean` | phase | `create-research-questions` | a 20-line CLI, `workflow: lean` | a `research-questions` artifact whose body names `src/index.js` and `verbose`, a reply linking it, and a `/create-research` fence |
| `iterate-research-questions-feedback` | phase | `iterate-research-questions @01-research-questions-verbose-flag.md` with feedback "Add a question about how the CLI reports errors to stderr." | the CLI plus a research-questions artifact that does not mention stderr | the seeded artifact modified in place (no new artifact), now containing `stderr`, and a `/create-research` fence |
| `plan-from-outline` | phase | `create-plan` | research questions, research, and a structure outline for the same task | a `plan` artifact with human-review sections and filled phases naming `src/index.js` and `verbose`, a `Review artifact:` link to it, and a `/setup-worktree @<that plan>` fence, because the fixture has no workspace config and is not a worktree |
| `run-task-status` | smoke | `run-task --status` | a research-questions artifact and a valid `01-create-research-questions.md` reply | a status report (no fence) whose lines start `Task: `, `Next: /create-research`, and `Context: `. This checks that the runtime follows the skill's instructions and prints the report; under the fake driver it runs `workflow.mjs status` directly, so it is a plumbing check there, not a measurement. |
