---
"@marktripoli/skills": major
---

Replace the repository's orchestration with the optional Atomic `delivery` workflow while preserving independently installable and usable skills in Claude Code, Codex, Oh My Pi, Pi, and portable mode.

- Installation now defaults to selected skills and runtime workers only. `--atomic` explicitly adds the complete portable collection, workflow resources, and native discovery entry; project installs keep their skills local. Atomic itself is a separately installed runtime, not a dependency of ordinary skill use.
- The dynamic controller uses fresh native stages and artifact-only handoffs, native human approval UI, bounded revision/repair sessions, and the existing typed-judgment helper for JEV decisions. Headless runs require `gates=none`; an explicit workflow selects a deterministic chain.
- Remove obsolete workflow packs, generated runtime-specific orchestration, and the metrics integration without adding replacement telemetry. Earlier pending release notes describing the superseded orchestration are consolidated here.
- Preserve task/artifact formats, manual skill invocation fences, published release history, existing task records, and owner-managed worktrees. Old engine checkpoints are not converted; continue from saved artifacts in a new Atomic run.
- Verification resolves required command arguments and build targets from repository guidance before grading; an incomplete invocation is not treated as a product failure. Scratch cleanup preserves cited acceptance and reproduction evidence, including failed attempts.
- Repair phases receive current failed verification and app-test artifacts as required feedback alongside human feedback. Stale proofs are not promoted into required repair feedback, and artifact bodies are not duplicated into the prompt.

This is a breaking operation/install contract change. See the README and delivery workflow reference for native Atomic commands, current inputs, and migration ownership rules.
