# Repository requirements search

Used in step 2 of `SKILL.md`: find related documents and the repository's review rules.

## Related documents

Search at the target branch and at every request head, since a request may add or change its own design notes. Search `docs/`, `specs/`, `design/`, `adr/`, `rfcs/`, and any `docs` or `documents` folder inside the changed apps or modules:

- `git ls-tree -r --name-only <ref> | grep -iE '(^|/)(docs?|documents|specs?|design|adrs?|rfcs?)/|prd|tdd|design|spec'` lists candidates by path.
- `git grep -il -E '<ticket keys>|<epic key>|<feature name>' <ref> -- '*.md' '*.mdx' '*.rst' '*.txt'` finds documents that name the work.
- Look up every document path that a ticket, epic, or request description cites (for example `feature-docs/02-tdd.md`) by its basename across these refs, because citations often point at another folder or repository.

Read the matches that describe the feature or the modules the requests change, and skip unrelated specs and generated files. A cited document that is in no ref goes on the unreachable list.

## Review rules

Collect the repository's review rules from the target branch: `.code-review/` when it exists (start with its `README.md` or index, which says how the rules apply and what is out of scope), plus the convention files those rules point to, such as `.cursor/rules/*.mdc`, `AGENTS.md`, `CLAUDE.md`, or an engineering guidelines document. Read the target branch's copy, because a request cannot relax the rules it is reviewed against; when a request changes a rule file, note that change as a lead. For each request, list the rule files whose topic its diff touches (migrations, queries, concurrency, background tasks, tests), so each worker reads only those.
