Task: `approve-handoff-state-batch`

## Purpose

Make every delivery reply state the one next action, let a task fetch its outside sources once and convert an existing PRD or RFC instead of re-interviewing it, and prove both against a live model with evals that a wrong output fails.

## Special things to note

- Breaking reply contract: terminal replies no longer end with a fenced `/show-me` command; nonterminal replies must carry `Next action:` and `Open a new session, then run:` immediately before the fence. `scripts/validate.mjs` enforces it across all 54 answer templates; the major changeset records it.
- `create-prd` and `create-tdd` gain a mode with no interview: when `task.md` asks to convert an existing document the sources artifact holds, they write the whole artifact in one pass and leave what the source does not state as `### Verify` decisions. Nothing outside `task.md` triggers it.
- `npm run evals` spends model time (four scenarios, about 14 `omp -p` sessions, 20 minutes wall-clock) and is not part of `npm test`. Recordings under `evals/results/` are ignored by git; `--grade latest` re-grades them for free. Two adversarial reviews reshaped the checks; two skill defects they surfaced are fixed here (the outline template said `Step` where the skill says `Phase`; the by-hand commit rule is now decided by the engine sentence in the prompt, after one live run inferred "under the engine" from prompt shape).

## Change outline

Three batches share the branch.

```text
shared/CONVENTIONS.md                  reply shapes; {next_command} for sources replies; engine-sentence rule for by-hand commits
scripts/validate.mjs                   handoff and terminal shape; gather-sources answer inventory (41 skills)
skills/**/references/*answer.md        every handoff names the next action
skills/delivery/gather-sources/        new: SKILL.md, sources_template.md, sources_final_answer.md
skills/delivery/create-prd/SKILL.md    reads sources; "Converting an existing product document"
skills/delivery/create-tdd/SKILL.md    reads sources; "Converting an existing technical document"
skills/delivery/create-research*/      read the newest sources artifact; no web worker for what it answers
evals/                                 run.mjs, lib.mjs, acme-chain.mjs, scenarios/, fixtures/
docs/testing.md, workflows/delivery.md, README.md, AGENTS.md
```

The sources artifact is one more `NN-<type>-<slug>.md` the phases select by frontmatter; its handoff follows the task's workflow unless the request converts a document.

```diff
 gather-sources
   fetch each source once (read tool, MCP, curl, browser; user export when unreachable)
   NN-sources-<slug>.md: per source Location/Kind/Authority/Version/Fetched, Digest, verbatim Excerpts; Conflicts; Unreachable
+  next: /create-prd (product document) | /create-tdd (RFC, spec) when converting
+        else chain's first skill for workflow (full,lean,epic -> research-questions; prd,program,oneshot -> research; bugfix -> reproduce-bug)
 create-research-questions / create-research / create-prd / create-tdd
+  read the newest type: sources fully; cite its location and pointer instead of fetching
```

Conversion mode, both skills, one pass:

```text
map source sections onto the template, cite location + pointer beside each statement
section or item the source leaves open -> "Not stated in <source>." + closest fact
                                        -> one ### Known limits item + one ### Verify decision
create-tdd only: child workers fill Local Patterns from the repository; contradictions recorded, not resolved
reply with the normal final answer (-> /create-tdd, -> /create-plan)
```

The eval runner isolates every phase and grades what a consumer observes, never wording:

```text
evals/run.mjs
  build oh-my-pi tree -> results/<stamp>/.dist
  per scenario: temp git repo from fixtures/repo-cli + scenario fixtures, .omp/agents, task.md
    per phase: omp -p "Read and follow <skill> for <task dir>. Print the skill's final answer."
      common: one text fence after the handoff sentences naming next skill; artifact type+summary,
              next number; no template literal left (frontmatter included); artifact in its docs(task) commit;
              repo clean; nothing outside .agents changed; earlier artifacts and task.md byte-identical
      scenario: facts cited to a pointer on the same line; path:line pointers resolve to real lines that say
                what they are cited for; open items decided nowhere in the design body; no invented alternatives
  --grade <run>: replay recordings, no model
```

Read `shared/CONVENTIONS.md` first; it carries the reply contract, the sources placeholder rule, and the engine-sentence rule that every skill depends on.

## Human Review

### Review targets

- Terminal replies end with a real state and no fence; nonterminal replies expose one handoff directly before it (`scripts/validate.mjs`, `checkHandoff`).
- `gather-sources` routing table in its `## Output` section against `SOURCES_VARIANTS` in `scripts/validate.mjs` and the `{next_command}` bullet in `shared/CONVENTIONS.md`.
- The conversion sections of `create-prd` and `create-tdd`: what triggers them, what they forbid (questions, mockups, deciding open items), and how blanks reach `### Verify`.
- `evals/lib.mjs` `section`, `placeholders`, `pointers`, and the scenario negatives: whether the cheapest wrong output they name would in fact fail.

### Verify

- [ ] `npm test` passes: validator (41 skills, 54 answer templates), plugin sync, pack staleness, 61 unit tests.
- [ ] `node evals/run.mjs --grade latest` passes on a local recording, or `npm run evals convert-prd` passes live.
- [ ] One terminal and one nonterminal answer template read against `shared/CONVENTIONS.md`, "Handoff".

### Known limits

- Eval negatives for "decided vs. left open" are hedge-word heuristics at sentence granularity; whether child workers ran is not observable from `omp -p`, so Local Patterns are graded by facts only the code contains.
- The PRD and TDD interviews need a user and have no eval; only their conversion mode is covered.
