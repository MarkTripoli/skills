## Purpose

Sync portable delivery workflows and the personal Slack coordinator across skills, docs, tooling, and tests so agent handoffs and coordinator behavior share the updated contracts.

## Special things to note

- Ambiguous Slack upload delivery remains fail-closed until Slack is disabled for that run.
- Main reports `npm test` passed (328 Node tests) and eight Python evidence tests passed. No live Slack external integration was tested.

## Change outline

```text
skills/delivery/                 portable delivery skills and evidence workflows
skills/slack-coordinator/         coordinator operating instructions
 tools/slack-coordinator/         daemon, CLI, persistence, and Slack API behavior
 docs/, README.md, workflows/     user-facing guidance and delivery workflow
 tests/, scripts/                 local contract coverage and validation wiring
```

The coordinator changes include owner requests, run lifecycle controls, content delivery, reactions, cadence, and completion/status notices; obsolete backlink handling is removed.

## Human Review

### Review targets

- Check that state-changing coordinator paths preserve fail-closed behavior and the per-run Slack disable mechanism.
- Review portable skill installation references and the updated coordinator guidance.

### Verify

- [ ] Confirm the GitHub diff contains the intended personal sync changes and no private task history.

### Known limits

- Live Slack external integration was not tested; ambiguous upload delivery remains fail-closed until per-run disable.
