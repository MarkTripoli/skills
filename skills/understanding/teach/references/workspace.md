# Learning workspace

The files a course keeps in its workspace directory, and the format of each. Workspace paths resolve from the directory `/teach` was run in. Create a file or directory when it is first needed.

## Contents

- Files
- MISSION.md
- RESOURCES.md
- Learning records
- GLOSSARY.md
- NOTES.md

## Files

| Path | Holds |
|---|---|
| `MISSION.md` | Why the user is learning this. Every teaching choice traces back to it. |
| `RESOURCES.md` | Trusted sources to teach from, and communities to practice in. |
| `learning-records/NNNN-slug.md` | What the user has shown they know. Sets what to teach next. |
| `GLOSSARY.md` | The one vocabulary every lesson uses. |
| `lessons/NNNN-slug.html` | Lessons, the unit of teaching. |
| `reference/*.html` | Compressed takeaways for quick lookup: cheat sheets, syntax, procedures, routines. Built to print well. |
| `assets/*` | Components lessons share: the stylesheet, quiz widgets, simulators, diagram helpers. |
| `NOTES.md` | The user's teaching preferences and working notes. |

Numbered files use four digits and increase by one from the highest existing number.

## MISSION.md

```md
# Mission: {topic}

## Why
{One to three sentences: the concrete outcome the user is after. What changes in their work or life once they can do this?}

## Success looks like
- {A specific thing the user will be able to do, that someone could observe}

## Constraints
- {Time, budget, commitments, learning preferences}

## Out of scope
- {Adjacent topics the user does not want to chase now}
```

- One mission per workspace. Two unrelated subjects are two workspaces.
- Concrete beats abstract: "ship a Rust command-line tool to my team" beats "learn Rust".
- When the user cannot say why, interview them before writing anything.
- Keep it under one screen. When the goal moves, confirm with the user, update the file, and add a learning record of the change.

## RESOURCES.md

```md
# {topic} resources

## Knowledge
- [{Kind: title, author}]({url})
  {What it covers. Use for: when to reach for it.}

## Communities
- [{name}]({url})
  {Why it is trustworthy. Use for: what to ask there.}

## Gaps
- {An area the mission needs that has no good source yet}
```

- High-trust sources only: primary sources, recognized practitioners, reviewed work, well-moderated communities. Leave out marketing.
- Annotate every entry; a bare link is useless in three months.
- Remove a source that proved wrong, shallow or off-mission. Five sharp sources beat thirty weak ones.
- Record here when the user has opted out of communities.

## Learning records

```md
# {What was learned or established}

{One to three sentences: what the user now knows, and why that changes what to teach next.}
```

That is the whole required format. Add only when useful: `Status:` (`active`, or `superseded by NNNN`), `Evidence:` (how the user showed it), `Implications:` (what this unlocks or rules out).

Write a record when the user:

1. used a non-trivial idea correctly, not merely saw it;
2. disclosed prior knowledge, with the depth they claimed;
3. had a misconception corrected, which predicts where related topics will trip them;
4. changed the mission because of what they learned.

Do not write one for material that was only covered, for a term the glossary already defines, or as a session journal. When a later record contradicts an earlier one, mark the earlier one superseded; do not delete it.

## GLOSSARY.md

```md
# {topic} glossary

**{Term}**:
{One or two sentences on what the term is.}
_Avoid_: {synonyms this workspace does not use}
```

- Add a term once the user can use it correctly; the glossary records understanding and is not reading material.
- Pick one word per concept and list the rest under Avoid.
- Use glossary terms inside other definitions, and in every lesson.
- State the resolution when the wider field uses a term loosely.
- Update a definition in place as understanding deepens.

## NOTES.md

Free-form. Record how the user wants to be taught (pace, format, examples they like) and anything to remember when designing the next lesson.
