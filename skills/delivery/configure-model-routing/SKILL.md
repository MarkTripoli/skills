---
name: configure-model-routing
description: Interviews the user one question at a time and saves a validated model-candidate profile (economy model, routing mode, ordered candidates), then verifies it through route-model. Use when the user runs /configure-model-routing, when route-model reports no profile, or when a profile needs replacing; not for choosing a model for a phase, which is /route-model.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Configure model routing

Invoke this skill as `/configure-model-routing`; Codex users invoke `$configure-model-routing`. Configure one shared profile for Claude Code, Codex, Oh My Pi, Pi, and portable installs. This skill changes configuration, not provider credentials.

## Interaction contract

Ask exactly one question, wait for the answer, then ask the next question. Do not bundle setup choices into one prompt. Before each next question, say in one line what the previous answer set. If discovery is unavailable or fails, continue with explicit model IDs instead of blocking the harness.

- [ ] location
- [ ] harnesses
- [ ] model IDs weakest to strongest
- [ ] cost and description for each
- [ ] economy model
- [ ] routing auto or fixed
- [ ] write and verify

## 1. Select the profile location

Ask whether this profile belongs to the current project or is user-level. For a project profile, use `<project>/.agents/model-candidates.json`. For a user-level profile, ask for the path and tell the user to reference it with `SKILLS_MODEL_CANDIDATES_FILE`; do not invent a second user-level default. Create parent directories as needed.

Read an existing selected file before replacing it.

## 2. Collect candidates

Ask which harnesses need candidates. Discover only through stable public commands, when the binary exists: Pi `pi --list-models`; Oh My Pi `omp models --json`. Claude Code, Codex, or any failed discovery (missing binary, nonzero exit, malformed or empty output): ask for explicit IDs.

Ask for the exact model IDs, weakest to strongest capability, one question at a time. Candidate array order defines capability; it does not express price. Ask for each caller-relative non-negative cost and a short capability description separately. The economy model must be one of the candidates. Keep IDs exact and do not normalize, infer, or test account access.

Use this profile shape:

```json
{
  "economy": "exact/model-id",
  "routing": "auto",
  "candidates": [
    { "model": "exact/model-id", "cost": 1, "description": "ordinary delivery work" },
    { "model": "exact/stronger-id", "cost": 4, "description": "complex planning and review" }
  ]
}
```

`routing` may be `fixed` when the caller wants the economy model without JEV.

## 3. Write and verify

Run `node <skills-dir>/configure-model-routing/scripts/write-profile.mjs --target <file> --profile <json-file-or-inline-json> --scope project|env --skills-dir <skills-dir> --cwd <project>`. The script validates the profile, writes it atomically, verifies it through `route-model` (project scope with `--project-only`, env scope through `SKILLS_MODEL_CANDIDATES_FILE`), restores the prior file on any failure, and prints one JSON result. Report that result, or its exact failure; a nonzero exit means nothing was saved. Then tell the user to rerun the installer, which pins the economy model on the builder workers of runtimes that honor a worker model field.

## Completion

Report the saved path, economy model, candidate order, routing mode, discovery result, and helper verification result. State that credentials were not read or stored. If setup cannot complete, report the exact validation or discovery failure and leave the prior file unchanged when replacement was unsafe.
