---
"@marktripoli/skills": minor
---

`typed-judgment/judge.mjs` reads the TypeSafe key from `~/.config/typesafe/api_key` (or the file `TYPESAFE_API_KEY_FILE` names) when `TYPESAFE_API_KEY` is not in the environment, so hooks and agent-spawned shells that do not inherit an interactive shell's exports can still use typed judgments.
