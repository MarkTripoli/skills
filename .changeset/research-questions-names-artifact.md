---
"@marktripoli/skills": patch
---

Handoff commands now reliably name the artifact the next phase acts on.

- `create-research-questions` and `iterate-research-questions` hand off `/create-research @<file>` instead of a bare `/create-research`, so the research phase reads the questions just written rather than guessing and reaching for the wrong file.
- `create-plan` now honors a `@file` argument (the design-discussion and TDD phases already passed one); its documented input resolves the named artifact before falling back to the newest design artifact.
- Every create/iterate phase output instruction now tells the model to fill `{artifact_file}` with the saved file's name only and to add no prose around the command fence, closing the gap that let a reply invent a path or point at an unrelated file.
- `scripts/validate.mjs` gains a guard: each forward handoff fence must carry `@<file>` when the next skill acts on that specific artifact, and must be bare when the next skill reviews the whole diff or resolves the newest artifact itself. The two cases are declared in `FENCE_ARTIFACT` and kept in sync with the answer inventory.
- Every handoff now says where to run. The fixed sentence became `Open a new session in {run_location}, then run:`, a slot every forward answer template carries; each phase fills it from observed git state (`` `<root>` on branch `<branch>` `` in a work tree, `this checkout` otherwise), never a guess. The conventions require the next session to open in that same checkout and branch, because the committed task directory and each `@<file>` are branch-local. `scripts/validate.mjs` and the eval reply check now reject a handoff whose location slot is empty, so a locationless reply cannot ship. The by-hand `deliver` reply also states the branch it committed the task on.
