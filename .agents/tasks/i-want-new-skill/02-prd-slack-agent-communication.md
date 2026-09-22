---
type: design-prd
task: i-want-new-skill
summary: "This PRD defines an optional Slack thread for each agent work run. One per-user daemon owns one Socket Mode connection and SQLite run/thread state. A repository declares one default channel in root AGENTS.md, an unambiguous natural-language run instruction may override it, the owner may steer work from the thread, and Slack-enabled state-changing work fails closed unless the local operator explicitly disables Slack for that run. Jira may receive a non-authoritative thread backlink. macOS and Linux use native per-user supervision."
repo: MarkTripoli/skills
branch: i-want-new-skill
sha: 472270dd717873b0f4fb002487ca0fa1abe92607
---

# Slack Agent Work Communication

Inputs: [task request](task.md) and [current-state research](01-research-agent-communication.md).

### Problem to Solve

Long-running agent work lacks one owner-visible place for progress, questions, and redirection.

- The owner must inspect separate runtime tools and artifacts to follow active work.
- The agent has no durable Slack thread mapping after a process or terminal exits.
- Slack outages must not allow Slack-enabled work to continue without owner visibility.
- Jira-linked work needs a discoverable Slack backlink without making Jira part of coordination.

### Success Measures

- Each Slack-enabled trial run creates exactly one thread with start, status, and completion updates.
- An owner reply is acknowledged and applied before the agent's next state-changing action.
- A Slack-enabled run pauses state-changing work when the daemon or Slack connection is unavailable.
- An explicit local break-glass command disables Slack only for the selected run and allows it to continue.
- Slack-disabled runs retain their existing behavior.
- A Jira-linked run writes its Slack thread URL to the configured Jira custom field without making Jira availability a work gate.

### Proposed Solution

Add one optional Slack thread to a work run.

- One per-user daemon owns one Slack app Socket Mode connection and one user-scoped SQLite database.
- SQLite stores each enabled run's owner, channel, thread timestamp, lifecycle, pending owner input, Slack mode, and optional Jira backlink state.
- The repository default is exactly one standalone `Slack default channel: <#name-or-ID>` line in root `AGENTS.md`.
- An unambiguous natural-language instruction from the person controlling the run may select another channel for that run.
- The daemon receives owner replies, posts canonical updates, and exposes run state to agent runtime adapters.
- Agent adapters check the daemon before state-changing work. Unavailable Slack coordination blocks the action unless break-glass has disabled Slack for that run.
- macOS uses a launchd user agent; Linux uses a systemd user service.

### Alternative Solutions Considered

- Enable Slack for every run — rejected because Slack must remain optional.
- Use an HTTP Events API endpoint — rejected because v1 is a local per-user service with no hosted ingress.
- Let every agent process own Slack directly — rejected because thread state and owner input must survive agent process exits.
- Share one Slack app across independent daemons — rejected because v1 has one clear connection and state owner.
- Add workspace defaults or repository mapping tables — rejected because the run instruction and root `AGENTS.md` already provide deterministic precedence.
- Make Jira authoritative — rejected because Jira is optional discovery metadata, not live coordination.

### Solution Details

#### One enabled run owns one Slack thread

- WHEN the person controlling a run enables Slack, the system shall record that person as owner and create exactly one root message.
- The root message shall show `Work`, `Goal`, `Scope`, `Owner`, `Links`, and `Started at`.
- Status messages shall show `Current work`, `Completed since last update`, `Decisions`, `Blockers`, and `Up next`.
- The system shall post status when the workflow phase changes, a blocker begins or clears, or an active run has been quiet for one hour.
- The completion message shall show `Outcome`, `Completed work`, `Decisions`, `Unresolved items`, `Evidence`, `Links`, and `Finished at`.
- Empty fixed fields shall render as `None`.
- IF Slack is not enabled, THEN the run shall proceed without Slack setup or messages.

#### The run instruction overrides the repository channel default

