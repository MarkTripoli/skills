---
name: product-brief
description: Writes a short, human-centric product brief as one HTML page for the engineers and coding agents who must build a capability they do not know, with the problem, a small memorable example cast, ordered principles that each carry an example and a why, fat-marker sketches with red annotation arrows, and numbered functional specifications. Use when the user runs /product-brief, gives a problem statement or feature idea and asks for a brief, or asks to distill a long spec, PRD, BA document or prototype into one; not for a PRD interview (use /create-prd) or for explaining a change that already shipped (use /explain).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Product brief

A product brief tells a builder what people need and why, so the builder can make the right call on every detail the brief does not cover. It is human-centric: it starts from the people, their situation, and the moment the feature serves them. Models build better when they know why.

Less is more. A good brief is one scrolling page: the problem, the principles with their reasons, a few hero sketches, and testable statements. Omit detail that a design file, a ticket, or a capable builder already supplies.

The input can be a one-line problem statement on the command line, a conversation, or a stack of documents, prototypes, and tickets. The steps are the same. Only step 1 changes.

Run every step, whatever the size of the input. Work done in the brief saves a multiple of that work in design, build, and rework.

Copy this checklist and tick it off:

```
Brief progress:
- [ ] 1. Problem, people, and reasons gathered
- [ ] 2. Essence chosen
- [ ] 3. Cast designed
- [ ] 4. Page drafted
- [ ] 5. Sketches drawn
- [ ] 6. Owner asked once, answers written in
- [ ] 7. Adversarial review clean
- [ ] 8. Rendered and checked
- [ ] 9. Published privately
```

## 1. Gather the problem, the people, and the reasons

Collect four things. Note where each one came from.

- The people: who has the problem, what they do, and the situation they are in when it hurts.
- The problem: what goes wrong today, and what it costs them.
- The ask: the questions the requester wants the brief to answer.
- The constraints: security rules, dates, earlier decisions, platforms.

Then pick the branch that matches the input:

- A prompt only: take every fact the prompt gives. Write each missing fact that would change a principle as a question with a recommended answer. Draft with the recommended answer, and mark it as an assumption in the sentence that uses it. Ask the questions in step 6.
- Reference material: read all of it. Quote the people in it, such as a field report or a request thread, with a link. A long specification is evidence of intent, not a source of truth. When it contradicts a request thread or a decision record, the thread and the record win. List each contradiction for the user.
- Code exists: read it only for constraints the brief must state. Describe the intended behavior, not the current implementation, unless the user asks for the current one.

## 2. Choose the essence

List each thing a builder is most likely to get wrong with only the input from step 1. Each line must name a real risk, not a general good practice. Each line becomes one principle. Omit:

- Anything a design file already shows clearly: layout, labels, colors, spacing.
- Anything a capable builder does well without being told, such as loading states or error toasts, unless a principle depends on it.
- Neighboring features. Name them once under Out of scope.

## 3. Design the cast

Example people make every rule concrete and every count checkable.

1. List the cases the feature must handle. In the worked example (people who scan a QR code and wait for a leader to place them on a team): a person in no Group, a person in one Group with no team, a person in two Groups, and a person on a team in one Group but not in another.
2. Use as few people as the cases need. One person can carry two cases when the result stays clear, and one case can need two people when it compares them. Use the same rule for groups, teams, and viewers. Delete any person or group that no example uses.
3. Make every name easy to remember, so the reader never looks back at the cast list. Techniques that work:
   - A name that sounds like the case: Noah is in **no** group.
   - Names that share the starting letter of their group: Ralph waits in Romeo, and Casey and Cameron belong to Cedar.
   - An alliterative role: Ralph the researcher, Quinn the quality reviewer.
   - A name that shares the most sounds with the role word: Emmie the emergency contact holds "Em", and Ernie holds only "E".
   - Short group names that fit the domain, such as Cedar and Maple for a volunteer organization.
4. Use first names only. A surname is one more word to hold and carries no case. Add one only when a case depends on it, such as two people with one name.
5. Give each person one sentence that states the case as what the person can or cannot see or do: "Vic is Sam's teammate. Vic sees Sam's work phone and team, and none of Sam's home or family details." Never write a bare action such as "opens Sam's profile to look".
6. Keep data values, such as IDs, codes, and phone numbers, out of the cast. Put each value in the one example that needs it.
7. Explain every label in the cast in plain words where it appears. A setting such as "Show Country on" needs a gloss: "Show Country, an organization setting that shows each member's country and flag, is on."
8. Put the cast in a boxed "Who's who" section before the first section that uses a name.

The worked examples teach the technique, not the names. The brief outline has a second one, for a command-line tool, with Iris the incident commander and Devon the developer. Every brief gets its own cast, with names and groups from its own domain. Never reuse Noah, Ralph, Romeo, Iris, or Devon.

