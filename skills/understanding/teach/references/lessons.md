# Lessons

How to design one lesson in a course workspace.

## One lesson

- One self-contained HTML file in `lessons/`, teaching one tightly scoped thing tied to the mission.
- Short enough to finish in one sitting. Working memory is small; stay inside it. The user ends with one concrete win to build on.
- Pitched just past what the learning records show the user can already do.
- Clean, readable typography and layout that prints well; the user will come back to it.
- Links to related lessons and reference documents, and names one primary source to read or watch: the most trustworthy one found.
- Cites a source for each claim, from `RESOURCES.md`.
- Ends by reminding the user they can ask the agent follow-up questions.

## Knowledge first, then practice

Teach only the knowledge the lesson's skill needs, then have the user practice it.

- While the user is taking in new knowledge, difficulty is the enemy: it uses the working memory that understanding needs. Keep the presentation easy.
- While the user is practicing, difficulty is the tool. Effortful recall is what makes knowledge last.

Feeling fluent during a lesson is not the same as remembering it next month. Design for retention:

- retrieval practice: the user recalls from memory before seeing the answer;
- spacing: later lessons bring earlier material back;
- interleaving: practice mixes related skills. Use it for practice only, not for first exposure.

## Feedback loops

Practice is a loop in which the user acts and learns at once whether it was right, automatically where possible. Use quizzes and small in-browser tasks, or a guided list of real-world steps for physical or procedural skills.

Quiz answers give nothing away: every option has the same number of words and near the same length, the correct option's position varies across questions, and formatting is identical.

## Assets

Before writing a lesson, read `assets/` and build from what is there. The shared stylesheet is the first component every workspace gets, and every lesson links it, so the lessons look like one course. When a lesson needs something a later lesson could reuse, write it as a component in `assets/` and link it; do not inline it.

## Reference documents

A lesson is rarely reopened; a reference document is. As lessons are written, compress what they establish into `reference/` pages built for quick lookup: syntax and snippets, procedures and flowcharts, routines, and the glossary.
