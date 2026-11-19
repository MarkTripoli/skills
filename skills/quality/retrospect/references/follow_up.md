# Follow-up

`/retrospect follow-up` answers review comments on product PRs, carries out accepted plans, and checks whether lessons held. Guardrails from SKILL.md apply. Work through every lesson `due` lists, then publish once.

```
Follow-up progress:
- [ ] 1. Ledger synced, due read
- [ ] 2. Review comments answered
- [ ] 3. Planned actions started, open tasks checked
- [ ] 4. Due verifications judged
- [ ] 5. Not-held lessons reopened
- [ ] 6. Ledger published, reported
```

1. **Start.** `node <skill-dir>/scripts/ledger.mjs start [--repo <dir>]`, then `sync --repo <worktree>` and `due --repo <worktree>`. `sync` already moved lessons whose product or action PRs merged or closed and marked quiet lessons `held`. URLs under `unknown` were not read; say so in the report.
2. **Answer review comments** on each product PR `due` names. Read the threads with `gh pr view <url> --comments` and `gh api repos/{owner}/{repo}/pulls/<n>/comments`, and skip any already answered.
   - A change that fits the lesson's Rule: make it on the PR's branch in its worktree, run the checks [products.md](products.md) names, push, and reply with the commit and what changed.
   - A question, a disagreement, or a change outside the lesson: reply with the evidence. Change nothing; the commenter decides.
   - Never resolve the user's threads, merge, or mark a PR ready.
3. **Start planned actions** of each `acting` lesson, in order. A `pr` action: open it as a draft PR as products.md says and record `ledger.mjs action --repo <worktree> --slug <s> --id <id> --status open --ref <PR url>`. A `task` action: name it in the report as an ask for the user, then record `--status open`. For an open `task`, ask in an interactive conversation whether it is done and record `--status done` or `--status dropped --note "<why>"`; unattended, leave it open and list it. `sync` again: a lesson whose actions are all finished starts `verifying`.
4. **Judge due verifications.** For a `verifying` lesson past `verify_after` with a `verify` sentence, do what the sentence says (search the ledger, `git log`, recent task records and PRs) and record `ledger.mjs verdict --repo <worktree> --slug <s> --held yes|no --evidence "<what was checked and what it showed>"`. Numbers in the evidence, not adjectives.
5. **Reopen not-held lessons.** Read the occurrences since `accepted_at`, then make a stronger product as SKILL.md step 5 says: name why the earlier product did not stop it and what this one does differently. Record `--status proposed --product <url>`. A product the user closed is `rejected`; read the closing comment and put the reason in the report.
6. **Publish and report.** `ledger.mjs publish --repo <worktree> --message "docs(lessons): follow up <slugs>"`. One line per lesson: what moved and what waits on the user, with links.
