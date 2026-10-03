# Blocked runs

A blocker is a question only the owner can answer; `run event --blocker <s>` posts it as an immediate thread reply. The daemon adds a direct mention of the configured owner (`slack.owner_user_id`) to every blocker reply, so Slack notifies them. Do not add your own mention or a second message.

Before posting, make every option in the question one you can carry out. If your runtime's permission mode or a repository hook may refuse the action an answer authorizes (a history rewrite, a force push, a command outside the allowlist), say so in the same blocker. Offer the permission rule or the exact command for the owner to run as options, so one reply unblocks the run. Continue any work that does not depend on the answer.

After posting, keep the run active and watch it for seven days from the blocker's post time. Never pause, finish, or end the session because a reply is slow.

1. While the session is active, repeat `run wait --run-id <id> --for <duration>` (see [SKILL.md](../SKILL.md)).
2. When the session would otherwise go idle, arm an hourly wake with the runtime's scheduler (for example Claude Code `CronCreate` or `ScheduleWakeup`, or native Codex scheduling). Each wake runs `run check`. Re-arm the wake after each firing and after any scheduler expiry until the watch ends. Never give a watcher its own shorter deadline, such as "overnight" or eight hours: when it expires, re-arm it. Background commands and session schedulers die with the agent process, so a resumed session re-arms the watch before anything else. When no scheduler exists, keep repeating `run wait` in the session; report the capability gap once. Do not start a daemon or hidden process instead.
3. After each of the first six 24-hour periods with no owner reply, post a follow-up with `run event --current <current> --blocker "No reply in 24 hours (day <n> of 7): <blocker>"`. The day number keeps each follow-up distinct, so the daemon posts it and mentions the owner. Keep watching.
4. When seven days pass with no reply, post one final follow-up with `run event --current <current> --blocker "No guidance in 7 days; stopping the watcher: <blocker>"`. Then run `run finish --outcome cancelled --unresolved <blocker>` and delete any wake you armed.
5. When a reply arrives, handle it as exit `10` (read it, apply or reject it, `run resolve`), delete the wake, and continue. If an authorized action is still refused, that is a new blocker: post it, and the seven-day watch starts again.
