---
date: 2026-09-18T12:17:17Z
git_commit: 1fcdc647f5d00c6f9bbf8501b06002657dd84f6d
branch: herdr-plugin-delivery-flow
repository: herdr-plugin-delivery-flow
topic: "Archon gate hand-off: current command surfaces, CLI contracts, and test fixtures"
type: research
summary: "Documents how herd-next's Archon gate mode and deliver's Archon reply currently print archon workflow commands rather than resolving a gate through prose, which archon workflow lines across four skill files are self-directed versus human-directed, the feedback-intent and ANSWER_INVENTORY/FENCE_ARTIFACT contracts a future change would have to satisfy, the documented wait/get/respond/--detach semantics, and the existing confirm-gate fixture and bare-remote scratch-git-repo test pattern. Answers all seven research questions from 01-research-questions-steer-every-archon-gate.md."
tags: [research, codebase]
status: complete
---

# Research: Archon gate hand-off: current command surfaces, CLI contracts, and test fixtures

**Date**: 2026-09-18T12:17:17Z
**Git Commit**: 1fcdc647f5d00c6f9bbf8501b06002657dd84f6d
**Branch**: herdr-plugin-delivery-flow
**Repository**: herdr-plugin-delivery-flow

## Research Question

1. In `skills/delivery/herd-next/SKILL.md`'s Archon gate mode and `skills/delivery/herd-next/references/herd_next_gate_answer.md`, how does the skill derive the task artifact path, review pane, and agent kind from the run's `working_path` and `metadata.approval` fields, and what does its reply state about watching for a later gate in the same run?
2. In `skills/delivery/deliver/SKILL.md` step 4 and `skills/delivery/deliver/references/deliver_archon_answer.md`, what does the skill do between starting the Archon run and printing its terminal reply, and does the skill's own process end at that point or continue running?
3. What is the input and output contract of `judge.mjs`'s `feedback-intent` command, and which existing Archon pack YAML nodes already call it?
4. How does `scripts/validate.mjs` discover each skill's answer templates and check them against `ANSWER_INVENTORY`, `FENCE_ARTIFACT`, and `HUMAN_GATE_ANSWERS`, and what structural properties does a template registered there need to satisfy?
5. What do `docs/getting-started.md`, `docs/cheatsheet.md`, and `workflows/delivery.md` document about the blocking behavior, exit conditions, and returned JSON fields of `archon workflow wait/get/respond`, and how does `--detach` change that flow?
6. In `.archon/workflows/delivery/start/delivery-start.yaml` and its `fixtures/confirm-lean.stubs.yaml`, what triggers the `confirm` pause, and how does an existing test such as `tests/wave.test.mjs` construct a scratch run against a bare remote?
7. Of the `archon workflow` lines in `deliver/SKILL.md` (3, 42, 44), `herd-next/SKILL.md` (83, 89, 95, 122), `resolve-pr-reviews/SKILL.md:12`, and `start-epic-delivery/SKILL.md:34`, which instruct the skill's own acting agent to run the command itself, and which are worded as instructions for the human reading the reply?

## Research Methodology

Six child workers (five `agent-codebase-analyzer`, one `agent-codebase-locator`) each read the exact files their assigned question named and reported findings with `path:line` citations; every claim below traces to those citations, cross-checked against the same lines read directly during orchestration. No web research was used. Every `path:line` claim was checked against its cited source lines with `judge.mjs cite` (see Known limits for the one adjustment this made).

### Known limits

- Neither `archon workflow wait --json` nor `archon workflow get --json` has a documented field-level JSON schema in `docs/getting-started.md`, `docs/cheatsheet.md`, or `workflows/delivery.md`; all three describe the output only qualitatively ("every node's state and output", "machine-readable"). The six explicit fields herd-next reads (`.status`, `.working_path`, `.metadata.approval.nodeId`, `.metadata.approval.message`, `.metadata.approval.decisions[].id`, `.metadata.approval.resolved`) come from `herd-next/SKILL.md`, not from the three documents.
- The TypeSafe System One API's exact JSON shape for a `type: "choice"` answer (the `probabilities` field's structure) is not declared anywhere in `judge.mjs`; every command that destructures it does so consistently, but no schema comment or type exists.
- `herd-next/SKILL.md:106`'s rule for resolving `$artifact` from `$msg` ("the task directory named in `$msg`, resolved against `$cwd`") names no parsing format for how a directory name is recognized inside the free-text `message` field.
- Q7's classification of `start-epic-delivery/SKILL.md:34` depends in part on the `delivery-wave` block's `children` input (`auto` vs `manual`), described in that same line; the `delivery-wave` block's own YAML source was not read to independently confirm that description.
- One citation was corrected after the `cite` check: the claim that `deliver_archon_answer.md:14` lists `archon workflow wait <run-id>` as an action available "to the user" was reworded below to state only what the line's text says, without asserting whose action it is beyond what the template's own wording supports.