Use the same people, with the same facts, in every principle, sketch, and functional specification.

## 4. Draft the page

Use the writing guide from line 6 plus US spelling, active voice, one idea per sentence, no semicolons, and numbers in place of weasel words. Name the reader and the question the page answers. The optional technical-writing skill adds craft guidance when installed; this skill needs no sibling.

Follow the section order in [references/brief_outline.md](references/brief_outline.md). Load it now. Write the page as one self-contained HTML file with a reading column about 660 px wide, and let sketches widen to about 1000 px. Support light and dark color schemes.

Honor an explicit output path. Otherwise save a local HTML file in the user's working context. When the brief belongs to a task, use its configured root and artifact contract from the collection conventions. Validate an existing index and allocate an immutable successor for revisions; do not scan a fixed task-root path or overwrite a recorded iteration.

Also apply these rules, which a general style guide does not cover:

- Each sentence makes sense with only the sentence before it. When a sentence uses a name defined far away, say what it is in place: "Quentin is on Cedar Support, a team in another Group."
- Define every domain term, setting, and abbreviation in plain words at its first use, wherever that is: the lede, the cast, or a sketch. Spelling out an abbreviation is not a definition. Write "Service-level objective (SLO), the target for how often a request succeeds", not only "Service-level objective (SLO)".
- Keep each principle short: a heading, a rule of at most three sentences, one example, and one why. A principle states intent. Field lists, value lists such as species or relationships, length limits, required fields, and dialog copy go in the functional specifications, or nowhere when a design file shows them.
- Write each principle heading so that a reader new to the domain can say what it means. Name the concrete thing: "Only admins edit Team and Region", not "Fields that reports count stay with admins".
- Name the actor. Write "Done by an Admin" or "An Admin assigns Ralph", never a bare role title.
- State a fact with a cast name and a number, then its consequence: "The Romeo Group Lead sees the 3 people who wait in Romeo. Noah, in no Group, is absent."
- Delete cruft: status lines, ship dates, "Draft for review" tags, signposts such as "This brief explains", slogans such as "One action, one effect", and invented ranges such as "NA-01 to NA-52" over a list of 24.
- Use the owner's own words for a why when the owner gave them.

## 5. Draw the sketches

Read [references/sketch_style.md](references/sketch_style.md) and copy the parts you need from [references/sketch_kit.html](references/sketch_kit.html). Pick the frame from the surface the feature has:

- A phone app: a phone frame.
- A desktop or web app: a wide window frame.
- A command-line tool: a terminal session.
- No user interface, such as an API, a sync, or a background job: a lifecycle or message diagram.

Draw two or three hero sketches, the one interaction an owner decision changed, and a lifecycle or cast diagram when state is the point. The hero sketches sit after the cast and before the principles, so the reader sees the screens first. Each note therefore states its rule in full and never leans on a principle. Every sketch uses one fat-marker ink color, with red handwritten notes and red arrows that point at the exact element each note explains.

With no design file, the sketches are the first statement of what each screen must contain. Keep them as rough as when a design exists, so that nobody reads them as a layout.

## 6. Ask the owner once

Ask the user one round of questions: every missing fact from step 1 and every open product decision, each with options and a recommendation. Write each answer into the principle, rule, sketch, or functional specification it changes, and remove its assumption mark. An assumption the user does not answer stays marked. The final brief has no open decisions section. When an answer changes an interaction, give that interaction its own section and sketch.

## 7. Review adversarially

Run the four reviews in [references/adversarial_review.md](references/adversarial_review.md), each in a fresh child worker that sees only the page and its screenshots. Without worker support, run the four reader roles inline and state that review was not independent. Fix the brief, then rerun the review that raised each finding. Stop when no [H] findings and no **Wrong** guesses remain.

## 8. Render and check

Render the page at 1280 px and 400 px wide, in light and dark, with an available browser. Look at every screenshot. Without a browser, save the HTML locally and report the visual check as unperformed, not passed. Confirm:

1. The page has no horizontal scroll at 400 px.
2. Every arrow touches its element, and no note overlaps another.
3. Every name and count agrees across the cast, the text, and the sketches.
4. A top-to-bottom read of the extracted page text finds no sentence that breaks the rules in step 4.

## 9. Publish privately and iterate

Publish the page where only the user can see it: a private artifact when the runtime has one, else a local HTML file. Send nothing to anyone else, a channel, or a ticket until the user says so.

When the user asks for changes:

- Keep every version under its own name, such as `brief-v2`, and never overwrite one the user has seen. In an indexed task, register each successor and select it through the current semantic pointer instead of treating a filename as current.
- Report what changed in each version, as a short list.
- When two directions are both reasonable, build both as `a` and `b` variants and say which one is better and why.
- Apply a lesson the user gives about one sentence to every similar sentence in the brief.
