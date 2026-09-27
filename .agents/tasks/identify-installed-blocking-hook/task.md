---
slug: identify-installed-blocking-hook
title: "Identify installed blocking hook capabilities"
workflow: oneshot
created: 2026-09-27
parent: i-want-you-gpt
base: epic-i-want-you-gpt
depends_on: []
issue: 118
---
In public skills, perform a bounded read-only/runtime-spike of current Claude Code, OMP and Codex hook/event installation semantics against throwaway PR-command attempts, without publishing a real PR. Record current version, registration path, payload, interception, blocking semantics and unsupported cases in a short capability artifact. Do not install any production hook. This enabler is consumed by the Claude and OMP adapter children; a supported adapter may start only from observed blocking capability.

## Acceptance criteria
- WHEN Claude and OMP event hooks are probed in installed sessions, the capability report shall identify the registered event, payload and block exit behavior observed for each runtime.
- IF a runtime cannot block PR creation, THEN the capability report shall name the skill-level publication boundary instead of promising an event guard.
