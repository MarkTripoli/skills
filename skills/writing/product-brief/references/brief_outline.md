# Brief outline

## Contents

- Section order
- Title and lede
- The problem
- Who's who
- Key screens
- How a thing moves through the system
- Principles
- Detail sections
- Out of scope
- Functional specifications
- Sources
- A second worked example
- What the brief omits

The fictional worked example is a volunteer signup inbox: new people scan a QR code into an organization, and coordinators place each person on a team. The section "A second worked example" shows the same shape for a command-line tool. Copy the shape, never the names.

## Section order

1. Title and lede
2. The problem
3. Who's who
4. Key screens
5. How a thing moves through the system (only when state changes are the point)
6. Principles
7. Detail sections: one per piece of UI a principle does not settle
8. Out of scope
9. Functional specifications
10. Sources

Each section must stand alone. A reader who opens the page at any heading understands that section without the sections above it. The cast is the one exception, because every section uses it.

## Title and lede

- Title: the feature's name, as the UI shows it. "Needs Assignment inbox". No "brief", "spec", or version in the title.
- No eyebrow, status line, ship date, owner badge, or "Draft for review" tag. They carry no fact the reader acts on.
- Lede: three to five sentences. Who the people are, what goes wrong today, why it matters, and what the feature gives them, and where.

> Volunteers join an organization by scanning a QR code. Until a coordinator puts them on a team, nobody knows where they will help. A coordinator preparing a busy event has no time to search group by group. The Needs Assignment inbox gives them one place, at the top of the Groups page, to see everyone still waiting and to place each person.

## The problem

- The real user and situation in two or three short paragraphs. Name the organization, the moment, and the pressure.
- When the input quotes a real person, such as a field report or a request, use one quote with its source line. A real quote carries more weight than a paraphrase. With a prompt only, state the situation in the user's own words.
- A related need that this brief does not cover goes in a labeled aside: a small title such as "Aside: related, but out of scope", then one paragraph that names it, says how it relates, and states that this brief does not specify it.

## Who's who

A boxed cast list, placed before any section uses a cast name. Design it in step 3 of the skill.

- A small sketch of the structure (lanes or a tree) showing where each person stands.
- One legend line per person: first name, role in the hand font, and one sentence that states the person's case as what they can or cannot see or do.
  - "Noah the newcomer. Scanned the organization code. He is in no Group."
  - "Ralph the researcher. Scanned the Romeo Group code. He is on no team yet."
  - Not "Vic the viewer. Opens Sam's profile to look." It leaves the case unsaid: what can Vic see?
- No IDs, codes, or other data values. Each value goes in the one example that uses it.
- One line naming the groups and their teams.
- Every label in the sketch or the legend reads as plain words, or carries a gloss in place. A setting name such as "Show Country on" means nothing until the page says what the setting does.
- No paragraph about who the viewers in the sketches are. Each sketch carries its own viewer tag.

## Key screens

Two or three hero sketches, built with the sketch style reference, right after the cast and before the principles. A picture of the screen orients the reader before the rules do. Because no principle has been read yet, every red note states its rule in full. One sentence above the sketches says that they show content only. When a design file exists, the sentence names it as the owner of layout and styling.

## How a thing moves through the system

When the feature is about state (waiting, assigned, removed), draw one lifecycle diagram in the sketch style. Write two short paragraphs beside it: how a person enters each state, and what moves them out and back.

## Principles

Principles carry the design intent a model cannot derive from screens. Write one for each risk from step 2 of the skill, and no more.

A principle is intent, not specification. Keep each one short enough to read in 20 seconds.