## Summary

Two places print an `archon` command for a human to type today, and a third leaves nothing watching for what happens next. `herd-next`'s Archon gate mode stages an artifact read in a review pane but reports the `archon workflow respond <run-id> <decision> "<text>"` command in prose rather than staging it, because the pane can hold only one staged line at a time (`herd-next/SKILL.md:119-123`); its reply template then says the current invocation's watch is over and a later gate needs a fresh `/herd-next --run <run-id>` (`herd_next_gate_answer.md:5`). `deliver`'s Archon reply is explicitly terminal after the first pause or the run's end (`deliver/SKILL.md:46`), and its printed template lists `archon workflow approve/reject/wait` as follow-on commands (`deliver_archon_answer.md:14`) with no step describing the skill watching for a second pause. Every other `archon workflow` reference across the four skill files audited for question 7 is either the acting agent's own command (`deliver/SKILL.md:42,44`; `herd-next/SKILL.md:83,89,95`) or descriptive prose about context or a downstream, conditional consumer (`deliver/SKILL.md:3`; `resolve-pr-reviews/SKILL.md:12`; `start-epic-delivery/SKILL.md:34`) — the reject/respond line in `herd-next` is the one place among all eleven audited lines that is unambiguously worded for a human to type.

The two automation contracts this behavior would call into already exist and are exercised elsewhere in the collection: `judge.mjs feedback-intent` maps free-text reviewer feedback to `revise`/`proceed`/`stop` with a `T.decisive` (0.9) confidence bar on the risky choices, and is already called from four `until_bash`/`intent` node pairs across `delivery-implement.yaml`/`delivery-gate-phase.yaml` and their `-omp` twins; `scripts/validate.mjs` enforces a fixed shape on every answer template in `ANSWER_INVENTORY` (a terminal template has no fence, a forward-handing template has exactly one `text` fence naming a real skill, correctly carrying or omitting `@<file>` per `FENCE_ARTIFACT`, preceded immediately by one `Next action:` line and one `Open a new session in <location>, then run:` sentence). A confirm-style gate and a bare-remote scratch run both already have working examples in the repository: `delivery-start.yaml`'s `confirm` node pauses only when its `route` node computed `confirm=true` (unconfident routing plus gates not `none`), exercised end-to-end by `fixtures/confirm-lean.stubs.yaml`; and `tests/wave.test.mjs` builds a disposable git checkout, adds a bare `git init --bare` repository as `origin`, and asserts on the resulting push, a pattern reused by two of its tests.

## Detailed Findings

### 1. Two gate-pause replies print an `archon` command instead of resolving the gate through prose

**herd-next's Archon gate mode stages the artifact read but reports the decision command.** Entered when the caller passes `--run <run-id>` or names a run (`skills/delivery/herd-next/SKILL.md:78`), the mode blocks in the foreground on `archon workflow wait "$run_id" --json` (`herd-next/SKILL.md:89`; "so `wait` is a foreground process and this pane is held while it runs", line 86), then re-reads the paused run with `archon workflow get "$run_id" --json` into `$run` (line 95) and extracts six fields via `jq`:

| Variable | jq expression | Line |
|---|---|---|
| `status` | `.status` | 96 |
| `cwd` | `.working_path` | 97 |
| `node` | `.metadata.approval.nodeId // empty` | 98 |
| `msg` | `.metadata.approval.message // empty` | 99 |
| `decisions` | `.metadata.approval.decisions[].id` | 100 |
| `resolved` | `.metadata.approval.resolved // empty` | 101 |

