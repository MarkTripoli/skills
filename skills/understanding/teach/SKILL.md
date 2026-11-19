---
name: teach
description: Teaches the user a codebase, change, concept or whole subject until they understand it, either as one layered plain-language explanation built from how the thing works and why it is that way, or as a multi-session course kept in a learning workspace with a mission, short lessons and records of what was learned. Use when the user runs /teach or says "teach me", "help me really understand", "break this down for me", or wants to learn a topic over several sessions; not for a report on a delivered change for another audience (use explain) or for one diagram (use show-me).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Teach

The goal is that the user understands the thing. Nothing gets changed, and the reply is the teaching itself, never a report about it.

## Pick the mode

- The user points at something that exists (code, a change, a subsystem, a concept in this conversation) and wants to understand it now: [Explain](#explain).
- The user wants to learn a subject over time, or the current directory already holds a `MISSION.md`: [Course](#course).
- Unclear: explain now, and offer a course in the last line when the subject is larger than one sitting.

## Explain

1. Decide the few things the user should walk away understanding. Choose them from why they are asking (about to change it, reviewing it, debugging it, new to it) and from what they already know. Read both from the conversation; do not quiz them. Skip what they plainly know, and put the depth where their question is.
2. Gather two accounts from the sources, in parallel workers when the subject is a whole subsystem and the runtime has them:
   - **How it works.** Trace the real path through the code: entry point, data flow, the state that changes. Cite `file:line`.
   - **Why it is that way.** Read history and decisions: `git log` and `git blame` on the lines that matter, the pull request, design records, comments. Mark each reason as recorded (a source says so) or inferred (it fits the evidence). Keep that marking through every rewording; it is a finding, not style.
3. Open with a plain definition: name the thing, with its common name when it has one, and say what it is in general terms. Tie it to the case in front of the user, then build from there: how it works, the reasons, the edge cases. For each part, give the problem it solves and how it solves it. Walk through what happens as a person uses it when that makes it land. A list of functions and constants is reference, not teaching.
4. Give the smallest complete answer first, a sentence or two, then stop. Add a layer when the user asks. Never a wall of text.
5. Keep it a conversation. Offer to go deeper or move on and follow the user's lead. No quizzes, no announced pauses, no flagging a part as hard or important. With no person to answer (a one-shot run), deliver the explanation whole and put the offer at the end.
6. Show as well as tell. Open the diff, the code or a debugger when that is fastest. For anything with three or more moving parts, draw a short series of diagrams in which each redraws the last and adds one part, so the user watches the system assemble; one diagram with everything at once is reference. Use Mermaid for flows and structures whose labels carry the meaning, and a sketch with a few short labels for spatial ideas such as layout, overlap or before and after. The show-me skill has diagram patterns when it is installed. A single simple point needs no figure.

Wording: plain spoken English, as to a colleague. State the mechanism, not a metaphor for it or a preview of it. One name per concept. One or two commas per sentence; split the rest. No printed framing labels ("the key insight", "at its core", "TL;DR"). Target density: "Virtualization runs in two parts, one for rendering and one for loading from disk. When an item scrolls past the buffer, its DOM node and its in-memory data are both evicted."

## Course

A course is stateful: the directory `/teach` runs in is the learning workspace, and its files are the memory between sessions. Read [references/workspace.md](references/workspace.md) for the files, their formats and when to write each one.

Each session:

1. Read `MISSION.md`, `NOTES.md`, the learning records and the glossary. With no mission, interview the user on why they want to learn this before teaching anything; a lesson with no mission behind it has nothing to aim at.
2. Until `RESOURCES.md` holds trusted sources, find them first. Teach from those sources and cite them in the lesson; do not teach from memory alone.
3. Choose what to teach: what the user asked for, else the most mission-relevant thing just beyond what the learning records show they can do.
4. Build one lesson by the rules in [references/lessons.md](references/lessons.md): one short, self-contained HTML file with a single win, the knowledge needed for it, then practice with immediate feedback. Reuse the components in `assets/`. Open the file for the user when a command can.
5. Update the reference documents and glossary the lesson feeds.
6. Write a learning record only on evidence: the user showed they can use the idea, disclosed prior knowledge, or had a misconception corrected. Coverage alone is not learning.
7. Record a stated teaching preference in `NOTES.md`. Confirm with the user before changing the mission.

When a question needs the judgment of practitioners, answer as well as the sources allow, then point the user to a community from `RESOURCES.md`. Respect a stated wish not to join one.