- Each repository shall contain exactly one standalone, case-sensitive `Slack default channel: <#name-or-ID>` line in root `AGENTS.md`.
- An unambiguous natural-language request from the person controlling the run may select one `#channel-name` or Slack channel ID for that run.
- Quoted text, ticket content, and incidental channel mentions shall not override the default.
- Multiple or ambiguous requested channels shall require clarification before the thread is created.
- Without an override, the system shall use the repository default.
- Before creating the thread, the system shall resolve the selected reference to an invited public or private channel and persist its Slack channel ID.
- Missing or duplicate default directives and inaccessible channels shall reject Slack run creation.

#### One daemon owns Slack coordination

- One per-user daemon shall own one Slack app Socket Mode connection and all Slack-enabled run state for that operating-system user.
- The daemon shall use the Slack Web API for outbound messages and Socket Mode for owner replies; v1 shall expose no inbound HTTP endpoint.
- The Slack app shall be invited to each supported public or private channel before use.
- Setup shall accept the bot and app tokens from protected per-user configuration and shall not read repository-local `.env` files.
- macOS and Linux setup shall install native per-user supervision that starts the daemon at login and restarts it after a crash.

#### The owner can steer active work

- WHEN the owner asks a work-related question, the agent shall acknowledge and answer it in the thread before its next state-changing action.
- WHEN the owner redirects the work, the agent shall acknowledge and apply the instruction before its next state-changing action.
- IF the instruction cannot be applied, THEN the agent shall report why without claiming it succeeded.
- Messages from non-owners shall not steer v1 runs.

#### Slack-enabled work fails closed

- Before a state-changing action, the agent runtime shall check the run with the daemon.
- IF the daemon is unavailable, its Socket Mode connection is down, required Slack delivery failed, or owner input is pending, THEN the action shall not start.
- WHEN coordination recovers and pending owner input is handled, the run may continue.
- A local operator may invoke an explicit, confirmed break-glass command for one run. The daemon shall persist that run's Slack-disabled mode before work resumes.
- Break-glass shall not disable Slack for any other run and shall not delete the original thread mapping.

#### Jira receives an optional backlink

- WHEN a Slack-enabled run is linked to Jira, the system shall write the canonical thread URL to the configured dedicated custom field.
- Jira field configuration shall use the administrator-provided stable field ID.
- A Jira failure shall leave the backlink pending for retry without blocking Slack coordination.
- Runs without Jira shall perform no Jira operation.
- Jira shall not control owner input, status timing, or whether work may proceed.

### Out of Scope

- Non-owner steering.
- Direct messages and multi-person direct messages.
- Chat systems other than Slack.
- Automatic Slack enablement for every run.
- Multiple users or daemons sharing one Slack app.
- Multiple simultaneous Socket Mode connections, connection handoff protocols, or hosted Slack ingress.
- Browser OAuth and automatic Slack app provisioning.
- Workspace defaults, channel mapping tables, and routing services.
- Jira changes other than the dedicated Slack thread backlink.
- Windows service support.

## Human Review

### Review targets

- Optional one-thread-per-run behavior and fixed update fields.
- Channel default and override precedence.
- Owner steering and fail-closed state-changing work.
- Per-run break-glass.
- Jira backlink independence.

### Verify

- [ ] Confirm each Slack-enabled run creates one thread and Slack-disabled runs remain unchanged.
- [ ] Confirm owner steering is handled before the next state-changing action.
- [ ] Confirm unavailable Slack coordination blocks Slack-enabled state-changing work.
- [ ] Confirm break-glass disables Slack only for the selected run and persists before work resumes.
- [ ] Confirm the repository default is exactly one `Slack default channel: <#name-or-ID>` line and an unambiguous natural-language run instruction may override it.
- [ ] Confirm channel selection resolves once to an invited public or private channel ID before thread creation.
- [ ] Confirm one per-user daemon owns one Socket Mode connection and SQLite run/thread state.
- [ ] Confirm macOS launchd and Linux systemd supervision start the daemon at login and restart crashes.
- [ ] Confirm Jira receives only the optional thread backlink and Jira outages do not block Slack coordination.

### Known Limits

- Windows supervision is deferred.
- Non-owner participation, direct messages, and additional chat or ticket systems are deferred.
- Each Slack app is limited to one per-user daemon in v1.
