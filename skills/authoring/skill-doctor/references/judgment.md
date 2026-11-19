# Judgment rubric

The review a script cannot do. Each item names what to look for, the effect of getting it wrong, and the fix. Section names in parentheses refer to the published "Skill authoring best practices" guidance.

## Contents

- Description and triggering
- Body
- Files and scripts
- Evidence
- Host limits worth knowing

## Description and triggering

1. **What and when.** The description says what the skill does and when to use it, in the third person, with the words a user would type. The model picks a skill from this text alone. Fix: one sentence on what it does and produces, then "Use when" with real phrases. (Writing effective descriptions)
2. **Key use case first.** A listing can be cut short, so the opening clause must identify the skill by itself.
3. **Near misses.** Name the closest other skill the user has and say which requests belong to it. Test: write three requests that should trigger this skill and three near misses that should not, then check the description separates them. For a rigorous pass, use about twenty queries, half of each kind, and try each three times in fresh sessions.
4. **Not a summary of the workflow.** A description that lists the skill's steps invites the model to follow the description and skip the body. Describe the trigger and the result, not the procedure.
5. **Name.** A verb phrase or noun phrase for the activity. Gerunds read well (`processing-pdfs`). Avoid `helper`, `utils`, `tools`. (Naming conventions)

## Body

6. **Concise.** Ask of each paragraph: would a capable model get this wrong without it? Delete definitions of common terms, restated instructions and motivation. (Concise is key)
7. **Degrees of freedom.** A fragile, order-sensitive operation gets an exact command and no options. A step with many valid approaches gets a heuristic and the goal. A skill that scripts judgment, or leaves a destructive step to judgment, has the freedom backwards. (Set appropriate degrees of freedom)
8. **One default.** Each choice names one tool or path and one escape hatch, not a menu. (Avoid offering too many options)
9. **One term per concept.** The same thing keeps the same name across SKILL.md and every reference. (Use consistent terminology)
10. **Workflow shape.** A sequence is numbered steps, with a copyable checklist when long. A branch is a list of conditions each ending in an action. Quality-critical output has a run-check, fix, repeat loop. (Use workflows for complex tasks; Implement feedback loops)
11. **Examples.** A concrete input and output pair where output style matters; the pair teaches more than a description of the style. (Examples pattern)
12. **Plain rules with reasons.** A rule states what to do and why. Shouted words and repeated warnings make current models over-apply the rule to cases it never meant. A failure that keeps recurring gets a check, a script or an eval.
13. **No stale facts.** Dates, version-specific advice and "new" features go under an "Old patterns" heading or come out. (Avoid time-sensitive information)

## Files and scripts

14. **Progressive disclosure.** SKILL.md is the overview; detail lives in files it links, each with what the file holds and when to load it. Every file is one link from SKILL.md. Content needed on every run stays in SKILL.md. (Progressive disclosure patterns)
15. **Descriptive file names.** `form_validation_rules.md`, not `doc2.md`.
16. **Run or read.** For each script, SKILL.md gives the exact command and says whether to execute it or read it as reference. (Make execution intent clear)
17. **Scripts solve, not defer.** A script handles its own error cases and prints what to change. Each constant carries a comment giving its reason. (Solve, don't punt)
18. **Deterministic work is scripted.** A procedure the model would otherwise re-derive every run (validation, parsing, counting) belongs in a script.
19. **Dependencies stated.** The skill lists the tools and packages it needs and how to get them. (Avoid assuming tools are installed)

## Evidence

20. **Evaluations exist.** At least three realistic requests with a graded outcome, written before the body grew, and a baseline of the same requests without the skill. A skill with no evaluation is a guess. (Build evaluations first)
21. **More than one model.** A skill tuned on the strongest model can under-explain for a smaller one; run the evaluation on each model that will use it. (Test with all models)
22. **Observed in use.** In a transcript of a real run, look for references never opened, files read repeatedly and steps skipped. Each one shows where the structure misleads. (Observe how Claude navigates Skills)

## Host limits worth knowing

- `name`: at most 64 characters of lowercase letters, digits and hyphens; not "anthropic" or "claude".
- `description`: at most 1024 characters, no angle brackets. Claude Code cuts `description` plus `when_to_use` at 1536 characters in the listing, and drops the descriptions of the least-used skills first when the listing exceeds its share of the context window.
- SKILL.md body: under 500 lines. After a compaction, Claude Code keeps the first 5,000 tokens of each invoked skill.
- Frontmatter accepted everywhere: `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`. Fields such as `disable-model-invocation`, `argument-hint`, `paths`, `context`, `model` and `hooks` work only in Claude Code, and other hosts reject a skill that carries them.
