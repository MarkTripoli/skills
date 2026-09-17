---
name: deliver
description: Run for /deliver requests, or when a person has a request and does not know which delivery pack or skill starts it. Route the request to a pack and an autonomy level, then print the `archon workflow run` command or, without Archon, open the task directory and hand off to the chain's first skill.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Deliver

One command for a request whose pack is not yet chosen. You read the request, pick the pack and how many human gates it keeps, and hand the work to the engine that runs it: Archon when it is installed, the skills by hand otherwise. This skill implements nothing and writes no artifact; at most it opens the task directory.

## Steps

1. **Take the request** from the user's message, verbatim; strip a leading `/deliver`. When nothing remains, ask for the request in one sentence and stop until it arrives. The first line of the request is the task title.

2. **Route.** Run the typed-judgment helper twice with the request on stdin, where `<skills dir>` is the directory that contains this skill (in a checkout, `skills/delivery`):

   - `node <skills dir>/typed-judgment/judge.mjs route-workflow --json -` prints `{workflow, suggested, confidence, probabilities}`. `workflow` is already `full` when `confidence` is below 0.8; `suggested` is the raw pick.
   - `node <skills dir>/typed-judgment/judge.mjs autonomy --json -` prints `{autonomy, suggested, confidence}`; `autonomy` is one of `none`, `pr`, `plan`, `all`, already thresholded.

   Program rule: the helper never answers `program`. When `workflow` is `prd` and the request contains `prd` or `requirements` and also `epic`, `children`, `issues`, or `pull requests`, the pack is `program`. A request that names a pack outright (`program`, `bugfix`, ...) takes that pack at confidence 1.

   Autonomy to `gates`: `none` gives `none`, `pr` gives `pr`, `all` gives `all`, and `plan` gives the pack's planning gates: full `design,plan`; prd and program `prd,tdd,plan`; lean `outline`; bugfix `reproduce`; epic `plan`; oneshot `pr` (it has no plan gate).

   Helper unavailable (no `node`, exit 3, or any nonzero exit): pick the pack yourself from the table below, take autonomy `all` unless the request plainly asks for an unattended run or a single review point, record no confidence, and say once in the reply that judgments were skipped.

   | Pack | Use when |
   |---|---|
   | `oneshot` | Small change, stated expected behavior, a way to verify it, no design choice. |
   | `bugfix` | Observed behavior differs from expected and a reproduction is possible. |
   | `lean` | The shape is clear but several files and an ordering are involved. |
   | `full` | Competing approaches, cross-module impact, a migration, an interface others depend on, or a design review is asked for. |
   | `prd` | The requirement itself is open: what it should do, for whom, edge behavior; product-facing; stakeholders beyond the requester. |
   | `epic` | Several independently mergeable deliverables, work for more than one person, or more than about eight plan phases. |
   | `program` | A PRD that then splits into epic children with their own issues and pull requests. |

3. **Confirm when the pick is soft.** When `confidence` is below 0.8, or the two highest `probabilities` are within 0.2 of each other, or your own reading finds two packs that fit, ask the user one question: the top two packs with one clause each on why, and the autonomy level you will use. Continue with the answer; a named pack takes confidence 1. Otherwise ask nothing.

4. **With Archon** (`command -v archon` succeeds, `git rev-parse --is-inside-work-tree` succeeds, and `git remote get-url origin` prints a remote): compute the branch name and print the command; do not run it.

   - Branch: the request's first line, lower-cased, every character outside `a-z0-9` and space replaced by a space, split into words, the stop words `a an the to of for in on and or with that this add make create please fix bug` dropped, the first four words joined with `-`. When no word survives, take the first four words without dropping any; `task` when the line is empty. `epic` and `program` prefix the result with `epic-`, because `start-epic-delivery` refuses to run on `main`, `master`, or a detached `HEAD`. This is the rule the `delivery-task` node applies, so the branch and the task slug match.
   - Command: `archon workflow run delivery-<pack> --branch <branch> --input gates=<gates> '<request>'`, the request in shell single quotes with every `'` written as `'\''`. Add `--input app_test=<web|ios|android>` when the request asks for the running application to be tested on one of those surfaces, and `--input app_target=<url, bundle id, or package>` when it names one; `epic` and `program` take neither. Omit `--input gates=` only when `gates` is `all`, the default.
   - Pauses: from the pack's gate list (full `design`, `plan`, `phases`, `pr`; lean `outline`, `phases`, `pr`; prd `prd`, `tdd`, `plan`, `phases`, `pr`; oneshot `pr`; bugfix `reproduce`, `pr`; epic `plan`; program `prd`, `tdd`, `plan`) keep the names `gates` leaves on; `none` leaves none.
   - Reply with `references/deliver_archon_answer.md`, every `<...>` slot filled. The fence is terminal: the run creates the task directory and drives every phase.

5. **Without Archon**: open the task directory and hand off to the chain's first skill.

   - Create `.agents/tasks/<slug>/task.md` per the conventions (slug from the branch rule above, `-2`, `-3` suffix when the directory exists; no `epic-` prefix on a slug), with frontmatter `slug`, `title`, `workflow: <pack>`, `gates: <gates>`, `routed_by: deliver`, `route_confidence: <confidence>` (omit the line when the helper did not run), `created`, and the request as the body. `git add .agents/tasks/<slug>/task.md` and commit as `docs(task): open <slug>`, applying the conventions' `.gitignore` rule. Outside a git work tree, write the file and say it is uncommitted.
   - `{next_command}` is the chain's first skill: bugfix `/reproduce-bug`; oneshot `/review-code`; lean, full, and epic `/create-research-questions`; prd and program `/create-research`. For `oneshot` the reply first says the change is small enough to implement in this session: on the user's go, implement, verify, and commit it per the `ci-commit` conventions, then the review runs from the fence.
   - Reply with `references/deliver_hand_answer.md`, every `<...>` slot filled: the pack, its confidence, the autonomy level and gates, the task directory, and the chain as the table in `workflows/delivery.md` lists it. The gates that stay on are the replies the user reviews before pasting the next command; later phases are the skills the chain names.

## Rules

- Never start a pack's phases by hand when Archon is present; the printed command is the whole deliverable. Never run the command for the user.
- Route on the request alone: the helper receives the request text and nothing else. Do not read the repository to decide the pack.
- One question at most (step 3), and only when the pick is soft. A named pack or gate list in the request is final.
- `epic` stays `epic` and `prd` stays `prd`; `program` needs both a PRD word and a children word in the request, or the name itself.
- No emojis, no em dashes; the reply carries no tooling narration beyond the routing line.

## References

Read from this skill directory: `references/deliver_archon_answer.md`, `references/deliver_hand_answer.md`.