A gate is live only when `status` is `paused` and `resolved` is empty; any other combination prints a skipped reply and stops (`herd-next/SKILL.md:104`). `$phase` is `$node` with a trailing `__cycle` stripped (so `design__cycle` labels the pane `<slug>/design`, same line). `$artifact` is the task directory named in `$msg`, resolved against `$cwd` (falling back to `$cwd` itself when `$msg` names none), and `$slug` is that directory's basename — "the run's own task, never the caller's, because `$cwd` is the run's `working_path`" (`herd-next/SKILL.md:106`). `$kind`, `$pane`, and `$name` are obtained by reusing the main flow's steps 4 through 6 (agent kind from `herdr pane current`, busy-check and pane split/tab-create, name truncation rule) with one substitution: `$cwd` replaces `$PWD` everywhere a pane or tab is opened, while the busy check still reads the caller's own `$HERDR_TAB_ID`/`$HERDR_PANE_ID` (`herd-next/SKILL.md:108`). The mode then notifies, starts the review agent, and stages only the artifact read (`herd-next/SKILL.md:111-115`):

```text
herdr notification show "Gate: $slug/$phase" --body "$msg" --sound request
herdr agent start "$name" --kind "$kind" --pane "$pane"
herdr pane rename "$pane" "$slug/$phase gate"
herdr pane send-text "$pane" "Read $artifact and report whether it is ready to approve."
```

The decision command is deliberately not staged alongside it: "The decision command is reported in the reply rather than staged in the same input line, because a pane holds one staged line at a time" (`herd-next/SKILL.md:119`), followed by the command in a `text` fence:

```text
archon workflow respond <run-id> <decision> "<what should change>"
```

(`herd-next/SKILL.md:121-123`). `respond` is described as "the general form" covering every id in `decisions[]` (line 125). The reply template that actually reaches the human, `references/herd_next_gate_answer.md:5`, restates the same command as something to run "from any pane": `Decide from any pane once you have read it: \`archon workflow respond <run-id> approve\`, or \`archon workflow respond <run-id> reject "<what should change>"\`.` This is the only one of the eleven `archon workflow` lines audited for question 7 that is unambiguously worded as an instruction for the human reader to type or paste themselves (see Finding 4 below).

**deliver's Archon reply reports run-continuation commands and declares itself terminal.** Step 4's own procedure computes the branch name, builds and runs `archon workflow run delivery-<pack> --branch <branch> --input gates=<gates> '<request>'` "from the project root, in the foreground, with no shell timeout under an hour" (`deliver/SKILL.md:42-43`), explicitly banning `--detach` ("Archon refuses it for a workflow that can pause", line 43) — so the skill's own step 4 is itself held in the foreground until the run pauses or ends, not a fire-and-forget dispatch. On a worktree-conflict failure the same step attaches with `archon workflow wait <run-id>` itself rather than starting a second run (line 44). After that wait resolves, the reply is filled from `references/deliver_archon_answer.md` and is explicitly stated to be terminal: "The reply is terminal: the run is already going, so no skill command follows." (`deliver/SKILL.md:46`). The template itself (`deliver_archon_answer.md:14`) prints: `` `archon workflow approve <run-id>` continues, `archon workflow reject <run-id> "<what should change>"` revises the artifact it paused on, `archon workflow wait <run-id>` blocks until the next pause or the end. `` Nothing in `deliver/SKILL.md` step 4 or its Rules section (lines 55-63) describes the skill itself waiting for or watching a second pause after this reply prints — the wait step 4 performs (line 39, "wait for its first pause or its end") covers only the first pause or the run's end.

#### Testing patterns

No test files were read for this finding; both skills are Markdown skill-definition documents with no associated automated test targeting their reply text.

### 2. Command lines in the four audited skill files split between self-directed and human-directed, with only one line unambiguously human-directed

Classifying all eleven named lines by whether the line instructs the skill's own acting agent to run the command, is worded for the human reader, or is neither (descriptive context):

