---
type: design-prd
task: i-want-new-skill
summary: "This PRD defines one optional Slack thread per agent work run with fixed updates and owner steering. A Jira-linked run writes the thread URL to an administrator-created dedicated custom field configured by stable field ID; setup validates the field, Jira does not control coordination, and runtime requires no Jira admin privileges. Slack-enabled work pauses during integration outages unless the local operator explicitly disables Slack for that run. Non-owner participation, non-Jira ticket systems, and Jira mutations beyond the backlink are deferred."
repo: MarkTripoli/skills
branch: i-want-new-skill
sha: 472270dd717873b0f4fb002487ca0fa1abe92607
---

# Slack Agent Work Communication

Inputs: [task request](task.md) and [current-state research](01-research-agent-communication.md).

### Problem to Solve

Agents can perform long-running work without giving the person controlling them a simple Slack view of progress or a way to respond.

- Start, status, and completion updates do not appear in one owner-visible thread.
- The owner must inspect separate runtime tools and artifacts to understand or redirect active work.
- Teams that do not configure Slack must keep their existing workflow unchanged.
- A Jira-linked run needs a discoverable Slack-thread backlink without making Jira part of live coordination.

### Success Measures

Initial success is a deterministic acceptance trial.

- Every Slack-enabled trial run produces one thread with a start update, required status updates, and a completion update.
- An owner reply is acknowledged and reflected in the work before the agent starts its next work action.
- Equivalent runs with Slack disabled proceed without Slack setup or changed workflow behavior.
- A Slack-enabled run pauses state-changing work during an integration outage; an explicit local break-glass resumes it without Slack and the original thread later records the interruption.
- Every Jira-linked trial writes its Slack thread URL to the dedicated Jira custom field; Jira outages delay that backlink without stopping Slack coordination.

### Proposed Solution

Add an optional Slack thread to an individual work run. The person controlling the agent becomes the thread owner.

- The agent posts fixed start, status, and completion message types.
- The agent posts status when work changes and after one quiet hour.
- The owner can ask questions or redirect active work from the thread.
- Every fixed field appears in every message of its type; empty fields read `None`.
- Slack-enabled work pauses when owner steering or required message delivery is unavailable.
- Jira-linked runs publish the Slack thread URL to a dedicated Jira custom field; runs without Jira remain local-only.

### Alternative Solutions Considered

- Enable Slack for every work run - rejected because Slack must remain optional.
- Post only when work changes - rejected because a quiet run gives the owner no liveness signal.
- Allow free-form updates - rejected because the requested message shape must be deterministic.
- Store the Slack thread URL in a Jira label - rejected because labels are categorization metadata, not a dedicated backlink field.
- Create or discover the Jira custom field at runtime - rejected because runtime shall not require Jira administration privileges.

### Solution Details

#### One owner starts one work thread

- WHEN the person controlling the agent enables Slack for a work run, the system shall record that person as owner and create one thread.
- WHEN the system creates the thread, the root message shall show `Work`, `Goal`, `Scope`, `Owner`, `Links`, and `Started at` in that order.
- IF Slack is not enabled for a work run, THEN the system shall proceed without Slack setup or Slack messages.

#### Jira-linked runs publish one discoverable backlink

- WHEN a Slack-enabled run is linked to a Jira issue, the system shall write the canonical Slack thread URL to the configured dedicated Jira custom field.
- WHEN the Jira field already contains that same URL, the write shall succeed without creating another value.
- IF Jira is unavailable when the thread is created, THEN the system shall retain the pending backlink locally and retry without pausing Slack coordination.
- Jira shall not control status timers, owner-input handling, action permits, or interruption recovery.
- IF a run has no Jira issue, THEN it shall remain local-only and perform no Jira operation.
- The system shall not store the Slack thread URL in a Jira label.
- An administrator shall create the dedicated Jira custom field and configure its stable field ID for that Jira site.
- BEFORE Jira-linked runs are enabled for a site, setup shall validate that the configured field exists, is writable for the intended issues, and accepts the canonical Slack thread URL.
- Runtime shall not require Jira administration privileges, create the field, or discover it by name.

#### Status updates show progress and liveness

- WHEN the run enters a new workflow phase, the system shall post a status update.
- WHEN a blocker begins or clears, the system shall post a status update.
- WHILE an active run has produced no update for one hour, the system shall post a status update.
- WHEN the system posts a status update, it shall show `Current work`, `Completed since last update`, `Decisions`, `Blockers`, and `Up next` in that order.
- IF a status field has no information, THEN the system shall render `None` for that field.

#### The owner can question or redirect the agent

- WHEN the owner asks a work-related question, the agent shall acknowledge and answer it in the thread before beginning its next work action.
- WHEN the owner gives a work-related instruction, the agent shall acknowledge and apply it before beginning its next work action.
- IF the agent cannot apply an owner instruction, THEN it shall report the reason without claiming the change occurred.

#### Slack outages pause work unless the local operator disables Slack

- WHEN the coordinator, Slack event connection, or required message delivery is unavailable, the system shall pause the Slack-enabled run before its next state-changing action.
- WHEN service recovers before an override, the system shall process pending owner input and resume the run.
- IF the local operator invokes the explicit break-glass command, THEN the system shall disable Slack for that run and resume its existing non-Slack workflow.
- WHEN break-glass resumes a run, the system shall retain the original thread mapping and a durable interruption record.
- WHEN Slack delivery later recovers, the system shall post a status update to the original thread that records the interruption and local resumption.

#### Completion closes the work thread

- WHEN a run completes, fails, or is cancelled, the system shall post one completion update.
- WHEN the system posts a completion update, it shall show `Outcome`, `Completed work`, `Decisions`, `Unresolved items`, `Evidence`, `Links`, and `Finished at` in that order.
- IF a completion field has no information, THEN the system shall render `None` for that field.

### Out of Scope

- Comments or steering from anyone other than the owner.
- Jira issue mutations other than the dedicated Slack-thread custom field.
- GitHub, Linear, and other ticket-system backlinks.
- Jira labels for Slack thread URLs.
- Supporting chat systems other than Slack.
- Enabling Slack automatically for every work run.

## Human Review

### Review targets

- The three message types and their fixed fields.
- Status timing during active work.
- Owner questions and steering.
- Jira custom-field backlink behavior and Jira-independent coordination.

### Verify

- [ ] Confirm that start, status, and completion are the required message types.
- [ ] Confirm that owner instructions take effect before the agent begins its next work action.
- [ ] Confirm Slack outages pause state-changing work and only explicit local break-glass resumes the run without Slack.
- [ ] Confirm Jira-linked runs write the Slack thread URL to a dedicated custom field while Jira outages do not pause coordination.
- [ ] Confirm runs without Jira perform no Jira operation.
- [ ] Confirm setup validates an administrator-created Jira field by stable per-site ID and runtime requires no Jira admin privileges.

### Known limits

- Non-owner comments are deferred.
- GitHub, Linear, and non-owner participation are deferred.
- Jira credential authorization, validation scope, conflicting existing values, and retry guarantees remain technical-design decisions.
- Slack setup, authorization, retry schedule, reconciliation guarantees, and runtime wiring remain technical-design decisions.
