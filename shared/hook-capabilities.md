# Local runtime capability probe

Claude Code 2.1.280 registration and blocking behavior remain unavailable from an isolated attempt. Oh My Pi 18.2.11 blocking behavior also remains unproven: the throwaway session stopped before any model response because authentication was unavailable. Codex CLI 0.157.0 reports stable hook support, but this probe did not isolate its blocking behavior. No PR was created or submitted.


## Capability matrix

| Runtime / installed version | Registration path observed | Event and payload | Blocking evidence | PR creation support and limit |
|---|---|---|---|---|
| Claude Code 2.1.280 | Existing user settings file `~/.claude/settings.json` has `hooks`; it was inspected but not modified or used. CLI supports `--settings` according to `claude --help`. | Existing settings include `PreToolUse` hooks (observed via agent inspection), but no isolated callback payload was captured. | **Unavailable / unproven:** probe agent ran no Claude invocation. No event block or process exit behavior observed. | No hook adapter claim. Keep the skill-level publication boundary until isolated probe demonstrates blocking behavior. |
| Oh My Pi 18.2.11 | `omp --hook <extension-file>` accepted as a CLI option; repo fixture `evals/iterate-evidence-hooks.mjs` is a working-pattern reference. | Fixture registers `tool_call`, whose event is read as `{toolCallId, toolName, input}`; it also registers `tool_execution_start` and `_end` for observation. | **Unavailable / unproven:** isolated `--hook` attempt exited 1 with `No API key found for openai` before model output; no event log was produced. Fixture code returns `{block:true, reason}` for `tool_call`, but live blocking was not observed. | A command is only intercepted when represented as an OMP tool call covered by the extension. No evidence that this prevents direct execution outside the session or other PR-creation paths. Keep the skill-level publication boundary. |
| Codex CLI 0.157.0 | `codex features list` reports `hooks stable true`; installed user config contains `~/.codex/hooks.json` event arrays, including `PreToolUse`; command hooks use `{ "type":"command", "command": ... }`. | Installed config proves event registration exists; payload was not captured in this probe. | **Unavailable / unproven:** no throwaway hook attempt was run. Stable feature status and a populated hook registry do not establish the hook's blocking result contract. | No PR guard claim. Require skill-level publication boundary unless a later isolated runtime probe demonstrates it. |

## Observed commands and evidence

- `claude --version` → `2.1.280 (Claude Code)`; `omp --version` → `omp/18.2.11`; `codex --version` → `codex-cli 0.157.0`.
- `claude --help`, `omp --help`, and `codex --help` expose runtime-specific launch/configuration surfaces. OMP help lists `--hook=<value>`; Claude help supports `--settings`; Codex's installed hook config path is `~/.codex/hooks.json`.
- `codex features list` → `hooks stable true`. The user config file was only read; its `PreToolUse` registrations show command-hook installation in use, but are not a throwaway behavior test.
- `omp --hook /tmp/nonexistent-hook-probe.mjs -p 'print no-op'` reported a hook-load failure, then returned the prompt response. This confirms the CLI consumes the option; it does not prove hook event registration or blocking.
- Isolated OMP attempt: `omp --no-extensions --no-skills --no-rules --no-session --cwd /tmp/omp-hook-probe.5Znm5E --hook=/tmp/omp-hook-probe.5Znm5E/hook.mjs --tools=bash --approval-mode=yolo --model=openai/gpt-5.2 --print "Invoke the bash tool exactly once with this harmless local command: printf 'OMP_HOOK_PROBE_LOCAL_ONLY\\n'. Do not call any other tool or command. After the tool result, stop."` exited 1 with `No API key found for openai`; no event log was created, so event payload and blocking remain unobserved.
- `evals/iterate-evidence-hooks.mjs:75-81` demonstrates the repo's OMP event contract and `{block:true, reason}` response form. Code pattern only, not live runtime proof.
- Claude probe agent inspected the existing `~/.claude/settings.json` and reported `PreToolUse` entries with a `Bash` matcher. It ran no Claude CLI invocation. Therefore event payload, block semantics and exit behavior are explicitly unavailable.

## Publication boundary

`skills/delivery/describe-pr/SKILL.md` is the current skill-level boundary. It requires current `evidence.recording` and verification artifacts, prohibits publication when required capture evidence is absent, and places PR creation/publication in a distinct gated workflow (lines 43-47, 51-52, 74-82). Hook interception supplements that policy; it cannot replace it because hooks are runtime-local and only cover registered events/commands.

## Limits and follow-up

- No real GitHub PR operation, remote publication, production hook installation, project/user hook configuration edit, formatter, linter, build, or project test was run.
- A feature flag or checked-in hook implementation is not live blocking proof. Record actual event, payload and returned/exit status from isolated probes before enabling a runtime-specific guard.
- Unsupported/unproven runtimes must fail closed at the skill publication boundary; do not claim hook enforcement from registration alone.
