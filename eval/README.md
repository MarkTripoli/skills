# Eval harness

`scripts/eval.mjs` measures whether an agent runtime, given one skill from this collection and a task directory, produces what the next phase needs: the artifact the skill owns, a reply that ends in the right handoff fence, and no writes outside `.agents/tasks/`. Each case runs one phase against a throwaway fixture, is graded by deterministic rule graders, and is repeated `k` times so the report says how reliable the skill is on that runtime, not whether it worked once.

The harness has no dependencies beyond Node 20 and the runtimes it drives. Graders come from `skills/run-task/scripts/workflow.mjs` (`validateReply`, `validateArtifact`, `listArtifacts`), the same code `run-task` uses, so the harness and the orchestrator agree on what a valid reply and artifact are.

## Running

```sh
node scripts/eval.mjs --driver <omp|claude|codex|fake> [--case <name>...] [--k 3] [--json] [--keep] [--timeout <seconds>]
```

| Flag | Meaning |
|---|---|
| `--driver` | Which runtime executes the phase (required). |
| `--case <name>` | Run only `eval/cases/<name>.json`; repeatable. Default: every case. |
| `--k <n>` | Runs per case (default 3). |
| `--json` | Print the full result object instead of the Markdown report. |
| `--keep` | Keep the fixtures under the system temp directory and record their paths. |
| `--timeout <seconds>` | Per-run limit (default 1200). A run that hits it is killed with its process tree and recorded as a failure with reason `timeout`. |

Exit code is 0 when every case has pass^k = 1, 1 when any run failed, 2 on a usage error.

### Drivers

Every driver receives the same prompt, the file form `run-task` uses:

```text
Read and follow <repo>/skills/<skill>/SKILL.md, the installed skill for /<skill>[ @<arg>], for task directory <task dir>. When finished, also write your complete final reply verbatim to <task dir>/replies/<NN>-<skill>.md.
```

`<NN>` is the next reply number for the task directory (`01` when the case seeds no replies). Each driver runs with the fixture as its working directory and returns `{ exitCode, stdout, stderr, durationMs, tokens: { input, output } | null, costUsd | null }`; token and cost extraction is best-effort and yields `null` when the runtime prints nothing recognizable.

| Driver | Command | Reply source when the reply file is missing | Tokens and cost |
|---|---|---|---|
| `omp` | `omp -p --mode json --no-title "<prompt>"` | Text of the last assistant `message_end` event | Sum over assistant `message_end` events of `message.usage.input` plus `cacheRead` and `cacheWrite`, and `.output`; cost from `usage.cost.total` |
| `claude` | `claude -p "<prompt>" --output-format json --permission-mode acceptEdits --allowedTools Read Write Edit Glob Grep Skill "Bash(git:*)" "Bash(ls:*)" "Bash(mkdir:*)" "Bash(cat:*)"` | Top-level `result` | Top-level `usage` (input plus cache tokens, output) and `total_cost_usd` |
| `codex` | `codex exec -C <fixture> -s workspace-write --skip-git-repo-check --json -o <tmp file> "<prompt>"` | The `-o` last-message file | `usage.input_tokens` and `.output_tokens` from `turn.completed` events, else any event carrying those keys; no cost |
| `fake` | `node scripts/simulate.mjs phase <skill> <task dir>`; for `run-task`, `node skills/run-task/scripts/workflow.mjs status <task dir>` | stdout | none |

The `fake` driver costs nothing and exercises the harness, the cases, and the workflow module end to end; run it before and after touching any of them:

```sh
node scripts/eval.mjs --driver fake --k 2
```

Real drivers spend tokens on every run. Start with one case and `--k 1`:

```sh
node scripts/eval.mjs --driver omp --case research-questions-lean --k 1
```

## What a run does

