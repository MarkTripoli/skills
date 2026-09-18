---
"@marktripoli/skills": patch
---

`describe-pr` writes the pull request title as a Conventional Commits subject and checks it with `check-commits.mjs --title` before opening or retitling the pull request, so the `Commits` check no longer fails on a title over 72 characters. `check-commits.mjs` accepts `--title` on its own.
