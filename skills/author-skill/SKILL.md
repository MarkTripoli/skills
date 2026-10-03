---
name: author-skill
description: Creates or revises a skill in this collection so it passes every repository check and the skill authoring guidance, starting from an eval scenario and a scaffold. Use when the user runs /author-skill or asks to add, rewrite, split, or review a SKILL.md with its references and scripts; not for task artifacts (use the phase skills) or for running the checks alone (run the scripts).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Author skill

Work in a checkout of the collection, from its root. `<skill-dir>` is the directory holding this SKILL.md. Every rule the checks enforce, with the guidance behind it, is in [references/rules.md](references/rules.md).

Install the checkout's declared Node.js runtime and run `npm install` from its root before authoring checks; the practices checker uses the declared `yaml` dependency. Live evals also need a supported authenticated agent runtime configured as described in [docs/testing.md](../../docs/testing.md). Keep security scans opt-in: authoring and normal delivery do not authorize `/security-check`.

Copy this checklist and tick it off:

```
Authoring progress:
- [ ] 1. Needed, not a sibling's job; eval scenario written; baseline recorded
- [ ] 2. Scaffolded
- [ ] 3. Description and body written
- [ ] 4. Registered
- [ ] 5. Checks pass, live eval passes
- [ ] 6. Committed
```

## 1. Confirm the need and write the eval first

Read the descriptions of the sibling skills. Then pick one:

- A sibling already covers the request: extend that skill and stop here.
- The request splits a skill that has grown past one job: scaffold the new skill and move text, do not copy it.
- Otherwise: continue.

Write `evals/scenarios/<name>.mjs` before the skill body: one request, one graded outcome, a fixture under `evals/fixtures/` if it needs files. Harness rules are in the Evals section of [docs/testing.md](../../docs/testing.md); stubs for outward commands are under [Scenario command stubs](../../docs/testing.md#scenario-command-stubs). For a new skill, run `node evals/run.mjs <name> --max-time 20` after step 2, with the scaffolded SKILL.md and without `template` on the phase (a phase naming a template of a skill that does not exist yet fails before any session), and record the failure as the baseline. A skill that cannot run live (hardware, a service) goes in `EVAL_EXEMPT` in `scripts/check-skill-practices.mjs` with a one-line reason.

## 2. Scaffold

`node <skill-dir>/scripts/scaffold.mjs <name>` creates `skills/<name>/`; add `--delivery` for `skills/delivery/<name>/` (a phase or worker of the delivery workflow). It refuses an existing name, writes the frontmatter placeholders and the line-6 sentence, and prints the registration steps. Keep line 6 byte-identical.

## 3. Write the description and body

- Description: one third-person sentence on what the skill does and produces, then `Use when` with the `/<name>` command and the phrases a user would say, then `not for` the nearest sibling. At most 1024 characters; keep it short. No `: `, no angle brackets.
- Body: numbered steps for a sequence; a decision list for each branch; one default per choice, with the escape hatch named once.
- Freedom: exact commands for fragile steps, a heuristic for judgment steps.
- References one level deep: link every file from SKILL.md; a reference never points at another reference. Give a reference over 100 lines a contents list in its first 15 lines.
- Templates the skill copies into an artifact load at the step that uses them.
- Scripts: write the exact command (`node <skill-dir>/scripts/x.mjs <args>`) and say whether to run or read it. Move any deterministic procedure into a script that prints specific errors.
- MCP tools: write `<server>:<tool>`, and define `<server>` once as the name the runtime registered for that server.
- Plain rules, no capitalized emphasis words. A failure that recurs gets a check or an eval.
- One term per concept across the skill; delete what a capable model already knows.

## 4. Register

- Raise `EXPECTED_SKILL_COUNT` in `scripts/validate.mjs`.
- Add the skill to `SKILL_DEPENDENCIES` in `scripts/install.mjs` when it reads a sibling skill.
- Add each answer template to the inventories in `scripts/validate.mjs`.
- Add user-facing skills to `docs/cheatsheet.md`. Add every delivery skill that is not an `agent-*` worker to the phase table in `workflows/delivery.md`, unless `WORKFLOW_OPTIONAL_SKILLS` in `scripts/validate.mjs` lists it.
- Add a `.changeset/` entry (`minor` for a new skill; format in `.changeset/README.md`).

## 5. Validate, fix, repeat

Run these until all pass, fixing the first failure each time:

```sh
node scripts/validate.mjs
node scripts/check-skill-practices.mjs
node scripts/sync-plugin.mjs
node scripts/sync-plugin.mjs --check
node --test tests/*.test.mjs
node evals/run.mjs <name> --max-time 20
```

`sync-plugin.mjs` regenerates `.claude-plugin/plugin.json` and `agents/`; commit what it changes. Compare the live eval with the baseline from step 1. The judgment rules in [references/rules.md](references/rules.md) have no script: reread the skill against them, and try it on a smaller and a larger model.

## 6. Commit

Use Conventional Commits as in the collection conventions: `feat(<name>): ...` for a new skill, `fix(<name>)` or `docs(<name>)` for a revision. Stage explicit paths.
