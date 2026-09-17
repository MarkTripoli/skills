---
"@marktripoli/skills": minor
---

Judge epic child size with a typed question instead of an agent's reading. `judge.mjs size-children` asks the TypeSafe System One model the four tests of `shared/SLICING.md` as one probability each, plus whether the child's acceptance sentences name observable state and which split would apply if the child is too large, and prints `ok`, `split`, or `unclear` per child. `create-epic-plan` records the answers in a `## Sizing judgments` table and splits the children the helper calls oversize. The bars come from a calibration set of eight children, four of them one pull request each and four oversize; the effort question carries lower bars because the model cannot see the codebase. Without `TYPESAFE_API_KEY` the helper exits 3 and the skill sizes the children itself, as before.