| File:line | Text (abridged) | Classification | Basis |
|---|---|---|---|
| `deliver/SKILL.md:3` | frontmatter `description:` mentioning "start the `archon workflow run`" | Neither (context) | Sits before the numbered `## Steps` begin at line 12; a routing summary, not a step-body instruction |
| `deliver/SKILL.md:42` | `Command: archon workflow run delivery-<pack> --branch <branch> ...` | Self (agent runs it) | Under Step 4's header, "compute the branch name, start the run..." (line 39); next bullet confirms "Run it from the project root, in the foreground" (line 43) |
| `deliver/SKILL.md:44` | "Attach to it with `archon workflow wait <run-id>`..." | Self (agent runs it) | Same Step 4 bullet list, imperative voice, conditional branch of the same agent-executed procedure |
| `herd-next/SKILL.md:83` | `archon workflow status --json \| jq ...` | Self (agent runs it) | Under "Find the run when the caller named none" (line 80), executed by whichever agent is running herd-next |
| `herd-next/SKILL.md:89` | `archon workflow wait "$run_id" --json` | Self (agent runs it) | "so `wait` is a foreground process and this pane is held while it runs" (line 86) |
| `herd-next/SKILL.md:95` | `run=$(archon workflow get "$run_id" --json)` | Self (agent runs it) | Continuation of the same agent-executed sequence, "Read the paused state" (line 94) |
| `herd-next/SKILL.md:122` | `archon workflow respond <run-id> <decision> "<what should change>"` | Human (reply text) | Line 119: "reported in the reply rather than staged...because a pane holds one staged line at a time" |
| `resolve-pr-reviews/SKILL.md:12` | "Under Archon this skill runs in the worktree of the delivery run that opened the pull request (`archon workflow run delivery-resolve-reviews --adopt <run-id>`...)" | Neither (context) | Intro paragraph before `## Setup` (line 14); explains an already-established environment, not a step this skill executes |
| `start-epic-delivery/SKILL.md:34` | Step 11 computing `{child_start_command}` = `archon workflow run delivery-<workflow> --base <epic branch> ...` | Neither (context, conditionally human) | The skill's own instruction is only to fill the reply template (Rules line 39: "Never start a child's phases from this session"); whether the printed string is later run by a human or by the calling pack's `delivery-wave` block depends on that pack's `children` input (`auto` vs `manual`), stated in the same line |

The reply template's exact wording for the `auto`/`manual` split (`start-epic-delivery/SKILL.md:34`): "the `delivery-wave` block that follows this skill launches the ready children itself when the pack's `children` input is `auto` (the default); the printed commands are then the record of what it runs, and the way to start a child by hand when `children` is `manual`."

#### Testing patterns

No tests target these four Markdown skill-definition files.

### 3. `judge.mjs feedback-intent` maps free-text feedback to revise/proceed/stop and is already wired into two pack pairs

**Contract.** `feedbackIntent(text)` (`skills/delivery/typed-judgment/judge.mjs:426-439`) takes one text argument (`@file`, `-` for stdin, or a literal string, per the shared `textArg` convention at line 76) and asks a single `systemOne` `choice` question over `{ feedback }`:

```js
intent: choice("What does the reviewer's `feedback` ask the workflow to do", {
  revise: "Asks for changes to the artifact or work just reviewed before continuing",
  proceed: "Accepts the work as it is (including saying it is approved, fine, or that the wrong button was pressed), or only notes something for later; no change is requested before continuing",
  stop: "Asks to stop, abandon, cancel, or pause the run instead of continuing",
  unclear: "None of these can be told from the text",
})
```

(`judge.mjs:429-435`). The raw `{choice, confidence, probabilities}` answer is thresholded against `T.decisive` (0.9, defined at `judge.mjs:42`):

```js
const intent = (a.choice === "proceed" || a.choice === "stop") && a.confidence >= T.decisive ? a.choice : "revise";
```

(`judge.mjs:436-437`) — every other case, including `proceed`/`stop` below 0.9 confidence, falls back to `revise`. The function returns `{ text: intent, json: { intent, suggested: a.choice, confidence: a.confidence, probabilities: a.probabilities } }` (line 438); `main()`'s switch routes `"feedback-intent"` to it at line 625, and `--json` (stripped from `argv` at line 611) selects whether stdout is the bare word or the JSON object (line 639). Unavailability (`TYPESAFE_API_KEY` unset and no key file, an HTTP failure after retries, a response missing `answers`, or a timeout) throws `Unavailable` inside `systemOne` (lines 94-95, 116, 119, 123-125), which propagates to the top-level `main().catch()` and exits 3 with `judge: unavailable: <message>` on stderr (lines 646-647); `node` being absent is not handled inside `judge.mjs` at all — every call site guards it externally with `command -v node >/dev/null 2>&1` before invoking the script.

**Existing callers.** `grep -rn "feedback-intent" .archon/workflows/delivery/ .archon/workflows/delivery-omp/` returns eight hits across four files, in two node-pair patterns per pack:

