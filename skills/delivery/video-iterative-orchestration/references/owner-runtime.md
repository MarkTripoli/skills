# Owner and worker runtime selection

Record the observed `owner_runtime`, selected worker profile, actual model and runtime capabilities in the ledger. Claude Code and Codex owners use the same delivery, authority and proof contracts. Oh My Pi, Pi and portable installs follow their installed adapter, not a company-specific model or service.

## Select the configured profile

An explicit supported owner choice wins. Otherwise use the owner's repository-configured default and `route-model` when configured: economical builders, strongest compatible independent reviewers. Record the exact resolved model rather than a marketing alias. Do not hard-code a provider version. An unavailable explicitly requested model is a configuration error; never silently substitute another profile.

A resumed run retains its recorded profile. A different owner runtime records a handover and reconciles active worker sessions before dispatch. One ticket has one writable owner and durable session. Send amendments, plan feedback, runtime grants and corrections to that session. Replace it only when unavailable or incorrectly configured, recording why and ensuring its old writer has stopped.

Each worker starts from a complete assignment without inherited owner conversation. Record `worker_session_id`, runtime/profile, verified model, write surface and permission envelope. Verify the model from runtime metadata or transcript when exposed; otherwise state that model identity was not independently available. Never claim verification from a requested model parameter alone.

## Claude Code owner

Use Claude Code's background Agent mechanism with the explicitly resolved compatible model. Begin with an instruction to invoke `video-iterative-development`, then supply the complete assignment. Keep its runtime tools needed for the assigned local services, browser/device proof, Git and authorized host operations. Do not assume every repository has a specific MCP server or component inventory.

Inspect model overrides such as `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` when applicable: an override that prevents the selected model is a configuration error. Record the returned agent/session ID and send subsequent amendments through the runtime's message/resume mechanism. Consume completion notifications instead of polling. Present each completed Bug proposal before awaiting another completion.

Use the ledger's goal, optionally mirrored in a native task list; lack of Codex goal tools is not a blocker. Do not attach a Codex-only bug watcher to a Claude-owned epic. If an existing watcher serves it, pause new dispatch until the owner stops it or explicitly transfers ownership. During a Claude-owned run, discover new eligible Bugs through Jira MCP at safe orchestration points.

## Codex owner or explicitly chosen cross-runtime worker

Use fresh multi-agent sessions with no inherited turns and the resolved model where the runtime supports them. Retain each ticket session for amendments. Attach a configured `bug-coordinator` only for a Codex owner; its notifications are discovery, not source or implementation authority.

A Claude owner may use Codex CLI workers only when explicitly selected and installed. Save each full assignment/amendment in excluded operational scratch, start via `codex exec --json` with the configured model and assigned working directory, and record `thread.started` identity. Resume that exact session with the same explicit model and authorized sandbox/approval configuration. Supply a finite stdin file or `/dev/null`, retain output and require `turn.completed` before accepting its final handoff. Check session model and permission metadata when available. Do not bake `danger-full-access`, approval bypass or global permission changes into a portable command.

## Preserve authorization in every runtime

Background permission prompts are managed approvals, not new conversational gates. Use only the least permission envelope needed by the recorded assignment. Explicit denial is reported verbatim with secrets redacted, never routed around. External actions beyond recorded authority still require owner approval. Full local runtime access never authorizes merge, secrets, production infrastructure or another repository.

When native worker support is absent, perform bounded roles inline after reading their skills and state that independent session isolation was unavailable. Do not silently replace an explicitly requested external runtime/model with inline work. A missing optional runtime is reported honestly, and only its dependent step pauses.

Handle handoffs individually as they arrive. Keep E2E processes supervised through final result and recording finalization. Waiting for owner decisions never reserves a shared runtime. Native post-ready review uses the prepared effective-change worktree and a strongest compatible configured model; unavailable Claude tooling uses the recorded independent fallback, not a fabricated review.