- A heading that states the rule as a short clause a reader new to the domain can explain back: "Nobody waits unseen", "A Group is a wall", "Assigning changes one thing". When the clause needs domain knowledge, name the concrete things instead: "Only admins edit Team and Region", not "Fields that reports count stay with admins".
- A rule of at most three sentences: who, what, and the edge case that the rule settles. No field lists, value lists, length limits, required fields, or dialog copy. They belong in the functional specifications.
- **Example**: one or two sentences with the cast. "Quinn is in Cedar and Romeo. The Romeo Group Lead sees her with a Romeo chip only, and never learns that she is also in Cedar."
- **Why**: one or two sentences on the reason. Use the owner's words when they gave them: "Each tap must do only one thing, consistently. Volunteers and coordinators under time pressure must be able to predict what a tap does." Quote a source requirement when it exists, with its key.
- An intro line sets precedence: "When two principles conflict, the earlier one wins." Then order them so that holds.

## Detail sections

Short sections for pieces of UI a principle does not settle: chips, search, filter, a sheet. Each states its behavior rules as a short list and shows each rule with a cast member, for example: searching `research` finds Ralph, whose role is Researcher.

A detail section holds behavior, not inventory. A list of fields, the options in a dropdown (Dog, Cat, Bird), character limits, and required fields go in a functional specification, or nowhere when a design file shows them. A section that would hold only inventory is not a detail section.

When an owner decision changes an interaction, give that interaction its own section with its rules and one sketch. Example: "Ticking a team also ticks its Group. A Group stays ticked, and cannot be unticked, while any of its teams is ticked."

## Out of scope

A bulleted list of things a reader could reasonably expect here, each in a phrase, with the ticket or epic that owns it when one exists. Not a list of everything the brief does not mention.

## Functional specifications

Numbered statements that a test can cite: FS-1, FS-2, and so on.

- Each one states one behavior in one sentence, then an **Example** with the cast and an observable result.
  - "FS-2. Only Admins and Group Leads see the inbox. Example: the Romeo 1 Team Lead opens the Groups page and sees no inbox."
- Group them by topic, in the order of the principles: visibility, the action, its side effects, enforcement, offline, search and filter.
- Write enough that each principle and each case in the cast has at least one test, about two per principle. Delete a specification that has no principle or case behind it: it restates detail that the builder does not need.
- One layer, one job. Principles say why, sketches show what, functional specifications say what a test checks. Do not add user stories as well: they repeat the specifications and drift from them.

## Sources

Links only: the design file or prototype, the epic, the PRD, and any thread the brief quotes. Label an unavailable source as unavailable, never invent a URL. With no sources, leave the section out.

## A second worked example

A command-line tool, to show that the shape does not depend on screens. The prompt: "During an incident, deploys keep landing and make it worse. Let the incident commander freeze deploys to production."

- Cast: Iris the incident commander freezes deploys. Devon the developer tries to deploy during the freeze. Hana the hotfixer ships the fix that ends the incident. Each name starts with the letter of the person's part in the story: incident, deploy, hotfix.
- Principle "A freeze names its owner and its reason". Example: Devon runs `shipctl deploy payments` and reads that Iris froze deploys at 14:02 for incident INC-311. Why: a developer who cannot see the reason asks in the incident channel, and the commander loses time answering.
- Principle "Only a hotfix passes a freeze". Example: Hana deploys with `--hotfix`, and the deploy log records her name beside the freeze. Why: the fix must ship, and every exception must be traceable after the incident.
- Functional specification: "A deploy to production during a freeze fails, and its error names who froze deploys, when, and why. Example: Devon's deploy fails with 'Frozen by Iris, 14:02, INC-311'."
- Sketch: one terminal session. The sketch kit's second figure is this sketch.

## What the brief omits

- Pixel layout, colors, type, spacing, and motion. A design file owns them, or the builder decides them.
- Every edge case of every screen. The principles decide them.
- Implementation, schema, and API detail, unless a principle depends on it ("Every device and the gateway check the same rule").
- Open decisions. Resolve them with the owner before the final version. Write each answer into the principle, rule, or sketch it changes.
- Meta text: what the document covers, how to read it, who wrote it, its review status.
