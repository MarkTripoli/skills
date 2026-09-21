---
name: configure-model-routing
description: Configure model routing when a candidate profile is missing, when a profile needs replacement, or when a user asks to set up model candidates for delivery. Ask one setup question at a time, save a validated economy/routing/candidates profile, and verify it through route-model.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Configure model routing

Invoke this skill as `/configure-model-routing`; Codex users invoke `$configure-model-routing`. Configure one shared profile for Claude Code, Codex, Oh My Pi, Pi, and portable installs. This skill changes configuration, not provider credentials.

## Interaction contract

Ask exactly one question, wait for the answer, then ask the next question. Do not bundle setup choices into one prompt. Explain the current answer before asking the next question. If discovery is unavailable or fails, continue with explicit model IDs instead of blocking the harness.

## 1. Select the profile location

Ask whether this profile belongs to the current project or is user-level. For a project profile, use `<project>/.agents/model-candidates.json`. For a user-level profile, ask for the path and tell the user to reference it with `SKILLS_MODEL_CANDIDATES_FILE`; do not invent a second user-level default. Create parent directories as needed.

Read an existing selected file before replacing it. Preserve no credentials, API keys, access tokens, cookies, headers, or provider configuration in the profile.

## 2. Collect candidates

Ask which harnesses need candidates. Discover only through these stable public commands when the named binary exists:

- Pi: `pi --list-models`
- Oh My Pi: `omp models --json`

Treat missing binaries, unsupported flags, nonzero exits, malformed output, and empty catalogs as unavailable discovery. Use explicit model IDs supplied by the user instead. Claude Code and Codex always accept explicit IDs and never use private catalog scraping.

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

`routing` may be `fixed` when the caller wants the economy model without JEV. Never put credentials or secret-bearing descriptions in this JSON.

## 3. Write and validate transactionally

Validate before writing: the array is non-empty, IDs are unique non-empty strings, costs are finite and non-negative, descriptions are non-empty, and `economy` exactly matches one candidate. Create a uniquely named temporary profile in the target file's same directory. Write the complete profile there and clean that temporary file on every pre-rename failure.

Validate the temporary profile through the existing `route-model` helper with explicit candidate-file input: pass `--candidates <temporary-file>` and use an unknown phase so this validation does not call JEV. Do not validate the temporary file through project or environment lookup. A failed validation leaves the prior target unchanged.

After temporary validation succeeds, atomically rename the temporary file over the target. Before replacing an existing target, make a same-directory backup while the target remains in place. Then verify the final target through normal lookup: use project `cwd` lookup for `.agents/model-candidates.json`, or `SKILLS_MODEL_CANDIDATES_FILE` for a user-level file. Require the JSON result to report the configured economy model, every candidate in saved order, and the expected `profileSource` (`project` or `env`).

Temporary-validation shape (use explicit candidate-file input):

```sh
printf '%s\n' '{"skillsDir":"<skills-dir>","phase":"unknown-phase","cwd":"<project>"}' \
  | node <skills-dir>/route-model/route-model.mjs --candidates <temporary-file>
```

If final lookup verification fails, restore the prior file with an atomic rename from the same-directory backup. When no prior file existed, remove the new target atomically. Clean the backup, temporary, and failed-new files after either outcome. If any pre-rename action fails, clean temporary files and retain the prior profile. Report a restore or cleanup failure as a failed setup rather than claiming success.

Final project verification uses the same input without `--candidates`. Final user-level verification uses `env SKILLS_MODEL_CANDIDATES_FILE=<file> node <skills-dir>/route-model/route-model.mjs` with the same input. Use same-directory Node filesystem operations for the temporary file, backup, atomic renames, and cleanup.

## Completion

Report the saved path, economy model, candidate order, routing mode, discovery result, and helper verification result. State that credentials were not read or stored. If setup cannot complete, report the exact validation or discovery failure and leave the prior file unchanged when replacement was unsafe.
