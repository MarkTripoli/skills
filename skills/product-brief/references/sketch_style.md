# Fat-marker sketch style

## Contents

- Why low fidelity
- What to sketch
- Ink
- Red notes and arrows
- Heading and viewer tag
- Phone width
- Diagrams in the same style
- Checks before publishing

Start every sketch from the sketch kit linked by SKILL.md. It holds the fonts, color tokens, classes, wobble filter, arrowheads, and finished phone and terminal sketches.

## Why low fidelity

A fat-marker sketch shows what a screen must contain and nothing about how it looks. A thick pen cannot draw a pixel-perfect layout, so no reader copies spacing, color, or type from it. Say so in one sentence above the first sketch, for example "These sketches show what each screen must contain. Figma and the design system own the layout and styling." With no design file, end the sentence at "must contain".

## What to sketch

- A frame that matches the surface: a phone, a wide window, a terminal session, or a diagram for a capability with no user interface. The kit holds a phone and a terminal. For a wide window, use a canvas about 1000 wide with the window at x 20 to 700 and notes from x 744.
- Two or three hero screens: the screens where a principle becomes visible. One per viewer when visibility differs by role, for example "A coordinator reviews the inbox" (Admin) beside "A Group Lead sees their own Group".
- The one interaction a decision changed, for example the Assign sheet where ticking a team ticks its Group and locks it.
- Nothing else. A screen that only repeats a principle without a new fact is not a hero screen.
- Fill every sketch with the cast from the brief, never placeholder data. The counts must agree across sketches and text: if Quinn waits in two Groups, the Group counts total one more than the people count, and a note says why.

## Ink

One ink color (`--marker`, near black, near white in dark mode). The wobble filter `#marker` goes on a group that holds every shape and every red arrow. Text stays outside that group, so it stays crisp.

| Class | Use | Example |
|---|---|---|
| `stroke` (5 units) | Phone outline, cards, sections | the phone, the inbox card |
| `thin` (3 units) | Buttons, chips, checkboxes, rows | Assign buttons, Group chips |
| `solid` | The one header bar that names the screen's subject, with `inv` text | NEEDS ASSIGNMENT · 3 |
| `dash` | Something absent or empty | the "No group" chip |
| `faint` | A secondary element the reader may skip | the muted "On HQ Staff" chip |
| `t` | UI text in the hand font. Screen titles in capitals | GROUPS, Ralph, Assign |
| `soft` | Secondary UI text | a breakdown line, "no group" |

Rules:

- Phone canvas: `viewBox="0 0 700 H"`. The phone fills x 20 to 300. Notes start at x 344.
- Terminal canvas: `viewBox="0 0 780 H"`. The terminal fills x 20 to 400, with a `solid` title bar. Each line of output is one `t` text line, with commands after `$`. Notes start at x 440.
- Rounded corners on every rectangle (`rx` 5 to 30). Round line caps and joins.
- Draw only the elements the notes or the principles need. A row with no note and no rule behind it goes.
- Use the UI words from the design (button labels, section names), so a reader can find each element there. With no design, use the plain words a user would expect to see.

## Red notes and arrows

Red is the reviewer's pen. It marks the rule a reader must not miss.

- Three to five notes per sketch. Order them top to bottom, matching the element each one explains. Arrows never cross.
- Each note is one or two short sentences in the `rn` class: Caveat bold, 24 units, about 30 characters per line, 25 units between lines.
- Each note names a cast member and states one concrete fact plus its consequence. Pattern: viewer or person, a fact with a number or a name, then what follows.
  - "The Romeo Group Lead sees the 3 people who wait in Romeo. Noah, in no Group, is absent."
  - "Quinn is also in Cedar. This Group Lead sees her Romeo chip only."
  - "Quentin is on Cedar Support, a team in another Group. This Group Lead does not see it."
- A note is a complete sentence a reader understands alone. Gloss a name from elsewhere in the brief in place: "Cedar Support, a team in another Group".
- Arrow: a cubic Bezier `path` in the `red` class, from x 336 at the note's first line to the exact element, with `marker-end="url(#redhead)"`. Keep the curve gentle: control points along the line, no loops.
- No red on anything else in the sketch. Ink is the screen. Red is commentary.

Bad notes, and the fix:

| Bad | Why | Fix |
|---|---|---|
| "Role-scoped visibility" | A label, no fact | "The Romeo Group Lead sees the 3 people who wait in Romeo." |
| "No 'On Cedar Support' for Quentin." | Needs a definition from far up the page | "Quentin is on Cedar Support, a team in another Group. This Group Lead does not see it." |
| "See principle 3" | Sends the reader away | State the rule in place |

## Heading and viewer tag

- An `h3` above the frame states what happens on the screen, in a full clause: "A Group Lead sees their own Group", "Assign Noah to a team".
- Under it, a `viewer-tag` in marker style names who sees or does it: "Seen by an Admin", "Seen by the Romeo Group Lead", "Done by an Admin". The tag sits outside the phone. A "signed in as" line inside the phone is easy to miss and looks like UI.
- Give the SVG `role="img"` and an `aria-label` that lists what the sketch shows, with the cast names.

## Phone width

At 640 px and below, a sketch with class `crop` shows only its frame. Set the SVG width to the canvas width divided by the frame's right edge: 220% for the phone, 186% for the terminal (class `crop term`). The notes hide (`ann` class), a numbered red dot (`mnum`) appears at each arrow tip, and an `ol class="mnotes"` list below the sketch carries the full sentences. The list can say a little more than the note, because it has room. Keep the numbers and the order identical.

A wide diagram that cannot crop gets two SVGs: a wide one and a tall one, switched by the same media query. Never let the page scroll sideways. A sketch frame may scroll inside itself as a last resort, with a one-line hint such as "Scroll sideways to see every column."

## Diagrams in the same style

Lifecycle and structure diagrams use the same ink, wobble, and hand font, so the brief reads as one hand.

- Lifecycle: states as `stroke` boxes, transitions as ink arrows (`inkhead`) labeled with the user action ("Assign", "loses last team in that Group"). Tint the zone the feature owns, for example the states that make up the inbox.
- Cast lanes: one column per Group, one row per state, each person drawn as a `solid` pill with `inv` text where they stand. A person in two Groups appears in both columns.
- Red notes on a diagram follow the same rules as on a screen.

## Checks before publishing

1. Render the page at 1280 px and 400 px wide, in light and dark. Look at each sketch.
2. Every arrow tip touches its element. No note overlaps the phone or another note.
3. Every name, count, and chip in a sketch matches the cast and the text.
4. The page has no horizontal scroll at 400 px.
