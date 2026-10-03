# Skill rules

## Contents

- Checked by `scripts/check-skill-practices.mjs`
- Checked by `scripts/validate.mjs`
- Judgment rules with no script
- Source

Guidance names refer to Anthropic's "Skill authoring best practices" page.

## Checked by `scripts/check-skill-practices.mjs`

Each failure prints `path:line: <rule id>: <message> (<guidance section>)`. `--json` prints the same results as JSON.

| Rule id | Passes | Fails | Why | Guidance section |
|---|---|---|---|---|
| `frontmatter-yaml` | Frontmatter parses as YAML with string `name` and `description` | Invalid YAML or a non-string value; quote a value that holds `: ` | Runtimes load frontmatter with a YAML parser, so a stray `: ` drops the skill | Skill structure |
| `layout` | A `SKILL.md` at `skills/<name>/` or `skills/<group>/<name>/` | A layout problem that `scripts/lib/layout.mjs` reports | Installs and checks find skills only there | Skill structure |
| `name` | At most 64 characters of `a-z`, `0-9` and `-`; no `anthropic` or `claude`; no XML | Uppercase, underscores, a longer name, a reserved word, a tag | The platform rejects these names | Skill structure |
| `description` | 1 to 1024 characters, no XML tags, third person | Empty or longer; a tag; the words `I`, `you`, `your`, `we`, `our` outside quoted phrases (`i.e.` and `I/O` pass) | The description is injected into the system prompt, and mixed point of view hurts discovery | Writing effective descriptions |
| `body-lines` | SKILL.md body under 500 lines | 500 lines or more | A loaded body competes with the conversation for context; detail belongs in `references/` | Progressive disclosure patterns |
| `nested-reference` | A reference (`.md` or `.html`) links only files that SKILL.md also links, and no file under another skill's `references/` | A reference links a `references/` file (markdown link or backticked `references/<file>`) that SKILL.md does not, or links a file under another skill's `references/` | A model reading a reference reached through another reference may preview it with `head` and miss content | Avoid deeply nested references |
| `reference-toc` | A reference over 100 lines has a `Contents` heading or line in its first 15 lines | A longer reference without one | A partial read still shows the full scope | Structure longer reference files with table of contents |
| `windows-path` | Forward slashes | A path that separates segments with backslashes | Backslash paths break on Unix | Avoid Windows-style paths |
| `time-sensitive` | No month-plus-year phrase or `as of`, `before`, `after`, `until`, `since` plus a year (not before a unit such as `ms` or `tokens`) outside code fences, `<details>` and an `Old patterns` section | Such a phrase in the main text | The text becomes wrong without anyone editing it | Avoid time-sensitive information |
| `runtime-mcp-name` | `<server>:<tool>` | An `mcp__` name | A runtime-specific name does not resolve on other runtimes | MCP tool references |
| `script-intent` | Every file under `scripts/` is named by file name (whole name, not a substring of another) in SKILL.md or a reference, or loaded by a script that is | An unnamed script; test files (`test_*`, `*.test.*`, `test-*`) are exempt | The reader must know whether to execute a script or read it | Make execution intent clear |
| `emphasis` | No `MUST`, `CRITICAL`, `IMPORTANT`, `NEVER` or `ALWAYS` outside code fences, inline code and quoted strings | The bare word | A recurring agent failure is fixed with a check, test or eval, not louder wording | Concise is key; repository AGENTS.md |
| `eval-coverage` | A phase of some `evals/scenarios/*.mjs` runs the skill or names it in `covers`, or `EVAL_EXEMPT` lists it with a reason | Neither | Evaluations are the source of truth for a skill's effect | Build evaluations first |

Exempt from `reference-toc`: files ending `_template.md` or `_answer.md`. They are copied into artifacts, so a contents list would land in every artifact.

## Checked by `scripts/validate.mjs`

| Rule | What it requires |
|---|---|
| Layout | `skills/<name>/` or `skills/<group>/<name>/`; names unique across groups because installs flatten |
| Frontmatter | Keys exactly `name` and `description`; `name` equals the directory; description 1 to 1024 characters |
| Description shape | Contains `Use when`; does not open with `Run for` or a bare imperative from `BARE_IMPERATIVES` (a fixed word list) |
| Line 6 | The shared sentence linking `shared/WRITING.md` and `shared/CONVENTIONS.md`, each once |
| Skill count | `EXPECTED_SKILL_COUNT` equals the number of skills |
| Reference files | Every `references/<file>` named in SKILL.md exists, and every file under `references/` is named |
| Names resolve | Each slash command, and each skill named in the phrase "the installed ... skill", names an existing skill (`NON_SKILL_COMMANDS` lists host commands and paths that are not skills) |
| Answer templates | Listed in the answer inventories; one handoff fence naming the next skill, or none for a terminal answer |
| Duplicate templates | Templates that must match across skills have identical text |
| Human-review templates | Required headings, one `{artifact_link}`, a `Check:` line |
| Banned tokens | No retired host or tool names anywhere in the repository |
| Workflow coverage | Delivery skills appear in `workflows/delivery.md` |
| Sizes | no file exceeds its `WORD_CAPS` entry; lower the cap when a file shrinks, never raise it |
| Requirement shapes | A skill that writes acceptance criteria carries the five sentence shapes from `shared/SLICING.md` in its own text |
| Commit rule | The subject regex in `shared/CONVENTIONS.md` equals `scripts/check-commits.mjs` |

Why: the collection's skills hand off through fixed text, so a drifted template or a missing file breaks a later phase silently. Guidance: Progressive disclosure patterns; Writing effective descriptions.

## Judgment rules with no script

Review each against the finished skill.

1. Conciseness. Delete what a capable model already knows. Ask of each paragraph: does it justify its token cost? Guidance: Concise is key.
2. Degrees of freedom. Fragile, order-sensitive steps get an exact command and no options. Judgment steps get a heuristic. Guidance: Set appropriate degrees of freedom.
3. One default per choice. Name one tool or path and one escape hatch, not a menu. Guidance: Avoid offering too many options.
4. Consistent terminology. One word per concept across SKILL.md and references (`<skill-dir>`, not three spellings). Guidance: Use consistent terminology.
5. Examples. A concrete input and output pair beats a description of the style. Guidance: Examples pattern.
6. Workflows. A sequence of steps gets numbered steps, a copyable checklist when long, and a validate-fix-repeat loop where quality matters. Guidance: Use workflows for complex tasks; Implement feedback loops.
7. Decision lists. A branch is a list of conditions each ending in an action, not a paragraph of "if". Guidance: Conditional workflow pattern.
8. Scripts solve, not defer. A script handles its own error cases and prints a message that says what to change; every constant has a reason. Guidance: Solve, don't defer.
9. Description quality. It states what the skill does and when to use it, with the words a user would say, and names the nearest sibling it is not. Guidance: Writing effective descriptions.
10. Names. Prefer a verb phrase or noun phrase that says the activity; avoid `helper`, `utils`, `tools`. Guidance: Naming conventions.
11. Test with more than one model. A skill that works on the strongest model can fail on a smaller one: run the live eval on at least Sonnet and Opus, and Haiku when the skill may be routed to it. Guidance: Test with all models you plan to use.
12. Observe real use. Read the transcript of an eval run: unexpected file order, ignored references and repeated reads show where the structure misleads. Guidance: Observe how Claude navigates Skills.
13. Dependencies. List the packages or tools a skill needs and how to install them; do not assume they exist. Guidance: Avoid assuming tools are installed.

## Source

https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
