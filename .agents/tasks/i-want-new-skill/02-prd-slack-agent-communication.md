---
type: design-prd
task: i-want-new-skill
summary: "This PRD defines one optional Slack thread per agent work run. The thread carries fixed start, status, and completion updates and accepts questions or steering from the person controlling the agent. Slack-enabled work pauses during integration outages unless the local operator explicitly disables Slack for that run; recovery records the interruption in the original thread. Ticketing, non-owner participation, and other chat systems are deferred."
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

### Success Measures

Initial success is a deterministic acceptance trial.

- Every Slack-enabled trial run produces one thread with a start update, required status updates, and a completion update.
- An owner reply is acknowledged and reflected in the work before the agent starts its next work action.
- Equivalent runs with Slack disabled proceed without Slack setup or changed workflow behavior.
- A Slack-enabled run pauses state-changing work during an integration outage; an explicit local break-glass resumes it without Slack and the original thread later records the interruption.

### Proposed Solution

Add an optional Slack thread to an individual work run. The person controlling the agent becomes the thread owner.

- The agent posts fixed start, status, and completion message types.
- The agent posts status when work changes and after one quiet hour.
- The owner can ask questions or redirect active work from the thread.
- Every fixed field appears in every message of its type; empty fields read `None`.
- Slack-enabled work pauses when owner steering or required message delivery is unavailable.

### Alternative Solutions Considered

- Enable Slack for every work run - rejected because Slack must remain optional.
- Post only when work changes - rejected because a quiet run gives the owner no liveness signal.
- Allow free-form updates - rejected because the requested message shape must be deterministic.

### Solution Details

#### One owner starts one work thread

- WHEN the person controlling the agent enables Slack for a work run, the system shall record that person as owner and create one thread.
- WHEN the system creates the thread, the root message shall show `Work`, `Goal`, `Scope`, `Owner`, `Links`, and `Started at` in that order.
- IF Slack is not enabled for a work run, THEN the system shall proceed without Slack setup or Slack messages.

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
- Assigning or updating Jira, GitHub, Linear, or other tickets.
- Writing the Slack thread link back to a ticket.
- Supporting chat systems other than Slack.
- Enabling Slack automatically for every work run.

## Human Review

### Review targets

- The three message types and their fixed fields.
- Status timing during active work.
- Owner questions and steering.

### Verify

- [ ] Confirm that start, status, and completion are the required message types.
- [ ] Confirm that owner instructions take effect before the agent begins its next work action.
- [ ] Confirm Slack outages pause state-changing work and only explicit local break-glass resumes the run without Slack.

### Known limits

- Non-owner comments are deferred.
- Ticket integrations and other chat systems are deferred.
- Slack setup, authorization, retry schedule, reconciliation guarantees, and runtime wiring remain technical-design decisions.
