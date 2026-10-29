---
name: assess-merge-risk
description: Rates how merging a pull request or branch into its target affects users as Low, Medium or High risk, tracing shared UI side effects, data hazards, auth, config and dependency changes. Use when the user runs /assess-merge-risk, asks whether a branch is safe to merge or what it could break, or reports a requested check result; not for finding code defects (use review-code) or publishing review comments (use group-review).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Assess merge risk

Rate what users would notice once `<source>` is merged into `<target>`. Users are the people who use the product; the developer is the person asking for the assessment. `<skill-dir>` is the directory holding this SKILL.md. Never edit tracked files, commit, merge, post comments or run the repository's builds or checks; developers run the checks the report names. Local report writes are the only content writes. Needs `git` 2.38 or later and `node`; authenticated `gh` for GitHub PRs (the default), or `glab` for explicitly selected GitLab MRs.

Copy this checklist and tick it off:

```
Merge risk progress:
- [ ] 1. Source and target pinned
- [ ] 2. scope.mjs run; merged tree and merge base noted
- [ ] 3. Intent sources read; intent written in one sentence
- [ ] 4. Every user-reachable change traced to its consumers
- [ ] 5. Report written; check-report.mjs prints ok
- [ ] 6. Report printed as the reply
```

When the developer reports the result of a check from an earlier assessment, skip to [step 7](#7-clear-findings-with-reported-checks).

## 1. Pin source and target

- A GitHub PR number or URL: run `gh pr view <number-or-url> --json headRefName,baseRefName,title,body,url,headRefOid` against the selected repository. Take the source/target branches and intent from that response, fetch their refs, and confirm the fetched source SHA matches `headRefOid`. For a fork, fetch the PR head ref rather than a same-named origin branch.
- An explicitly selected GitLab MR: run `glab mr view <number-or-url> --output json` against that repository and take `source_branch`, `target_branch`, `title`, `description`, `web_url`, and the observed head SHA. Fetch the source/target refs (the MR head ref for a fork) and confirm the source matches the observed SHA. Never silently switch hosts or accounts.
- A branch, tag or commit: that is `<source>`. `<target>` is the branch the developer names, else the target of an open MR for that branch, else the default branch. Fetch both when there is a remote.

The working tree does not matter; the assessment reads only the two commits.

## 2. Pin the merged tree

Run:

```sh
node <skill-dir>/scripts/scope.mjs <source> --target <target>
```

It prints both SHAs, the merge base, the report path, commits on each side, the merged tree, conflicted files, files changed on both sides since the merge base, and each changed file with line counts and surface tags (`shared-ui`, `migration`, `auth`, and so on). Exit 1 prints the cause; fix it (usually a fetch) and run again.

The merged tree is the code as it will be after the merge, built in memory. Search it for consumers with `git grep -n <pattern> <merged-tree>`, so callers the target gained since the merge base count. A file changed on both sides can break without a textual conflict: read the target-side change too (`git diff <merge-base> <target> -- <file>`).

## 3. Read the intent

Intent decides whether an effect is the goal, a side effect, or a defect against the spec. Read whichever of these exist, most authoritative first, and note each one read:

1. The linked Jira issue: the key from the MR title, branch or description, read with `<atlassian>:getJiraIssue`, where `<atlassian>` is the name the runtime registered for the Atlassian server.
2. Task artifacts for the branch: resolve the configured task root per the conventions and find the matching task. Validate its index and ledger, then read current digest-validated `design.prd`, `design.tdd`, `planning.plan` or `planning.structure`, and `research.jira` records. Never pick artifacts by newest filename or edit indexed records. Only a genuinely absent index uses legacy selection.
3. Docs in the merged tree about what the diff changes: PRDs, ADRs, `docs/`, the repository's `AGENTS.md` and any definition of high-risk changes. Search for each changed screen, feature and component by name, `git grep -il '<name>' <merged-tree> -- '*.md' '*.mdx'`, and read every doc that covers it, as well as docs the diff touches or the MR or ticket names.
4. Pages the MR or ticket links (Confluence with `<atlassian>:getConfluenceContent`, Notion, Figma), when a connector can read them.
5. The MR title and description.
6. `git log <target>..<source>`.

A source that is missing or unreadable goes on the report's Not available line and changes no rating. Never block on one. Write one sentence on what the change means to change for users, then judge each effect against the sources with the rubric's Intent table.

## 4. Trace each change to users

Read [references/rubric.md](references/rubric.md). Then, for each changed file, read its diff (`git diff <merge-base> <source> -- <file>`) and ask what a user could see differently. Start with the surface tags and the rubric's signal table, but read every file a user can reach; the tags are path guesses.

For each shared thing the diff changes (an exported function or component, a CSS selector, token or variable, a config key or default, an endpoint or field, a table or column, a cache key or stored format):

1. Find every consumer in the merged tree.
2. Decide which consumers the intent covers. The rest are side effects.
3. For each side effect, name the screen, journey or client it reaches and what changes there.
4. For each intended effect, check it does what its source says on the screen or flow it targets, and that no ticket or doc contradicts it.

Stop tracing a thing once its reach is known; beyond ten consumers the reach is already Wide, so cite the most user-facing ones and give the count.

Record each finding with the outcome in user terms, who meets it, and `path:line` for the change and each consumer cited.

## 5. Rate, write and check

Rate each finding with the rubric's table and adjustments. Fill [references/report_template.md](references/report_template.md). Its blocks, labels and order are fixed: the checker rejects a missing, repeated, reordered or extra block. Only the text inside each block adapts to the change. Order findings from highest level down. Leave the optional `Retracted:` block out of a first report; step 7 fills it. With no user-reachable change, one Low row says so and cites the changed file. Put tests and local checks where the rubric's Tests and checks section says: only High and S4 findings block the merge.

Write the report to the report path `scope.mjs` printed (a file in the git directory, one per source branch, so the working tree stays clean). Then run the checker command `scope.mjs` printed last, which has every argument filled in:

```sh
node <skill-dir>/scripts/check-report.mjs <report-path> --tree <merged-tree> --base <merge-base>
```

It checks the template's blocks, recomputes each level, confirms every cited `path:line` exists, and checks that each High or S4 finding, and only those, has a test or local check under Before merging. On exit 1, fix each line it prints, in the rating or in the citation, never by deleting a finding, and run it again until it prints `ok`. Only step 7 removes a finding.

A finding that cannot be confirmed from the code goes under Not verified with what would confirm it; it never lowers a level.

## 6. Reply

The reply is the checked file's text, unchanged: no heading, rule or summary before its first line, and nothing after its last. To change any wording, edit the file and run `check-report.mjs` again before replying, so the saved report a later step 7 reads is the one the developer saw. Readers take the level from the first line.

## 7. Clear findings with reported checks

A developer ran a test or local check from Before merging, or found other evidence, and reports the result. The reported result is the evidence: the skill records it and does not rerun the check.

1. Run `scope.mjs` for the same source and target, and read the saved report at the printed report path. With no saved report there, assess from step 1 first.
2. When either source or target SHA differs from the report's first line, the assessed merge changed: reassess from step 2, retaining earlier findings only when their change, consumers and intent sources remain unchanged. Apply reported checks only to their exact observed source commit and relevant target context; ask which commit was checked only when neither the report nor supplied result identifies it.
3. Match each reported result to its finding and decide:
   - Every step of the check was run on the assessed source commit and the developer saw the expected healthy result: retract the finding.
   - The developer saw the failure: keep the finding, drop any `down: conditional`, and replace its Not verified note with what the run showed.
   - Some steps were skipped, the run used another commit, build or device than the check names, or the result differs from the expected one: keep the finding, and add what was run and what is still open to Not verified.
   - The code shows the failure happening whatever the run showed (for example, a rule that hides the control on every page): keep the finding and name, in Not verified, the line that conflicts with the reported result.
   - Other evidence (a reviewer, a contract, a log) shows the finding cannot happen: retract it, citing that evidence.
4. To retract: delete the finding's row and renumber the rest, delete its Before merging item and advisory, and add a `Retracted:` item in the template's form. A run names the source commit it ran on, as `<sha>`. Rewrite the summary sentence and the first line's level for the findings that remain; with none left, one Low row says what users still see change.
5. Run `check-report.mjs` until it prints `ok`, and reply as in step 6.
