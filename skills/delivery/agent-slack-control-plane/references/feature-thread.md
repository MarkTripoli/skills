# Feature-thread mode

One `deliver` task owns one Slack root. Open it once, edit it with the final result, and reply in its thread only for a blocker needing a human answer. No routine progress or gate handoffs are posted.

This mode needs `curl` and `node`. It applies only when `task.md` has no `slack_run_id`. Once coordinator mode starts, the direct feature-thread steps below do not run for that task.

Contents: [Open the thread](#open-the-thread), [Post a blocker](#post-a-blocker), [Wait for the answer](#wait-for-the-answer), [Post the final result](#post-the-final-result), [Post command](#post-command), [Read command](#read-command).

Load the bot token as the [token file](../SKILL.md#token-file) section describes; the scripts below do it themselves.

## Open the thread

`deliver` runs this step for a new task, after it writes `task.md`.

1. Skip when `task.md` already has `slack_thread_ts`. A fresh session, a later phase, or a reused task keeps the existing thread and never posts a second parent message.
2. Skip when the token file, `SLACK_AGENT_BOT_TOKEN`, or `SLACK_AGENT_CHANNEL_ID` is missing. Say `Slack thread skipped: <reason>.` once in the reply.
3. Write the parent message text to a temporary file with the file-writing tool:

   ```text
   *<title>*
   Repository `<repo>`, branch `<branch>`, workflow `<workflow>`.
   <request body, first three lines>
   This message is updated with the final result. A thread reply means a blocker needs your answer.
   ```

4. Post it with [the post command](#post-command) without `thread_ts`.
5. Add `slack_channel: <channel ID>` and `slack_thread_ts: "<ts>"` to the local `task.md` frontmatter from the script's output (channel ID, then ts). Quote the timestamp so it stays a string. Task files are local working state, not branch history; later sessions in the same task worktree read these keys.

## Post a blocker

Any phase posts a blocker reply when all of these are true:

1. `task.md` has `slack_thread_ts`.
2. The phase stops because it needs a decision, access, or fact from a human, and no artifact, repository file, or earlier message supplies it.
3. The stop is not an ordinary human-gate reply or handoff fence. Gate approvals, next-command handoffs, failures the agent can fix, Slack configuration errors, and short-lived test codes or credential renewals are never blockers.

Post one reply per distinct blocker, with [the post command](#post-command) and `thread_ts` set to `slack_thread_ts`:

```text
Blocked in `<skill>`: <what cannot continue>.
Question: <the exact question, with options when they exist>.
Reply in this thread or answer in the agent session at `<worktree path>` on branch `<branch>`. The first answer is used.
```

Without `SLACK_AGENT_OWNER_ID`, replace the last line with:

```text
Answer in the agent session at `<worktree path>` on branch `<branch>`. Replies here are not read.
```

Do not post the same blocker again in a later session. When the reply in the session shows the blocker was already posted, continue without posting.

## Wait for the answer

Run this step after posting a blocker, only when `SLACK_AGENT_OWNER_ID` is set. Without it, wait for the answer in the session.

1. Keep the blocker reply's `ts` from the post response.
2. Instead of ending the turn, repeat [the read command](#read-command) every 60 seconds or less until an answer arrives or the owner answers in the session. Stop after 24 hours and report the blocker still open.
3. Consider only replies newer than the blocker's `ts`. Accept one only when its Slack `user` exactly matches `SLACK_AGENT_OWNER_ID` and it is in the task's thread. Ignore everyone else, and never accept credentials, tokens, or short-lived test codes through Slack.
4. The first accepted reply is the answer. Stop reading, post this acknowledgement in the thread with [the post command](#post-command), and continue the phase. State in the session reply that the answer came from Slack, with its `ts`.

   ```text
   Answer received: <the answer in one line>. Continuing `<skill>`.
   ```

5. An answer typed in the session first also ends the wait; stop reading and post nothing more.

If the read fails, for example with `missing_scope` when the app lacks the history scope named in the [API and failure rules](../SKILL.md#api-and-failure-rules), report the Slack error once in the reply, stop reading, and wait for the answer in the session. A Slack failure never blocks delivery.

## Post the final result

`describe-pr` edits the root after it publishes a pull request that this run created. It does not edit when it only updates an existing pull request. For a delivery brief that requests PR follow-up, this is a PR-open state, not the final result; `/resolve-pr-reviews` edits the same root once the current-head pipeline and discussions have been checked. Preserve the root's title and repository/branch/workflow context from `task.md`; append the observed state. Use `chat.update` with `ts` set to `slack_thread_ts`:

```text
*<title>*
Repository `<repo>`, branch `<branch>`, workflow `<workflow>`.
PR opened: <pull request title>
<pull request URL>
<the description's Purpose sentence>
Verification: <passed, failed, and untested counts from the newest verification artifact, or "no verification artifact">.
Known limits: <the first two known limits, or "none">.
```

For the follow-up edit, replace `PR opened` with `PR checked` and add the current head SHA, pipeline status, open discussion count, and approval state. Say `blocked` with the concrete reason if checks or access prevent completion. No second root or routine progress replies. Slack failures remain non-blocking.

## Post command

Write the message text to a file first, so no shell quoting touches it. The script loads the token file, calls Slack, deletes the message file, and prints the channel ID and message `ts` on success. On `"ok":false` it prints the Slack `error` to stderr and exits nonzero.

`<skills-dir>` is the directory that holds the `agent-slack-control-plane` skill.

```bash
S=<skills-dir>/agent-slack-control-plane/scripts
bash $S/slack-post.sh post <message file> [slack_channel]
bash $S/slack-post.sh reply <message file> <slack_channel> <slack_thread_ts>
bash $S/slack-post.sh update <message file> <slack_channel> <slack_thread_ts>
```

`post` opens the parent message in `slack_channel` when given, else in `SLACK_AGENT_CHANNEL_ID`. `reply` and `update` take `slack_channel` from `task.md`, so a reply reaches the thread even after the operator changes the default channel. Handle a failure with the [API and failure rules](../SKILL.md#api-and-failure-rules): report it once in the reply and continue the phase.

## Read command

```bash
bash <skills-dir>/agent-slack-control-plane/scripts/slack-read.sh <slack_channel> <slack_thread_ts> <blocker ts>
```

It prints one JSON object per line with `user`, `ts`, and `text`, the thread's parent message first; the parent is never an answer. On failure it prints the Slack `error` to stderr, for example `missing_scope` or `not_in_channel`, and exits nonzero.
