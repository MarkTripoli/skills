# Model enforcement

Start every builder on `economy` unless the owner or request names another model, so each reviewer is stronger than its builder. Use the first option that works; record it on the Delivery brief `Model roles` line.

1. **Spawn parameter.** Pass the model only in a form the spawn tool accepts that names the same model. Claude Code's tool takes an alias (`sonnet`, `opus`, `haiku`, `fable`) for a family's latest, so use it only for that alias; else option 2 for `economy`, option 3 for an override.
2. **Pinned definition** (`economy` only). Install writes `model:` into `agent-implementer` and `agent-outline-implementer` in `.claude/agents` or `~/.claude/agents`, `.omp/agents` or `~/.omp/agent/agents`, `~/.codex/agents` when a profile resolved. Match the install note `pinned for <runtime> (<id>)`; plugin installs ship unpinned.
3. **Separate session.** Run the builder as its own session with the runtime's model flag (`omp -p --model <m>`, `claude -p --model <m>`, `codex exec -m <m>`) in a herdr pane (`herdr agent start ... -- --model <m>`), else tmux, else a background process. Give it the assignment; read its final message from its output, its commit from the worktree.
4. **None works.** Say `Recommendation only: <m>` and that the split was not enforced.
