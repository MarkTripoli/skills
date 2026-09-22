---
task: slack-assistant-bot-dms
type: epic-delivery
summary: "Thirty-three child task directories were created under .agents/tasks/, each with a GitHub issue (#40 to #72) and committed on epic-slack-assistant-bot-dms. Wave 1 starts now with five children: run-start-uses-the, config-yaml-loads-agent, state-sqlite-carries-the, slackapi-client-gains-the, inbound-envelopes-route-through. owner-dms-are-recorded (wave 2) gates every DM and task child, and a-dm-request-runs (wave 4) gates the failure, chunking, cap, follow-up, and scheduled-run children; docs-describe-onboarding-dms is alone in wave 9."
epic_plan: 04-epic-plan-slack-assistant-bot-dms.md
---

# Slack assistant bot with DMs, standing tasks, and onboarding Delivery

Epic branch: `epic-slack-assistant-bot-dms`. Child task files are committed here as `docs(task): open epic children`; each child cuts its worktree from this branch and its pull request targets it.

## Children created

| Child | Slug | Workflow | Depends on | Issue |
|---|---|---|---|---|
| run start uses the configured owner and rejects --owner | `.agents/tasks/run-start-uses-the/` | oneshot | none | #40 |
| config.yaml loads agent and retention sections with defaults and validation | `.agents/tasks/config-yaml-loads-agent/` | oneshot | none | #41 |
| state.sqlite carries the eight assistant tables | `.agents/tasks/state-sqlite-carries-the/` | oneshot | none | #42 |
| slackapi client gains the six assistant methods | `.agents/tasks/slackapi-client-gains-the/` | oneshot | none | #43 |
| agent adapters name argv per binary and approval level | `.agents/tasks/agent-adapters-name-argv/` | oneshot | `config-yaml-loads-agent` | #45 |
| agent runner spawns an adapter in a 0700 run directory and reads result.md or stdout | `.agents/tasks/agent-runner-spawns-an/` | oneshot | `agent-adapters-name-argv` | #48 |
| proposal.json is validated into a Proposal on run exit | `.agents/tasks/proposal-json-is-validated/` | oneshot | `agent-runner-spawns-an` | #53 |
| inbound envelopes route through the assistant package while run-thread replies keep working | `.agents/tasks/inbound-envelopes-route-through/` | oneshot | none | #44 |
| owner DMs are recorded as requests and acked in a thread | `.agents/tasks/owner-dms-are-recorded/` | oneshot | `inbound-envelopes-route-through`, `config-yaml-loads-agent`, `state-sqlite-carries-the`, `slackapi-client-gains-the` | #46 |
| non-owner DMs get one refusal, then silence | `.agents/tasks/non-owner-dms-get/` | oneshot | `owner-dms-are-recorded` | #49 |
| !help, !status, and !runs answer questions about the daemon from the DM | `.agents/tasks/help-status-and-runs/` | oneshot | `owner-dms-are-recorded` | #50 |
| !tasks, !show, !pause, !resume, and !cancel manage standing tasks from the DM | `.agents/tasks/tasks-show-pause-resume/` | oneshot | `help-status-and-runs` | #54 |
| a DM request runs the agent and its answer replaces the Working on it ack | `.agents/tasks/a-dm-request-runs/` | oneshot | `agent-runner-spawns-an`, `owner-dms-are-recorded` | #55 |
| a failed DM run edits the ack to Failed with the cause and stderr tail | `.agents/tasks/a-failed-dm-run/` | oneshot | `a-dm-request-runs` | #57 |
| answers over 4,000 characters post as Done plus chunked thread replies | `.agents/tasks/answers-over-4000-characters/` | oneshot | `a-dm-request-runs` | #58 |
| running rows from a previous daemon pid are killed and reported as Failed | `.agents/tasks/running-rows-from-a/` | oneshot | `a-failed-dm-run` | #63 |
| the hourly run cap holds queued runs and logs the held batch | `.agents/tasks/the-hourly-run-cap/` | oneshot | `a-dm-request-runs` | #59 |
| owner replies in a request thread run a follow-up with the thread history | `.agents/tasks/owner-replies-in-a/` | oneshot | `a-dm-request-runs` | #60 |
| a task proposal is rendered into the request thread with the confirm sentence | `.agents/tasks/a-task-proposal-is/` | oneshot | `proposal-json-is-validated`, `a-failed-dm-run` | #64 |
| yes records the pending proposal as a standing task | `.agents/tasks/yes-records-the-pending/` | oneshot | `a-task-proposal-is`, `tasks-show-pause-resume` | #68 |
| no drops a pending proposal and any other reply re-runs the agent with it | `.agents/tasks/no-drops-a-pending/` | oneshot | `yes-records-the-pending`, `owner-replies-in-a` | #71 |
| messages in watched channels are collected for each active task | `.agents/tasks/messages-in-watched-channels/` | oneshot | `owner-dms-are-recorded` | #51 |
| schedule and window-end tasks run at their due time and deliver results | `.agents/tasks/schedule-and-window-end/` | oneshot | `messages-in-watched-channels`, `tasks-show-pause-resume`, `a-dm-request-runs` | #61 |
| a failed task run reports Failed to its target and keeps the batch | `.agents/tasks/a-failed-task-run/` | oneshot | `schedule-and-window-end` | #65 |
| each-message tasks run when the debounce window closes under the 10-minute floor | `.agents/tasks/each-message-tasks-run/` | oneshot | `schedule-and-window-end` | #66 |
| three consecutive task failures pause the task and DM the owner | `.agents/tasks/three-consecutive-task-failures/` | oneshot | `a-failed-task-run` | #69 |
| a daily purge deletes consumed messages and stale runs, tasks, and DM threads | `.agents/tasks/a-daily-purge-deletes/` | oneshot | `schedule-and-window-end` | #67 |
| the purge removes run directories of deleted and orphaned runs | `.agents/tasks/the-purge-removes-run/` | oneshot | `a-daily-purge-deletes` | #70 |
| onboard creates the Slack app and collects both tokens through a resumable checkpoint | `.agents/tasks/onboard-creates-the-slack/` | oneshot | `slackapi-client-gains-the`, `config-yaml-loads-agent` | #47 |
| onboard resolves the owner, writes config.yaml, and starts the daemon | `.agents/tasks/onboard-resolves-the-owner/` | oneshot | `onboard-creates-the-slack` | #52 |
| onboard finishes only when the owner replies to the setup DM within 120 seconds | `.agents/tasks/onboard-finishes-only-when/` | oneshot | `onboard-resolves-the-owner`, `owner-dms-are-recorded` | #56 |
| onboard --existing updates an installed app's manifest and re-verifies | `.agents/tasks/onboard-existing-updates-an/` | oneshot | `onboard-finishes-only-when` | #62 |
| docs describe onboarding, DMs, and standing tasks, and the changeset records the release | `.agents/tasks/docs-describe-onboarding-dms/` | oneshot | `no-drops-a-pending`, `answers-over-4000-characters`, `running-rows-from-a`, `the-hourly-run-cap`, `each-message-tasks-run`, `three-consecutive-task-failures`, `the-purge-removes-run`, `onboard-existing-updates-an` | #72 |

