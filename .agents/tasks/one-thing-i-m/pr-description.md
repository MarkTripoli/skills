Task: `one-thing-i-m`

## Purpose

Route delivery phases through one portable JEV model selector so Claude Code, Codex, Oh My Pi, Pi, Herdr, and Atomic default to economical models and escalate only when the phase requires it.

## Special things to note

- Candidate profiles are caller-owned: explicit input wins over `SKILLS_MODEL_CANDIDATES_FILE`, which wins over `.agents/model-candidates.json`.
- Standalone skills fall back to the economy model when JEV is unavailable; Atomic remains fail-closed through `requireJev`.
- The implementation does not copy either referenced router, proxy harness traffic, scrape private catalogs, or retry native provider failures.

## Change outline

One helper now owns candidate validation, JEV classification, and cost-aware selection. The model-invoked `/configure-model-routing` skill creates project or user-level profiles one question at a time and verifies them through that helper.

```diff
 delivery phase
+  load exact candidate profile
+  keep economy for mutation and unknown phases
+  ask JEV for eligible non-writing phases
+  combine adequacy probabilities with caller-supplied cost
+  return one exact model identifier
```

Harnesses consume that shared result at their available enforcement boundary.

```text
skills/delivery/configure-model-routing/  one-question profile setup and verification
skills/delivery/route-model/   portable policy and JSON/Node interface
atomic/lib/models.mjs          Atomic input adapter with required JEV
skills/delivery/deliver/       first manual-handoff recommendation
skills/delivery/herd-next/     enforced Herdr launch and Stop-hook routing
runtimes/                      harness-specific discovery boundaries
tests/                         policy, install, Atomic, profile, and handoff coverage
```

Runtime flow:

```text
candidate profile
  -> route-model
     -> economy policy                  implementation / unknown / fixed
     -> JEV + expected-loss selection  eligible non-writing phase
  -> Atomic stage model
  -> Herdr native --model launch
  -> manual recommendation when enforcement is unavailable
```

Review `skills/delivery/route-model/route-model.mjs` first; every harness and the Atomic adapter now share that policy owner.

## Human Review

### Review targets

- Candidate order defines capability from weakest to strongest, while `cost` remains independent and caller-supplied.
- Selective `route-model` installs work without `typed-judgment`; Atomic explicitly requires JEV and fails closed.
- Herdr and its optional Stop hook pass selected models after the native command separator and clean up failed launches.

### Verify

- [ ] `npm test` exits 0 with 166 passing tests.
- [ ] `bash -n skills/delivery/herd-next/references/stop_hook.sh && git diff --check origin/main...HEAD` exits 0.
- [ ] `npm run check-commits -- origin/main..HEAD` accepts every commit subject.
- [ ] Compare [the revised plan](.agents/tasks/one-thing-i-m/05-plan-one-thing-i-m.md), [verification](.agents/tasks/one-thing-i-m/08-verification-one-thing-i-m.md), and [clean review](.agents/tasks/one-thing-i-m/13-code-review-one-thing-i-m.md).

### Known limits

- Provider/account availability and model costs are not independently verified; callers must provide an accurate candidate profile.
- Catalog discovery is limited to available public `pi --list-models` and `omp models --json`; explicit input remains the fallback.
- Claude Code and Codex require explicit profiles because this repository does not inspect their private model catalogs.
