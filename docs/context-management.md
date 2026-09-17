# Context management

The skills in this collection assume one thing about the agent running them: its context window is finite, and its judgment degrades long before the window is full. Everything in the workflow design follows from that. This guide explains the model, how the packs get a fresh context per phase, how to do the same by hand, and how to recognize a degraded session.

## Why phases, not one long session

A coding agent that plans, researches, designs, implements, and writes a pull request in one conversation carries every file it read and every dead end it explored into every later decision. Three things happen as the window fills:

1. Quality drops. The model starts contradicting its own earlier decisions, dropping constraints you stated, and re-reading files it already read. This begins well before the hard limit; treat the second half of any window as unreliable for design or implementation work.
2. Compaction loses the specifics. Every runtime compacts or summarizes when the window fills. Summaries keep the story and lose the file paths, exact checks, and known limits that the next step depends on.
3. Cost and latency grow with every turn, because the whole window is re-sent.

The workflow avoids all three by making the unit of work a phase that fits in one window and by making the artifact on disk, not the conversation, the memory between phases.

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

- **Unit**: one phase, one skill, one fresh session. It reads `task.md` and the artifacts it selects, does its work, writes one artifact, prints a reply, and stops.
- **Memory**: the task directory `.agents/tasks/<slug>/`, committed on the branch (`docs(task): open <slug>`, then `docs(task): <phase> artifacts` after each phase). Artifacts carry `type` and `summary` frontmatter; a later phase reads the full text only of the artifacts it selects and `summary` from the rest.
- **Transition**: under Archon, the next node in the pack's DAG. By hand, the handoff fence at the end of every reply, one command naming the next phase, with the sentence before it telling you to run it in a new session.
- **Gate**: an approval node whose artifact you review before the chain continues. Approve continues; reject with text runs the matching `iterate-*` skill in another fresh session with that text as feedback. The `gates` input turns gates off; the phase then runs once without review.

The contract for all of this is [shared/CONVENTIONS.md](../shared/CONVENTIONS.md), in particular "Phase isolation and context budget" and "Running under Archon".

### What one phase is allowed to read

In this order, and nothing else: `task.md`; the primary artifacts it selects, completely; only `summary` from other artifacts; repository files through child workers where the skill provides them; and directly only the files it must edit or cite. A skill that needs to know how the codebase works asks a worker and receives a bounded report with `path:line` pointers. It never pastes the worker's message into an artifact or its reply.

### Child workers inside a phase

Research and implementation phases delegate to worker roles (`agent-codebase-locator`, `agent-implementer`, and so on). Each worker runs in its own context: it gets the assignment text, reads what it needs, and returns one structured message. The phase verifies the claims it uses against the repository and keeps only the facts. Workers never write into the task directory; the parent phase applies what they report. This keeps the phase's own window small even when the codebase exploration is large.

Worker isolation depends on the install. The portable tree names no subagent mechanism, so a phase performs worker roles inline and says so in its reply; its window then holds the exploration too. The runtime builds (`npm run build -- --runtime <id>`) insert the runtime's worker call into every skill and generate the worker definitions. Point `skills_dir` at a runtime build when you want that isolation under Archon.

## Fresh context per phase

Under Archon every AI node in the packs carries `context: fresh`, and every `loop_group` carries `fresh_context: true`, so each pass of a gate cycle, review loop, or implementation loop starts a new agent session. The reviewer's text reaches the iterate skill through the node prompt (`$LOOP_PREV.gate.output.text`), never through a shared conversation. Interactive phases (`create-prd`, `create-tdd`, every `iterate-*`) therefore run as one fresh session per feedback round: the gate collects the feedback, the next iteration applies it. Because the run exits at each gate and `approve --detach` starts a new child, no process holds the earlier phases' context either.

By hand, the fresh context is a new session you open yourself:

| Runtime | New session | See context usage | Compaction | Subagents |
|---|---|---|---|---|
| Claude Code | `/clear` | `/context` | `/compact`; automatic near the limit | `Task` tool; a subagent cannot talk to you |
| Codex | `/new` | `/status` (or `/statusline` for a live footer) | `/compact`; automatic near the limit | multi-agent spawn tool; agents cannot talk to you |
| Oh My Pi | `/new` (or `/clear` to reset in place) | footer shows context % | `/compact`; automatic near the limit | `task` tool; a subagent cannot talk to you |
| Pi | `/new` | footer shows context % | `/compact`; automatic near the limit | none built in; phases perform worker roles inline |

Do not use compaction as the way to move between phases. A compacted session keeps a summary; the next phase needs the artifact. When a phase is done, start a new session and run the fenced command.

Runtime install notes: [runtimes/claude-code.md](../runtimes/claude-code.md), [runtimes/codex.md](../runtimes/codex.md), [runtimes/oh-my-pi.md](../runtimes/oh-my-pi.md), [runtimes/pi.md](../runtimes/pi.md).

## Recognizing a degraded context

You are in a degraded context when the agent:

- re-reads a file it read earlier in the same session,
- contradicts the artifact it wrote or a decision recorded in `task.md`,
- drops a constraint you stated, or asks a question you already answered,
- loses track of which numbered step it is on, or starts a phase over,
- produces replies that summarize instead of citing `path:line`,
- or when the runtime reports usage past half the window and the phase is not finished.

The skills watch for the same signs from the inside. On the first one, a phase is required to save its artifact as it stands, print the reply with the handoff fence, and stop. An interactive phase run by hand saves after every accepted change and suggests a new session after about ten rounds of feedback.

What to do:

1. Stop giving new instructions in that session.
2. Make sure the artifact is saved. If the phase has not printed its reply, say: "Save the artifact in its current state and print the final answer from the template."
3. Open a new session.
4. Run the next command, or `/iterate-<phase> @<artifact file>` with the feedback you still have. Under Archon, `archon workflow resume <run-id>` re-runs the failed node in a fresh session against the task directory as it stands in the run's worktree.

Never fix a degraded phase with `/compact`. The artifact survives a new session; a compaction summary does not preserve what the next phase needs.

## For skill authors

A new skill that joins a workflow keeps the guarantees above by following the conventions:

- Read only `task.md` and selected artifacts; delegate codebase exploration to workers; never paste worker output.
- Save the artifact before printing the reply; a handoff ends with `Next action:`, `Open a new session, then run:`, and one command fence. A terminal reply ends with its state and has no fence.
- Stop on the first sign of degradation and hand off from the saved file.
- When a pack node needs to route on the result, put the JSON-only answer requirement in the pack prompt with an `output_format`, not in the skill; the skill keeps writing its artifact first.

`npm test` checks the reply shape, the next-action label, the new-session instruction, the shared links, and the banned tokens for every skill in the collection.