## Waves

- Wave 1: `run-start-uses-the`, `config-yaml-loads-agent`, `state-sqlite-carries-the`, `slackapi-client-gains-the`, `inbound-envelopes-route-through`
- Wave 2: `agent-adapters-name-argv`, `owner-dms-are-recorded`, `onboard-creates-the-slack`
- Wave 3: `agent-runner-spawns-an`, `non-owner-dms-get`, `help-status-and-runs`, `messages-in-watched-channels`, `onboard-resolves-the-owner`
- Wave 4: `proposal-json-is-validated`, `tasks-show-pause-resume`, `a-dm-request-runs`, `onboard-finishes-only-when`
- Wave 5: `a-failed-dm-run`, `answers-over-4000-characters`, `the-hourly-run-cap`, `owner-replies-in-a`, `schedule-and-window-end`, `onboard-existing-updates-an`
- Wave 6: `running-rows-from-a`, `a-task-proposal-is`, `a-failed-task-run`, `each-message-tasks-run`, `a-daily-purge-deletes`
- Wave 7: `yes-records-the-pending`, `three-consecutive-task-failures`, `the-purge-removes-run`
- Wave 8: `no-drops-a-pending`
- Wave 9: `docs-describe-onboarding-dms`

A wave starts after every dependency's pull request is merged. The optional Atomic workflow can launch each ready child in a separate run; by hand, start the children from the commands in the final answer.

## Human Review

### Review targets

- Slugs are the first four kebab-case words of each child name, so several read as fragments (`run-start-uses-the`, `a-dm-request-runs`, `owner-replies-in-a`); the `title` in each `task.md` and the issue title carry the full name.
- `owner-dms-are-recorded` (#46) is the single wave-2 gate for the DM, `!` verb, collection, and refusal children; a slip there delays waves 3 to 8.
- `a-dm-request-runs` (#55) depends on both the runner (#48, wave 3) and the request child (#46); its wave-4 slot is the earliest point a DM produces an answer on the epic branch.
- The three onboarding children (#47, #52, #56) and `onboard-existing-updates-an` (#62) form a straight chain independent of the DM track after wave 1; they can run beside it.
- Wave-1 enablers whose consumers land two waves later: `slackapi-client-gains-the` (#43) is first consumed by #46 in wave 2 and `agent-adapters-name-argv` (#45) by #48 in wave 3.

### Verify

- [ ] Each of the 33 directories under `.agents/tasks/` exists and its `task.md` carries the epic plan's prompt verbatim and its acceptance sentences as bullets in order.
- [ ] Every `task.md` frontmatter lists `base: epic-slack-assistant-bot-dms`, `parent: slack-assistant-bot-dms`, dependency slugs matching the epic plan's `depends_on`, and the `issue` number `gh issue create` returned.
- [ ] Issues #40 to #72 carry label `epic:slack-assistant-bot-dms` and each body's `Depends on:` line names the issue numbers of its dependency siblings.
- [ ] `git log --oneline -2` on `epic-slack-assistant-bot-dms` shows `docs(task): open epic children` (33 files) followed by the receipt commit.

### Known limits

- The child directories are opened without `index.json`, matching the parent task, which keeps numbered legacy artifacts; child sessions record artifacts the legacy way unless they initialize an index first.
- Each child's `task.md` prompt repeats the shared contracts from the epic plan; a change to a contract must be repeated in every unmerged child's `task.md` and issue.
- Wave placement follows `depends_on` only; children in the same wave may still touch the same files (`internal/assistant/dispatcher.go`, `internal/db/assistant_runs.go`, `internal/db/tasks.go`), so sibling pull requests in one wave may need rebasing.
