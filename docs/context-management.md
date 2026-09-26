# Context management

Run each step in a new session. Its saved task document, called an **artifact**, carries facts to the next step. Atomic does this for you; when running skills by hand, open the new session yourself.

## Why phases, not one long session

Long conversations can make an agent miss rules, contradict decisions, or repeat work. Automatic summaries can lose exact paths and checks. These are risks, not guarantees about every model.

Keep each step small enough for one session. Save its results in a document rather than relying on chat history.

## The model

```mermaid
flowchart LR
  T[task.md] --> P1[node: skill, fresh session]
  P1 --> A1[artifact 01]
  A1 --> P2[node: skill, fresh session]
  P2 --> A2[artifact 02]
  A2 --> G{approval gate}
  G -- approve --> P3[next node, fresh session]
  G -- reject + text --> I[node: iterate skill, fresh session]
  I --> A2
```

- **Phase:** one skill in one fresh session. It reads `task.md` and selected artifacts, does its work, saves one artifact, prints its reply, and stops.
- **Artifact:** a saved Markdown document under `<task-root>/<slug>/`, where `<task-root>` is configured by repository instructions and defaults to `.agents/tasks`. It carries `type` and `summary` frontmatter. A later phase reads selected artifacts in full and `summary` from the others.
- **Transition:** Atomic chooses the next skill from the request and saved artifacts. A manual handoff names the next skill in its command fence and asks for a new session.
- **Gate:** Atomic's native prompt asks a person to review an artifact. Feedback starts the matching revision skill in a fresh stage. Running the next manual command records approval.

See [shared/CONVENTIONS.md](../shared/CONVENTIONS.md), especially "Phase isolation and context budget", and [workflows/delivery.md](../workflows/delivery.md) for controller inputs and gates.

### What one phase is allowed to read

A phase reads, in order:

1. `task.md`.
2. Its selected primary artifacts, completely.
3. Only `summary` from other artifacts.
4. Repository files through child workers when the skill provides them.
5. Directly, only files it must edit or cite.

When a skill needs to explore code, a worker returns a focused report with `path:line` references. The parent checks the facts it uses rather than copying the report.

### Child workers inside a phase

Research and implementation phases may use roles such as `agent-codebase-locator` and `agent-implementer`. Each worker receives the assignment, reads what it needs, and returns one structured message. The phase verifies any claim it uses. Workers do not write task artifacts; the parent applies their report.

Portable installs perform worker roles in the same session and say so in the reply; that is **not** a fresh worker boundary. Agent-specific installs may expose delegated workers. Changing `skills_dir` does not change which agent runs Atomic's steps.
## First Sergent and fresh workers

Optional `/deliver` First Sergent keeps a chat liaison separate from its delivery backend. Atomic remains the native controller and starts each phase with fresh context; its graph opens on launch and its awaiting-input gate does not wake the liaison. On a manual path, `agent-first-sergent` owns phase/session transitions only on a host with delegated fresh workers; otherwise follow ordinary manual new-session commands. A nested worker receives the task and selected artifacts, not the liaison conversation. Task-local state records the context checkpoint and the old child session identity; crossing a threshold requires a different observed child session identity, not a flag flip.

When `context_policy=stop-at-60`, a managed Oh My Pi transport may provide live `contextUsage` from its RPC `get_state` response. The accepted fields are `tokens`, `contextWindow`, and `percent`; `percent >= 60` saves the current artifact and starts a child session with a different identity. If the metric or identity is absent, the policy stops. Standard Atomic `ctx.task` exposes no documented live child context monitor, so Atomic blocks before dispatch rather than estimating or claiming universal 60% enforcement.

Atomic gate feedback must answer the exact native pending prompt; intercom steering or liaison chat does not approve a gate. Manual in-phase questions and action-time confirmations need a resumable child session, not an outer artifact gate. Manual Herdr use is possible only on explicit selection inside Herdr (`HERDR_ENV=1`), with cleanup limited to panes this delivery opened. The upstream router's Herdr launch is externally blocked here because no documented result proves prompt, worktree, and account binding.

## Fresh context per phase

Atomic uses `context: "fresh"` for each skill run, including revisions, implementation, verification, and review. New sessions receive feedback through their prompt and saved documents, not the previous conversation.

By hand, open a new session yourself:

| Runtime | New session | See context usage | Compaction | Subagents |
|---|---|---|---|---|
| Claude Code | `/clear` | `/context` | `/compact` is not a new phase | `Task` tool; a subagent cannot talk directly to you |
| Codex | `/new` | `/status` (or `/statusline` for a live footer) | `/compact` is not a new phase | multi-agent spawn tool; agents cannot talk directly to you |
| Oh My Pi | `/new` (or `/clear` to reset in place) | footer shows context % | `/compact` is not a new phase | `task` tool; a subagent cannot talk directly to you |
| Pi | `/new` | footer shows context % | `/compact` is not a new phase | none built in; phases perform worker roles inline |

Do not use compaction to move between phases. It keeps a summary; the next phase needs the artifact. Start a new session and run the fenced command when a phase ends.

Runtime notes: [Claude Code](../runtimes/claude-code.md), [Codex](../runtimes/codex.md), [Oh My Pi](../runtimes/oh-my-pi.md), [Pi](../runtimes/pi.md).

## Recognizing a degraded context

The collection treats these as warning signs that a session is losing track:

- rereads a file from the same session;
- contradicts `task.md` or its artifact;
- drops a stated constraint or repeats an answered question;
- loses its numbered step or starts a phase over;
- summarizes instead of citing `path:line`; or
- reports usage past half the window before the phase is complete.

When `context_policy=stop-at-60` is enabled, the native live metric and current child identity are the only accepted measurements. The first unavailable metric or identity, or a threshold boundary, saves the artifact and stops; the next worker must report a different session identity. The ordinary policy remains unchanged when the option is off.

## For skill authors

- Read only `task.md` and selected artifacts; use workers for codebase exploration.
- Save the artifact before printing the reply. A handoff ends with `Next action:`, `Open a new session in {run_location}, then run:`, and one command fence. A terminal reply has no fence.
- Stop on the first degradation sign and hand off from the saved file.
- Keep controller contracts in Atomic stage prompts and helpers, not ordinary skills. Preserve the standalone human reply and artifact-first behavior.

`npm test` checks reply shape, next-action labels, new-session instructions, shared links, and banned tokens for every skill.
