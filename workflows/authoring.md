# Authoring skills

Skills about skills. Source: `skills/authoring/`.

| Skill | Use it to | Produces |
|---|---|---|
| [`author-skill`](../skills/authoring/author-skill/SKILL.md) | Add or revise a skill in this collection | A scaffolded skill with an eval scenario that passes every repository check |
| [`skill-doctor`](../skills/authoring/skill-doctor/SKILL.md) | Diagnose any skill, or every installed skill | Findings by severity with the fix for each; listing cost per session |

`author-skill` is the write path and works only in a checkout of this collection. `skill-doctor` is the read path and works on any skill directory, including ones installed from elsewhere; `author-skill` runs it as its last review.

```text
/author-skill add a skill that ...
/skill-doctor ~/.claude/skills
```