1. Builds a fixture in `os.tmpdir()`: `git init`, the case's `fixture.files`, a `.gitignore` carrying `.agents/tasks/`, `.agents/tasks/<slug>/task.md` from the case's `request` and `workflow`, then any seeded `artifacts` and `replies` written verbatim, and one commit so the working tree starts clean.
2. Composes the prompt (above, or the case's `prompt` override) and runs the driver.
3. Grades the fixture. Every grader is a rule or code check; there are no model graders.
4. Deletes the fixture unless `--keep` was given.

### Graders

| Grader | Passes when |
|---|---|
| `reply-file` | `replies/<NN>-<skill>.md` exists. When it is missing, this grader fails; if the driver returned a final message, the remaining reply graders run against that message and the run carries a warning, so the report shows whether only the file was missed. Skipped (the last message is graded) when the case sets `expect.replyFile: false`. |
| `reply-shape` | `validateReply(reply, { expectSkill: expect.nextSkill })` reports no issue: one final `text` fence holding `/<nextSkill>[ @<file>]`, nothing after it, the fresh-session sentence once, no unfilled placeholders. Skipped when `expect.nextSkill` is null. |
| `artifact` | A new artifact (not one the case seeded) with frontmatter `type: <expect.artifactType>` exists and `validateArtifact` passes for it, including the `## Human Review` headings when the phase is a human gate. Skipped when `expect.artifactType` is null. |
| `scope` | `git status --porcelain --untracked-files=all` lists nothing, so the phase wrote only under the gitignored `.agents/tasks/`. Paths matching an `expect.allowedWrites` glob are ignored. |
| `banned` | No file under the task directory contains a banned host token. |
| `reply-contains <regex>` | One grader per `expect.replyContains` entry; the regex (multiline) matches the reply. |

A run passes when no grader fails. Timeouts and spawn failures fail the run with that reason.

## Metrics

For each case with `k` runs:

- **pass@k**: 1 when at least one of the `k` runs passed, else 0. Measures capability: can the runtime do this phase at all.
- **pass^k**: 1 when all `k` runs passed, else 0. Measures stability: does it do it every time. This is the bar for phases that run unattended.

The report also gives `passes/k`, mean duration, mean tokens (input plus output, over runs that reported tokens), and mean cost when the driver reports one.

## Results

Every invocation writes `eval/results/<ISO timestamp>-<driver>.json` with the options, every case, every run (graders with PASS/FAIL/SKIP and a message, warnings, exit code, duration, tokens, cost, the prompt, the graded reply, and the driver's stdout and stderr capped at 1 MiB each), and the per-case summary. `--json` prints the same object. The directory is gitignored; keep a result by copying it elsewhere.

## Cases

A case is one JSON file in `eval/cases/`:

```json
{
  "name": "research-questions-lean",
  "workflow": "lean",
  "slug": "verbose-flag",
  "request": "Add a --verbose flag to the CLI ...",
  "fixture": { "files": { "src/index.js": "...", "README.md": "..." } },
  "artifacts": { "01-research-questions-verbose-flag.md": "..." },
  "replies": { "01-create-research-questions.md": "..." },
  "command": "create-research-questions",
  "arg": null,
  "prompt": null,
  "expect": {
    "artifactType": "research-questions",
    "nextSkill": "create-research",
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
| `workflow` | `full`, `lean`, `prd`, or `oneshot`; written to `task.md`. |
| `slug` | Task directory name under `.agents/tasks/` (default `demo`). Seeded artifact names must end in `-<slug>.md`. |
| `request` | Body of `task.md`; its first line becomes `title`. |
| `fixture.files` | Project files, path to content, committed before the run. |
| `artifacts` | Files written verbatim into the task directory before the run (`NN-type-slug.md`). |
| `replies` | Files written verbatim into `replies/` before the run (`NN-skill.md`). |
| `command` | Skill to run, without the slash. |
| `arg` | Optional argument appended after `/<command>` in the prompt; a bare file name gets an `@` prefix, values starting with `@` or `-` are used as written. |
| `prompt` | Optional prompt override. Placeholders `{repo}`, `{taskDir}`, `{skill}`, `{replyFile}` are substituted. |
| `expect.artifactType` | Frontmatter `type` the phase must produce, or null to skip the artifact grader. |
| `expect.nextSkill` | Skill the final fence must name, or null to skip the reply-shape grader. |
| `expect.gate` | Whether the artifact must carry the human-review sections (default: the phase's gate flag in `PHASES`). |
| `expect.replyContains` | Regexes the reply must match. |
| `expect.allowedWrites` | Globs of paths the phase may change outside the task directory. |
| `expect.replyFile` | Set false when the phase writes no reply file and the driver's last message is the reply (default true). |

To add a case: copy the closest existing file, change `command` and `expect`, seed the artifacts the skill reads (fill the real templates under `skills/<skill>/references/`; `validateArtifact` must accept them), then run `node scripts/eval.mjs --driver fake --case <name> --k 1` to check the case itself before spending tokens on a real driver.

### Shipped cases

| Case | Phase | Seeds | Expects |
|---|---|---|---|
| `research-questions-lean` | `create-research-questions` | a 20-line CLI, `workflow: lean` | a `research-questions` artifact and a `/create-research` fence |
| `plan-from-outline` | `create-plan` | research questions, research, and a structure outline for the same task | a `plan` artifact with human-review sections and a `/setup-worktree @<plan>` fence, because the fixture has no workspace config and is not a worktree |
| `run-task-status` | `run-task --status` | a research-questions artifact and a valid `01-create-research-questions.md` reply | a status report (no fence) whose lines start `Task: `, `Next: /create-research`, and `Context: ` |
