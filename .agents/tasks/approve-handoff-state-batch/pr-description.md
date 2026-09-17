Task: `approve-handoff-state-batch`

## Purpose

Make every delivery reply state whether work has started and show only the next action a user can take.

## Special things to note

- This is a breaking reply-contract change: terminal replies no longer end with a fenced `/show-me` command.
- Nonterminal replies now require `Next action:` and `Open a new session, then run:` immediately before the command fence.
- The included major changeset records the public contract change.

## Change outline

The shared contract, validator, answer templates, and author documentation change together.

```text
shared/CONVENTIONS.md                 defines terminal and nonterminal reply shapes
scripts/validate.mjs                 enforces the exact final handoff or terminal state
skills/**/references/*answer.md      states current status and the real next action
docs/ and workflows/delivery.md      document the new authoring contract
```

Terminal replies stop presenting a valid skill command when no skill should run.

```diff
- No phase follows this reply:
- /show-me
+ Resolve the recorded blocker, then run /review-code again.
```

Handoffs now make the action and session change explicit.

```diff
- Start the next phase in a new session; continuing in this session carries this phase's context into the next one.
+ Next action:
+ Open a new session, then run:
  /<next-skill> @<artifact>
```

Review `shared/CONVENTIONS.md` and `scripts/validate.mjs` first. They define the behavior applied across all 53 answer templates.

## Human Review

### Review targets

- Confirm terminal replies end with a real state or prerequisite action and contain no command fence.
- Confirm nonterminal replies expose one exact handoff immediately before the final command.
- Inspect the routing and implementation-phase replies for accurate not-started states.

### Verify

- [ ] Run `npm test` and confirm all 61 tests pass with no validator or generated-file failures.
- [ ] Inspect one terminal reply and one nonterminal reply against `shared/CONVENTIONS.md`.

### Known limits

- None.