| Pack file | Node | Line | Role |
|---|---|---|---|
| `delivery/implement/delivery-implement.yaml` | `phases` (`until_bash`) | 52 | `test "$intent" = proceed \|\| exit 1` gates loop completion |
| `delivery/implement/delivery-implement.yaml` | `intent` (bash) | 84 | Feeds `stopped` (cancel on `stop`) and `implement-phase`'s branch between `iterate-implementation` and the implement skill |
| `delivery/gate-phase/delivery-gate-phase.yaml` | `cycle` (`until_bash`) | 58 | `test "$intent" = proceed` is the loop's completion signal |
| `delivery/gate-phase/delivery-gate-phase.yaml` | `intent` (bash) | 76 | Feeds `stopped` and `phase`'s `when: "$intent.output.intent != 'stop'"` |
| `delivery-omp/implement/delivery-implement-omp.yaml` | `phases` | 53 | Same as native, one-line offset |
| `delivery-omp/implement/delivery-implement-omp.yaml` | `intent` | 85 | Same as native |
| `delivery-omp/gate-phase/delivery-gate-phase-omp.yaml` | `cycle` | 59 | Same as native |
| `delivery-omp/gate-phase/delivery-gate-phase-omp.yaml` | `intent` | 77 | Same as native |

Every call site pairs the invocation with `|| intent=revise` and a `case "$intent" in revise|proceed|stop) ;; *) intent=revise ;; esac` clamp, so a missing helper, missing `node`, or unexpected output all fall back to `revise`. `workflows/delivery.md:177` documents the same wiring in its Typed judgments table: "What a 'request changes' text asks for | `delivery-gate-phase` and `delivery-implement` `until_bash` (`proceed` ends the loop) and `intent` (`stop` cancels through `stopped`) | `feedback-intent` | `revise`".

#### Testing patterns

`tests/judge.test.mjs:33-34` asserts `feedback-intent` exits 3 with empty stdout against an unreachable base URL. `tests/judge.test.mjs:40-57` uses `feedback-intent` calls to probe the three API-key lookup locations (env var, `TYPESAFE_API_KEY_FILE`, default `~/.config/typesafe/api_key`), asserting exit 3 on a wrong key. `tests/judge.test.mjs:211-220` stubs the System One server and asserts the `T.decisive` boundary directly: `proceed` at confidence 0.95 prints `"proceed"` (line 216); the same choice at confidence 0.8 falls back to `"revise"` (line 218, comment: "proceed below 0.9 confidence stays a revision"); `stop` at 0.95 confidence via stdin prints `"stop"` (line 220).

### 4. `scripts/validate.mjs` cross-checks every answer template on disk against `ANSWER_INVENTORY`/`FENCE_ARTIFACT` and enforces a fixed handoff shape

**Discovery and cross-check.** `answerFiles` is built by walking every skill directory (`layout.skills`, from `scanSkills`) with `listFiles()` (recursive, skipping `.git`/`node_modules`/`dist`/`results`/`.cache`, `scripts/validate.mjs:204,215-227`), keeping files ending in `"answer.md"`, and rewriting each to a skill-relative path `<skill>/<relative-path>` (lines 322-324). Both directions of the cross-check are one-line loops: a file on disk with no entry in `ANSWER_INVENTORY` fails ("answer template missing from the declared inventory", line 326); an `ANSWER_INVENTORY` key with no file on disk fails ("declared answer template does not exist", line 327).

**`ANSWER_INVENTORY` value shapes.** Comment at line 36: "answer file -> skill named in the final fence, or TERMINAL_ANSWER when no skill follows." Three shapes: a literal next-skill string (e.g. line 38, `"describe-pr"`); the sentinel `TERMINAL_ANSWER = "<terminal>"` (line 34, e.g. line 51 for `deliver/references/deliver_archon_answer.md`); or an object mapping a workflow name to a next-skill name — `RESEARCH_VARIANTS` (line 28: `{ full: "create-design-discussion", lean: "create-structure-outline", prd: "create-prd" }`), `DELIVER_VARIANTS` (line 30), and `SOURCES_VARIANTS` (line 33, spreads `DELIVER_VARIANTS`).

**`FENCE_ARTIFACT`.** Records, per non-terminal answer file, whether its forward fence must carry `@<file>`: "`true` when the next skill acts on the specific artifact this phase produced...; `false` when the next skill reviews the whole diff or pull request, or resolves the newest artifact of a type itself" (lines 97-102). Consistency with `ANSWER_INVENTORY` is checked both directions (lines 384-387, 403-406), and a `TERMINAL_ANSWER` entry is forbidden from appearing in `FENCE_ARTIFACT` at all (line 381).

