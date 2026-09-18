---
slug: describe-pr-title-rule
title: describe-pr checks the pull request title against the commit subject rule
workflow: oneshot
created: 2026-09-18
---
`describe-pr` validates commit subjects but not the title it writes against the same 72-character Conventional Commits rule, so PR #16 opened with a 74-character title and the `Commits` check failed. Make `describe-pr` write the title as a subject and check it with `check-commits.mjs --title` before opening or retitling the pull request.
