---
"@marktripoli/skills": patch
---

fix(iterate-evidence): R7 enumerate allowed frontmatter values, forbid preamble, add continuation terminal rules

SKILL.md section 5 (continuation): states that a resumed session applies the same terminal rules — allowed `status` and `stop_reason` values are enumerated explicitly; any other value (e.g. `completed`, prose) is invalid; the final answer must be the selected template filled verbatim with nothing before its first line.

SKILL.md finalization section: adds a bolded "Allowed frontmatter values" block directly before the finalization steps, listing the only valid strings for `status` and `stop_reason` and explicitly calling out that any other value is invalid.

SKILL.md terminal delivery sentence: clarifies "nothing appears before its first line" and "the markdown receipt link is the first character of the reply."

Receipt template preamble: `status` and `stop_reason` descriptions now use pipe-separated exhaustive lists with an explicit "ONLY valid values; any other string is invalid" statement.