**`HUMAN_GATE_ANSWERS`.** Computed by filtering `ANSWER_INVENTORY` keys against a five-way regex alternation, excluding the three `PHASE_ANSWERS` paths (`implement-plan`/`implement-outline`/`iterate-implementation`'s `implementation_phase_final_answer.md`) even though the implementation-skill branch of the regex would otherwise match them (lines 177-187).

**Structural properties `checkHandoff()` enforces** (lines 336-373), run once per `ANSWER_INVENTORY` entry after `fillTemplate()` substitutes every `{placeholder}` with a concrete example value (lines 238-256, 375-400):
- Terminal answers (`expected === TERMINAL_ANSWER`): zero fenced blocks, zero occurrences of the `"Open a new session in "` prefix, zero occurrences of `"Next action:"` (lines 340-344).
- Non-terminal answers: exactly one fenced block, whose language tag is `text` (lines 346-348); the fence body matches `/^\/([a-z0-9]+(?:-[a-z0-9]+)*)( @\S+)?$/` — one line, `/<kebab-case-skill>` optionally followed by `@<token>` (lines 349-351); the named skill must exist in the repository's skill set and must equal the `expected` value for that entry or workflow variant (lines 352-353); `@<file>` must be present when `FENCE_ARTIFACT` says `true` and absent when it says `false` (lines 354-359); nothing may follow the closing fence once trimmed (line 360); the `"Open a new session in "` sentence and the `"Next action:"` label must each occur exactly once (lines 361-362); the sentence must match `/^Open a new session in (.+), then run:$/m` with a non-empty captured location, and the fence must immediately follow it, and `"Next action:"` must immediately precede it (lines 363-372).
- Separately, `HUMAN_GATE_ANSWERS` and `PHASE_ANSWERS` are checked on raw (unfilled) template source for the literal, unsubstituted `{artifact_link}` token occurring exactly once, a line that is exactly `Check:`, and (for human-gate answers) the word "approval" plus either "reply with (the) changes" or an `/iterate-` reference (lines 437-441); phase answers additionally require the literal string `"Deferred human evidence (recorded, not executed):"` and must not contain "approved"/"Approved" anywhere (lines 450-451).

#### Testing patterns

No dedicated test file targets `scripts/validate.mjs`; it is itself the validator invoked by `npm test` per `docs/cheatsheet.md:107`.

### 5. `archon workflow wait/get/respond` and `--detach` are documented qualitatively, consistently across three files

All three project documents (`docs/getting-started.md`, `docs/cheatsheet.md`, `workflows/delivery.md`) describe the same behavior in close to identical wording, with `workflows/delivery.md` the only one naming `--timeout`, `--json`, and the "general form"/"sugar" relationship explicitly.

- **`wait`**: blocks "until the next gate or the end" in all three (`getting-started.md:37,52`; `cheatsheet.md:46`; `delivery.md:141-142`). Only `delivery.md:146` adds: "With `--detach` a background child continues and the command returns at once; `archon workflow wait <run-id>` blocks until the run pauses or ends (`--timeout <seconds>` gives up earlier)." Only `delivery.md:148` states `--json` applies to `get`, `wait`, `runs`, `approve`, `reject`. No document gives field names for `wait`'s JSON output.
- **`get`**: `cheatsheet.md:47` and `delivery.md:91` use near-identical phrasing — "every node's state and output... `--verbose` adds the per-node summary" (delivery.md) / "summaries" (cheatsheet.md). `getting-started.md:61` states the same `--verbose`/`--json` split without the "every node's state and output" phrase, saying only that `get` "shows one" (run).
- **`respond`**: only `delivery.md:146` states the "general form"/"sugar" relationship: "`respond <run-id> <decision> [text]` is the general form; `approve` and `reject` are its sugar. The web UI and chat adapters offer the same two decisions." Neither `getting-started.md` nor `cheatsheet.md` uses this framing; both mention `respond` only as one of the commands accepting `--detach` (`getting-started.md:63`; `cheatsheet.md:51`).
- **`--detach`**: `getting-started.md:40` and `delivery.md:146` both state that without `--detach`, "approve or reject...runs the continuation in your terminal"/"in the foreground...until the next gate", and with it a background child continues and the command returns at once (`cheatsheet.md` shows only the `--detach` examples without stating the without-flag contrast at the same location). All three state that a fresh launch of an interactive pack refuses `--detach` while `approve`, `reject`, `respond`, and `resume` accept it (`getting-started.md:63`; `cheatsheet.md:51`; `delivery.md:147`); only `delivery.md:147,281` names the underlying mechanism as the packs declaring `interactive: true`, additionally noting (line 281, "Archon notes" item 6) that Archon's loader requires this field on any file with a pause node.

#### Testing patterns

No test file was read for this finding; it is drawn entirely from the three named documentation files, which contain no test code.

### 6. A confirm-style pause and a bare-remote scratch-git-repo test pattern both exist today

**`delivery-start.yaml`'s `confirm` node.** Pauses under `when: "$route.output.confirm == 'true'"` (`.archon/workflows/delivery/start/delivery-start.yaml:141-143`), with an `approval.message` templated from `$route.output.workflow/confidence/gates` and two decisions, `approve` and `reject` (lines 144-151). The `route` bash node computes `confirm` at lines 128-129: `confirm=false` by default, flipped to `true` only `if [ "$confident" = false ] && [ "$gates" != none ]`. `confident` defaults to `true` (line 68) and is only computed via the typed-judgment helper when `workflow` is `auto` (lines 69-81): confident only if the helper answered with `confidence >= 0.8` (line 78, via `awk`); an unanswering helper forces `workflow=full; confident=false` (line 80). An explicit `--input workflow=<pack>` skips the judge call entirely, so `confident` stays at its default `true` and `confirm` never flips — matching the design comment at lines 53-56: "an explicit `workflow` never confirms."

**`fixtures/confirm-lean.stubs.yaml`.** Stubs `route`'s output as `{"workflow":"full","gates":"all","suggested":"lean","confidence":"0.55","confirm":"true"}` (line 5) and `resolve`'s output as `{"workflow":"lean","gates":"outline"}` (line 6), simulating a reject text of `lean, outline`. Its `fixture` block (lines 8-13) asserts `expect: failed`, `fail-node: lean` (a dry run cannot execute a reachable `workflow:` child node, per the design comment at delivery-start.yaml:47-48), `reached: [route, confirm, resolve, task__create]`, and `resolved-text-contains: { confirm: "delivery-full (confidence 0.55) with gates all" }` — matching the templated `approval.message` with those values substituted.

**`tests/wave.test.mjs`'s bare-remote pattern.** `epicRepo()` (lines 54-73) builds a scratch git checkout via `fs.mkdtempSync`, `git init -q -b main`, an initial commit, then `git switch -q -c epic-x` and a second commit adding fixture `task.md` files. The bare-remote test ("launch: the epic branch is pushed to origin before any child is cut from it...", lines 139-174) additionally: (a) creates a bare repository, `fs.mkdtempSync(...)` then `git(origin, "init", "-q", "--bare")` (lines 141,143); (b) adds it as `origin` to the working checkout, `git(cwd, "remote", "add", "origin", origin)` (line 144); (c) asserts the resulting push at lines 157-158, comparing `git rev-parse origin/epic-x` against `HEAD` and confirming the upstream is set. A second test (lines 176-191) reuses the same `epicRepo()` fixture with a nonexistent remote path to assert a push failure. Both use `GIT_ENV` (lines 13-20, fixed author/committer identity and `GIT_CONFIG_GLOBAL=/dev/null`) and the `bash()` helper (lines 30-39, spawns `bash -c <body>` against a given `cwd` with injected env) to run each Archon node's bash body directly and deterministically outside of Archon itself.

#### Testing patterns

`archon workflow test delivery` runs every pack's `fixtures/*.stubs.yaml` with no live agent and no real run (`docs/cheatsheet.md:108`). `tests/wave.test.mjs` runs under `node --test tests/` (`docs/cheatsheet.md:107`) and exercises the `delivery-wave` block's bash node bodies directly, not through Archon.

## Code References

### Gate-pause reply surfaces
- `skills/delivery/herd-next/SKILL.md:76-127` - Archon gate mode: run discovery, `wait`, `get`, field derivation, notify/start/stage, decision-command reporting.
- `skills/delivery/herd-next/references/herd_next_gate_answer.md:1-5` - the printed reply, including the `archon workflow respond` line and the "watch ended at this pause" sentence.
- `skills/delivery/deliver/SKILL.md:39-46` - step 4, "With Archon": branch/command construction, foreground run, worktree-conflict handling, terminal reply.
- `skills/delivery/deliver/references/deliver_archon_answer.md:1-14` - the printed reply, including the `approve`/`reject`/`wait` follow-on line.
- `skills/delivery/resolve-pr-reviews/SKILL.md:8-13` - intro paragraph naming the Archon invocation that establishes this skill's worktree.
- `skills/delivery/start-epic-delivery/SKILL.md:12-42` - Steps and Rules, including step 11's `{child_start_command}` computation and its auto/manual consumer.

### Typed-judgment helper and its Archon callers
- `skills/delivery/typed-judgment/judge.mjs:42,93-129,426-439,609-650` - `T` thresholds, `systemOne`, `feedbackIntent`, CLI dispatch and `Unavailable`/exit-3 handling.
- `.archon/workflows/delivery/implement/delivery-implement.yaml:52,84` and `.archon/workflows/delivery-omp/implement/delivery-implement-omp.yaml:53,85` - `phases`/`intent` node pair.
- `.archon/workflows/delivery/gate-phase/delivery-gate-phase.yaml:58,76` and `.archon/workflows/delivery-omp/gate-phase/delivery-gate-phase-omp.yaml:59,77` - `cycle`/`intent` node pair.
- `workflows/delivery.md:166-184` - "Typed judgments" table and prose, row for `feedback-intent` at line 177.

### Answer-template validation
- `scripts/validate.mjs:28-95` - `ANSWER_INVENTORY` and its three value shapes.
- `scripts/validate.mjs:97-152` - `FENCE_ARTIFACT` and its rule.
- `scripts/validate.mjs:177-187` - `HUMAN_GATE_ANSWERS`/`PHASE_ANSWERS` computation.
- `scripts/validate.mjs:229-256,332-373` - `fences()`, `fillTemplate()`, `checkHandoff()`.
- `scripts/validate.mjs:375-406,432-452` - the calling loops and the separate wording checks.

### Documented CLI semantics
- `docs/getting-started.md:37,40,52,61,63,89` - `wait`/`get`/`--detach` behavior in the walkthrough.
- `docs/cheatsheet.md:44-51` - the same commands in the short form.
- `workflows/delivery.md:132-153` - "Steering a run" section: `wait`, `get`, `respond`/`approve`/`reject`, `--detach`, `interactive: true`.

### Confirm gate and bare-remote test fixtures
- `.archon/workflows/delivery/start/delivery-start.yaml:57-151` - `route` node's `confirm` computation and the `confirm` approval node.
- `.archon/workflows/delivery/start/fixtures/confirm-lean.stubs.yaml:1-14` - the fixture exercising that pause.
- `tests/wave.test.mjs:13-73` - `GIT_ENV`, `bash()`, `epicRepo()`.
- `tests/wave.test.mjs:139-191` - the two bare-remote tests.

## Architecture Documentation

The gate-pause surfaces in Finding 1 and the command classification in Finding 2 describe the same eleven-line population from two angles: which text is printed to a human today (Finding 1's two templates), and which of the audited lines across all four files are self-directed versus human-directed or contextual (Finding 2's table). Only one line among the eleven — `herd-next/SKILL.md:122`, echoed in `herd_next_gate_answer.md:5` — is unambiguously worded for a human to type; every other `archon workflow` reference in those four files is either the acting agent's own command or prose describing an already-established or externally-decided context.

The typed-judgment contract (Finding 3) and the validator's structural rules (Finding 4) are independent subsystems already exercised by the pack YAML and by `npm test` respectively; neither reads or depends on the gate-pause reply text in Finding 1, but both are wired into the same two pack files (`delivery-implement.yaml`, `delivery-gate-phase.yaml`) that also contain the `until_bash`/`intent` nodes consuming `feedback-intent`'s output (Finding 3), and any answer template a skill in this collection prints is the kind of file `scripts/validate.mjs` walks and checks (Finding 4) — the two herd-next/deliver reply templates named in Finding 1 are themselves entries in `ANSWER_INVENTORY` (`herd-next/references/herd_next_gate_answer.md` and `deliver/references/deliver_archon_answer.md`, both mapped to `TERMINAL_ANSWER`).

The documented CLI semantics (Finding 5) are the vocabulary Findings 1 and 6 both rely on: herd-next's gate mode blocks on `wait --json` and re-reads with `get --json` exactly as `workflows/delivery.md`'s "Steering a run" section describes those two commands behaving for a human running them by hand; the `confirm`/`resolve` fixture (Finding 6) exercises the same `approve`/`reject` decision shape that `respond` generalizes.

## Open Questions

None. All seven research questions were answered from the child workers' findings; see Known limits for the scope boundaries and one citation correction that apply to those answers.
