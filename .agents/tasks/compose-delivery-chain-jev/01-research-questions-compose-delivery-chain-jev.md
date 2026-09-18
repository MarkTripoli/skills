---
type: research-questions
summary: "Query plan for documenting how judge.mjs's TypeSafe-backed commands, the delivery-start routing pack, an existing pack's gate/phase wiring, pack fixtures, the validator, the create-tdd/create-design-discussion templates, and the -omp generator work today. Covers both deliverables: the per-phase compose judgment plus delivery-adaptive pack, and the execution-plan artifact plus its embedding in TDD/design-discussion. No design or implementation decisions are made here."
status: complete
---

# Research Questions

## Research Goal

Document, as they exist today, judge.mjs's TypeSafe-model command conventions, the delivery-start pack's routing and gating logic, one existing pack's phase-node wiring and fixture format, the validator's template-section checks, the create-tdd and create-design-discussion templates, the build-packs -omp generator, and the pack-test harness's stub usage.

## Questions

1. In `skills/delivery/typed-judgment/judge.mjs`, how do existing commands that call the TypeSafe System One model (`route-workflow`, `autonomy`, `route-question`, `neutral`) structure their input parsing, the `systemOne` call, the `choice`/`score`/`noul` helper usage, confidence thresholds, and plain-vs-`--json` output shapes, and what happens when the helper is unavailable? (analyze)
2. In `.archon/workflows/delivery/start/delivery-start.yaml`, how do the `route` and `resolve` nodes and the per-pack `when:` branches work end to end, including the `confirm` gate, the fallback to `full` on low confidence, and the `done` join's `trigger_rule`? (analyze)
3. How is `INPUTS_GATES` parsed and mapped to per-phase gate booleans in an existing pack's `gates` bash node, and how does `delivery-full.yaml` sequence and wire its phase nodes (research, design, prd/tdd, plan, implement, verify, app-test, review, pr) via `depends_on`, `include`, and `when`? (analyze)
4. What is the full structure of an existing pack's fixture files under `fixtures/*.stubs.yaml` (node-id-to-stub-output pairs, the `fixture:` block's `expect`, `reached`, `inputs`, and `fail-node` fields, and `exec-code`), and how does `archon workflow test <pack>` consume them per `docs/testing.md`? (analyze)
5. What does `scripts/validate.mjs` currently check for each template type, including which templates, which required headings, and how occurrences are counted, beyond the human-review heading list? (analyze)
6. What are the current section order and frontmatter fields of `skills/delivery/create-tdd/references/tdd_template.md` and `skills/delivery/create-design-discussion/references/design_discussion_template.md`, and do their `artifact_template.html` files or `*_final_answer.md` replies reference specific sections by name? (locate)
7. How does `scripts/build-packs.mjs` discover which native packs to convert into `-omp` flavors, and what does its `--check` mode compare? (analyze)
8. What is the current text of the phase-name/type list in `shared/CONVENTIONS.md` near line 136, and of the pack list and phase descriptions in `workflows/delivery.md` and `docs/cheatsheet.md`? (locate)
9. In `tests/packs.test.mjs`, how do `runTaskNode` and `runGateCheck` extract and execute a node's bash body from pack YAML for testing against the TypeSafe stub and without it, and what existing test cases follow this pattern for a decide-style node? (analyze)

### Known limits

- The TypeSafe helper is unavailable in this environment (`judge: unavailable: TYPESAFE_API_KEY is not set`), so the drafted questions were not run through `judge.mjs neutral`/`route-question`. Neutrality was checked by rereading each question against the research-planning rules directly, and every worker-role tag above was chosen by the same reading rather than the helper.

## Key Context Pointers

- Filepaths / directories:
  - `skills/delivery/typed-judgment/judge.mjs`
  - `.archon/workflows/delivery/adaptive/` (target pack directory; does not exist yet)
  - `.archon/workflows/delivery/adaptive/fixtures/` (target fixtures directory; does not exist yet)
  - `.archon/workflows/delivery/full/`, `.archon/workflows/delivery/lean/`, `.archon/workflows/delivery/start/` (existing packs to read for canonical order and routing precedent)
  - `.archon/workflows/delivery-omp/` (generated `-omp` flavor tree)
  - `workflows/delivery.md`
  - `docs/cheatsheet.md`
  - `scripts/validate.mjs`
  - `scripts/build-packs.mjs`
  - `shared/CONVENTIONS.md`
  - `skills/delivery/create-tdd/references/tdd_template.md`
  - `skills/delivery/create-design-discussion/references/design_discussion_template.md`
  - `tests/` (`packs.test.mjs`, `judge.test.mjs`, `build-packs.test.mjs`, `tests/lib/typesafe-stub.mjs`)
- Commands / endpoints / schemas:
  - `node judge.mjs compose --json -` (target command named in the task's acceptance criteria)
  - `npm test`
  - `archon workflow test delivery-adaptive`

## Research Boundaries

- Focus on current repository behavior, existing tests, existing conventions, and current external documentation when needed.
- Do not answer what should be built.
- Do not propose a design or implementation.
