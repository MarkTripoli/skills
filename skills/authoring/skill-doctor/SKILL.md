---
name: skill-doctor
description: Diagnoses one skill or a whole directory of skills against the published skill authoring guidance and reports findings by severity with the fix for each, covering frontmatter, description triggers, size, file layout, stale or shouted wording, listing cost and whether the skill is ever used. Use when the user runs /skill-doctor or asks to check, audit, lint or diagnose a skill, why a skill does not trigger, or which installed skills to prune; not for writing a new skill in this collection (use author-skill).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Skill doctor

Examine skills and say what is wrong, how much it matters, and what to change. The doctor reads and reports. It edits a skill only when the user asks for the fixes, and then only that skill. `<skill-dir>` is the directory holding this SKILL.md. Needs Node.js 18 or later.

## Pick the scope

- A path the user names: that skill directory, or every skill under that directory.
- "My skills" or "installed skills": the user skill directory of the current runtime (`~/.claude/skills` for Claude Code, `~/.agents/skills` for portable installs), plus the project's `.claude/skills` or `.agents/skills` when present.
- A skill being written in a checkout of this collection: its source directory under `skills/`.

## 1. Run the mechanical checks

```sh
node <skill-dir>/scripts/doctor.mjs <path>
```

It prints one line per finding as `<severity> <rule> <file>:<line> <message>`, then totals, and for a directory the characters of description every session pays for, largest first. `--json` prints the same as JSON. Exit 1 means at least one error; exit 2 means a bad path.

| Severity | Meaning |
|---|---|
| error | The skill fails to load on some host, or a link is broken |
| warning | The skill loads but the model is likely to miss, misread or lose part of it |
| info | Works on this host; costs portability or reliability elsewhere |

## 2. Review what a script cannot check

For a single skill, or for each skill the user singles out, read its SKILL.md and judge it against [references/judgment.md](references/judgment.md): whether the description would trigger on the right requests and stay quiet on near misses, whether the body is concise and sets the right degree of freedom, whether its steps, examples and scripts follow the guidance, and whether an evaluation backs it. Report only findings with a concrete change; skip the rubric items the skill passes.

For a whole directory, do this review only for skills with mechanical findings and for pairs whose descriptions overlap. Two descriptions that claim the same request are one finding naming both skills.

## 3. Check use, when asked which skills to prune

In Claude Code, the built-in `/skill-doctor` command reports the skills that were listed but never invoked, and `/doctor` estimates the listing's context cost; ask the user to run the one that applies and paste the result, since a skill cannot run a built-in command. Elsewhere, search the runtime's session history for the skill's name. A skill that is never used still costs its description in every session: recommend removing it or turning its listing off, and leave the decision to the user.

## 4. Report

Lead with the verdict in one line: how many skills, how many errors and warnings, and the one change that matters most. Then, most severe first:

```
<skill> <file>:<line>
  Problem: <what is wrong, quoting the text>
  Effect: <what the model or the host does because of it>
  Fix: <the exact change>
```

Group repeated findings ("12 skills use all-caps emphasis") with one example. End with what was not checked, such as live triggering or behavior on a smaller model.

## 5. Fix, when asked

Apply the fixes to the skill the user named, error findings first, and rerun step 1 until it prints no errors. Keep the skill's `name` unchanged; renaming breaks every place that invokes it. For a skill installed from a package or another repository, say that the next update will overwrite the edit and that the fix belongs upstream. In a checkout of this collection, the repository's own validators are stricter than the doctor and decide what merges.
