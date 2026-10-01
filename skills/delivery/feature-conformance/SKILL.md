---
name: feature-conformance
description: Derive and validate a ticket-scoped feature contract that links mapped design sources, decisions, implementation, and evidence.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Feature Conformance

Use this companion from `video-iterative-orchestration` to derive a versioned internal contract from its existing ticket, repository, optional design-document, and optional Figma inputs. It validates delivery claims; it does not own source ingestion, worktrees, implementation, Jira transitions, Figma export, or pipelines.

## Inputs and artifacts

Accept only context already collected by the orchestrator: selected ticket requirements, adopted or new branch/worktree/PR identities, current repository observations, the rebuildable prior source index, the single run-level design-document manifest, Figma bundle metadata, decisions, assigned owners, and evidence. Do not request new user inputs.

Derive the feature ID from the epic and selected ticket group. Write each contract snapshot with exclusive creation at `.agent-evidence/orchestration/<run-id>/features/<feature-id>/contracts/<NNNN>.json`; never overwrite a prior snapshot. Increment `contract_version` when its meaning changes, and use a new snapshot for any durable evidence or disposition change. Reference `.agent-evidence/orchestration/<run-id>/design-documents/manifest.json` when supplied; never create or embed a second design-document manifest. Do not commit run artifacts or visual bundles.

## Record immutable task receipts

Resolve the explicit task directory or configured task root through the collection conventions. For an indexed task, register a `feature-contract` receipt in `design.contract` and a `feature-conformance` result in `review.conformance`, using fresh immutable iterations. The receipt names the exact JSON snapshot path and SHA-256, feature ID/version, selected ticket IDs, source revision/head, validator mode, and result; the conformance receipt binds the reviewed contract receipt and final diff. Select only the digest-validated current record in `index.json`, and verify the referenced JSON digest before validation or dispatch. An invalid index or changed snapshot fails closed; never fall back to a directory scan. The adjacent optional `references/task-artifacts.mjs` helper may allocate, record, and select receipts; without it use the conventions' manual index contract. Legacy numbered receipts are allowed only when the index is genuinely absent.

Source manifests and Figma bundles stay outside task receipts. Keep one immutable snapshot of the run-level manifest per revision, reference its exact path/hash, and preserve prior snapshots for source comparison. Hosted publication remains separate and follows repository proof gates.

## Build ticket-scoped rows

Create rows only for requirements explicitly present in selected tickets. Figma frames and design documents can contain broader product behavior; unmapped content creates no row, gap, deferral, or completeness claim.

Each row records its ticket owner, write surface, intended backend/frontend behavior, API boundary, lifecycle and `must_not` rules, required evidence, source mappings, source-change state, decision, and final PR. Use the [feature-contract schema](references/feature-contract-schema.md).

Apply these authority rules within the ticket boundary:

1. Mapped Figma is the default authority for visual and interaction behavior, including ambiguous or conflicting ticket details.
2. Mapped Figma overrides a conflicting design document automatically.
3. Without applicable Figma, a mapped design document resolves ambiguous ticket details.
4. A direct design-document conflict with explicit acceptance criteria is `decision_needed` only when repository evidence cannot resolve it and the alternatives materially change product behavior.
5. Repository and API conventions resolve remaining implementation details.

Record automatic source resolutions in `source_resolution` and the run decision log. A small implementation choice may be `agent_decided` when its rationale, authority basis, reversibility, and evidence are recorded. Only an explicitly authorized departure from the authoritative sources is an `approved_deviation` with an approval reference.

Map Figma rows to exact canonical node IDs from validated bundles. Map design-document rows to exact document and section IDs, section hashes, and assertions from the single run-level manifest. Missing optional sources are `not_supplied` or `not_applicable`.

## Reconcile changed sources

Compare only sources mapped to a selected row. A whole-document hash change alone does not affect a ticket. A changed Figma PNG or selection hash is a review signal, not proof of a design change; inspect mapped node identity, dimensions, hierarchy, and visible output. Use `update_detected` only for a confirmed material mapped change, then `reconciliation_active` while updating the adopted branch and `reconciled` after replacement evidence passes.

An explicitly supplied authority source that remains unreadable is `source_unavailable` and makes preflight invalid for the affected ticket. Do not substitute a stale snapshot or guessed behavior. Unmapped Figma/design content receives no source-change classification.

## Validate without idling agents

Run the validator in preflight mode. `execution_ready` and `execution_ready_with_decisions` permit dispatch. Agent-generated contract errors enter an automatic repair-and-rerun loop; they are not ticket blockers. A rare `decision_needed` pauses only the affected behavior while unrelated ticket work continues.

Before `locally_verified`, the orchestrator invokes the unchanged read-only `agent-implementation-reviewer` through the feature-contract review adapter named by `video-iterative-orchestration`. The adapter supplies a row-scoped review plan, final diff, and evidence while preserving the reviewer's standard plan-to-diff contract. This skill does not add feature-contract behavior to the shared reviewer.

The orchestrator records one adapted reviewer outcome per row:

- `implemented + evidence`
- `approved deviation`
- `deferred` or `not in release`
- `not implemented`

Update the contract from the reviewer result and run delivery validation. `delivery_ready` supports the orchestrator's submission lifecycle. `release_held` withholds only the affected delivery claim and returns repairable gaps to recovery.

## Guardrails

- Never infer requirements from unmapped design content or assume the epic contains every design-defined ticket.
- Never create a second design-document manifest.
- Never turn an ordinary ambiguity, missing evidence, or generated contract error into an idle agent.
- Never let an agent silently deviate from an authoritative source.
- Never discard an adopted `In Progress` or `Code Review` branch.
