# Checkpoint identity and scope

Resolve the base in order: assignment, existing GitHub PR base (`gh pr view --json baseRefName`), repository default (`git symbolic-ref refs/remotes/origin/HEAD`), then `main`.

Before checks, record full `reviewed_commit` from `git rev-parse HEAD` and `revision` from `node <skills-dir>/deliver/contract.mjs revision <task-dir>`. Confirm next round and previous valid blockers through `contract.mjs review-next <task-dir> <review-type> <checkpoint>`.

Read the assigned phase; otherwise select validated current indexed `plan`, `structure-outline`, `epic-plan`, `design-tdd`, then `design-prd`. With none, report no comparison. Bind plan/phase records to exact current `reviewed_artifact` and `reviewed_artifact_sha256`; new plan bytes do not reset checkpoint round history. A genuinely absent index follows the collection's legacy rules.
