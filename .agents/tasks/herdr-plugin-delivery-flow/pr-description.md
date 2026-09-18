Task: [`herdr-plugin-delivery-flow`](.agents/tasks/herdr-plugin-delivery-flow/task.md)

## Purpose

Continuing a delivery phase meant copying the handoff command into a new session by hand; the new `herd-next` skill turns that printed `/<skill> @<file>` line into a live Herdr pane with the command staged, and an opt-in Claude Code `Stop` hook does it unprompted.

## Special things to note

- The gate mode (`/herd-next --run <run-id>`) was run end to end against a real pause: a scratch `delivery-start` run parked at `confirm`, from a Herdr pane. `wait` returned, `get --json` read `paused` with no `resolved`, the notification showed, and the review pane opened at the run's `working_path` with the artifact read staged and unsubmitted; `respond` then flipped `resolved` to `"rejected"` (`10-verification-herdr-plugin.md` rows A2, A31).
- `typed-judgment/judge.mjs` now reads the TypeSafe key from `~/.config/typesafe/api_key` (or `TYPESAFE_API_KEY_FILE`) when the environment has no `TYPESAFE_API_KEY`. This run's nodes, and the `Stop` hook's future callers, never see an interactive shell's exports, so every judgment in this task fell back to the deterministic rule; with the file present they answer.
- Nothing is ever submitted. `herdr pane send-text` stages the line without Enter, so "running the next command records approval" stays true; `herdr agent prompt` runs only on an explicit `--submit`. The plan's auto-submit for a task declaring `gates: none` was dropped for this reason.
- Steps 3 to 7 now exist twice, as skill prose and as `stop_hook.sh` bash, because a `Stop` hook gets JSON on stdin and cannot call a model. The skill body names each divergence; drift between the two is the standing maintenance cost.

## Change outline

The skill and its three terminal replies are new; the rest is the registration a new skill requires.

```text
skills/delivery/herd-next/
  SKILL.md                              two modes: handoff, and --run gate watch
  references/
    stop_hook.sh                        steps 3-7 as bash, opt-in Claude Code Stop hook
    herd_next_answer.md                 pane opened, command staged
    herd_next_gate_answer.md            run paused, review pane opened
    herd_next_skipped_answer.md         nothing opened, with the reason
scripts/validate.mjs                    skill count 41 to 42, three TERMINAL_ANSWER rows
workflows/delivery.md                   phase-table row, by-hand skill list
.claude-plugin/plugin.json              manifest entry
README.md, docs/getting-started.md      utilities row, by-hand list
skills/delivery/typed-judgment/         key-file fallback in judge.mjs and its SKILL.md; tests/judge.test.mjs
shared/CONVENTIONS.md, workflows/delivery.md   the key sentence names the file
.changeset/herd-next-skill.md, .changeset/typesafe-key-file.md   minor, minor
```

Handoff mode, the path a user takes at the end of a phase:

```text
/herd-next
  test "$HERDR_ENV" = 1                 else the skipped reply, nothing changes
  parse /<skill> @<file>                last standalone line; never invented
  slug + phase                          from task.md and the parsed skill name
  kind = pane current --current         claude | codex | omp | pi
  pane list --workspace                 another task's pane on this tab?
    no  -> pane split --no-focus        direction from the caller's own rect
    yes -> tab create --label "$slug"
  agent start --pane                    agent_not_ready -> agent wait --until idle --until done
  pane rename "$slug/$phase"
  pane send-text "$command"             staged, no Enter
```

The hook runs the same sequence with two differences it states: the payload's `cwd` in place of `$PWD`, and no `-2`/`-3` name-collision walk. Every branch it cannot resolve without asking a question exits 0 and changes nothing, and it tears down a pane or tab it created if any later call fails.

## Human Review

### Review targets

- `skills/delivery/herd-next/SKILL.md` against `references/stop_hook.sh`: the two statements of steps 3 to 7 must keep agreeing.
- `stop_hook.sh` as the one piece of shipped executable code: it consumes model-produced text, constrains it to `^/[a-z0-9-]+( @[^ ]+)?$`, and passes it as one quoted argv element with no `eval` and no `sh -c`.
- `scripts/validate.mjs`: the count rises to what the scanner discovers and the three new replies are registered as terminal; no check was removed or relaxed.

### Verify

- [ ] `npm test` exits 0 with `ok: 42 skills, 57 answer templates, 20 human-review templates, 0 banned tokens` and `tests 62 / pass 62 / fail 0`.
- [ ] Install `stop_hook.sh` as a `Stop` hook with `timeout: 90` and finish a phase inside Herdr: a sibling pane opens at the same working directory, labelled `<slug>/<phase>`, with the command on the input line and focus unchanged.
- [x] With an Archon run parked at a gate, `/herd-next --run <run-id>` notifies and opens a review pane at the run's `working_path` with the artifact read staged (verification A2, A31: run `0236327f`, pane `w3F:pF`).
- [ ] With `TYPESAFE_API_KEY` unset and `~/.config/typesafe/api_key` present, `printf 'just fix it' | node skills/delivery/typed-judgment/judge.mjs autonomy --json -` prints a JSON verdict instead of exiting 3.
- [ ] `herdr pane current --current | jq -r .result.pane.agent` prints `claude`, `codex`, and `pi` in those runtimes, not only `omp` (verification A25, untested).
- [ ] A gate whose pack authored a decision id beyond `approve` and `reject` has that id reported in the gate reply (verification A30, untested).

### Known limits

- No automated test covers the skill body or the hook; neither is reachable from `node --test`. The suite proves registration only. Behavior was proved by running the real `herdr` CLI and a live Claude Code `Stop` payload, and by six stub-driven hook branches, recorded in `10-verification-herdr-plugin.md` and `17-code-review-herdr-plugin.md`.
- A full chain splits one pane per phase into the same tab with no bound; nothing closes the finished ones.
- Four review advisories stay open, none blocking: an untracked `.backups/` scratch tree at the repository root with no ignore rule, a one-character off-by-one between step 6's prose and the hook's `stem` guard, `--until done` accepting an agent that exited its startup dialog, and step 5's prose calling the hook's line match a fence match (`17-code-review-herdr-plugin.md`, ADV-015 to ADV-018).
- The typed-judgment helper was unavailable to every node of this run (`TYPESAFE_API_KEY` unset in Archon's environment), so the prose judgments in verification and review were made by hand and carry re-decide boxes in those artifacts. The key-file fallback in this pull request is what prevents that on the next run; it was proved from a shell without the variable after writing the file.
