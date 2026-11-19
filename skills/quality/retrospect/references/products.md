# Making a product

Every product is a draft PR the user merges to accept the lesson or closes to reject it. Merging is not the end: the lesson is done only when its verification says it held.

## Prefer the change itself

Make the product the change that removes the cause: a skill with a test or eval, a check, CI configuration, shared code, a repository instruction file. Then merging it carries the lesson out and it needs no further actions. Among changes, prefer a check, test or eval that fails without the fix over a sentence of guidance.

When the cause sits outside any repository (a tool setting, a habit), the product is a plan: `lessons/<slug>/PROPOSAL.md` with **Problem**, **Evidence**, **Actions**, **How we'll know**, plus the actions recorded in the same worktree so `actions.json` is part of the PR:

```sh
node <skill-dir>/scripts/ledger.mjs action --repo <worktree> --slug <slug> --id <id> --kind pr|task \
  --title "<one line>" --where "<repository, or who does it>"
```

A `pr` action is a later change in a repository, opened by the follow-up once the plan merges. A `task` is something only the user can do; the follow-up asks about it. Prefer `pr`.

## Settle questions by the rules

- **A fact:** look it up (a setting's current value, a command's real flags, who committed the code).
- **Two owners fit:** pick the one that stops it earliest and say why in the PR.
- **The owner is still unclear:** in an interactive conversation, ask the one question; otherwise target `process` with a proposal that names both candidates.

## Open the PR

Work in a fresh worktree of the target repository's default branch, never in the ledger worktree or the run's own worktree:

```sh
git -C <repo> fetch -q origin <default>
git -C <repo> worktree add -b retro/<slug> ~/.agents/worktrees/<repo-name>/retro-<slug> origin/<default>
```

Keep the change to the smallest one that would have prevented the occurrence. Never edit `lessons/` from a product branch; the ledger changes go through `ledger.mjs`. Commit with a Conventional Commit subject the repository accepts, push, then:

```sh
gh pr create --draft --head retro/<slug> --base <default> --title "<subject>" --body-file <file>
```

The body has four parts: **Lesson** (what went wrong, what it cost, the rule from now on, in plain words without file names), **What happened** (the timeline lines and links), **Change** (what this PR does and why it stops a repeat), **Decide** ("Merge to accept, close to reject. Comment to ask for a change; `/retrospect follow-up` answers."). Name how to tell it held on `record` with `--verify` and `--verify-after`, or leave both out when "it did not happen again in 14 days" is the right test.

When the target is not on GitHub or `gh` is unavailable, push the branch if possible and report the branch and the body so the user opens the PR by hand; record `--product none` with that in the occurrence.

## By target

- `skill:<name>`: follow the author-skill rules for a revision when that skill is installed (`<skill-dir>/../author-skill/SKILL.md`). Add a test or eval assertion that fails before the change, a `.changeset/` entry, and run the repository's checks (`npm test` in the skill collection) before pushing. A failing check you cannot fix: push anyway and say so in the body.
- `repo:<repo>`: read the instruction file first and add the rule beside its siblings, with the occurrence as its example; add a lint rule, test or hook when one can enforce it.
- `ci:<repo>`: change the CI configuration and put the timing or failure evidence in **What happened**.
- `code:<repo>`: fix the shared piece with a test that fails on the default branch.
