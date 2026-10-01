# Feature contract schema

`feature-contract.json` is a versioned internal artifact. It contains only requirements from selected tickets and references source manifests rather than copying their contents.

```json
{
  "schema_version": 5,
  "feature_id": "<epic>-<ticket-group>",
  "contract_version": 1,
  "release_status": "in_progress",
  "authority": ["ticket_scope", "figma", "design_document", "ticket_detail", "repository"],
  "design_document_manifest": {
    "path": "/absolute/run/design-documents/manifest.json",
    "content_sha256": "sha256:<manifest digest>"
  },
  "figma_bundles": [{
    "id": "home-screen",
    "metadata_path": "/absolute/run/figma/ABC-123/home/metadata.json",
    "file_key": "<figma file key>",
    "root_node_id": "12:34",
    "selection_sha256": "sha256:<canonical selection digest>",
    "nodes": [{
      "node_id": "12:51",
      "content_sha256": "sha256:<saved image digest>"
    }]
  }],
  "requirements": [{
    "id": "R1",
    "owner": {
      "ticket": "ABC-123",
      "branch": "feature/ABC-123-drafts",
      "worktree": "/absolute/adopted/worktree",
      "pr": "https://..."
    },
    "behavior": { "backend": "...", "frontend": "..." },
    "design_basis": {
      "sources": ["ticket", "figma", "design_document"],
      "design_document": {
        "status": "referenced",
        "sections": [{
          "document_id": "technical-design",
          "section_id": "draft-lifecycle",
          "section_sha256": "sha256:<section digest>",
          "assertion": "Drafts persist and restore after reopen."
        }]
      },
      "figma": {
        "status": "mapped",
        "bundle_id": "home-screen",
        "node_ids": ["12:51"]
      }
    },
    "source_resolution": {
      "status": "figma_overrides_design_document",
      "summary": "The mapped Figma reopen state supersedes the document's older discard behavior."
    },
    "source_change": {
      "status": "reconciliation_active",
      "changed_sources": ["figma"],
      "impact": "within_ticket",
      "summary": "Visual inspection confirmed a material mapped-state change."
    },
    "api": { "operation": "optional", "generated_client_source": "optional" },
    "lifecycle": { "states": ["optional"], "must_not": ["..."] },
    "verification": ["authenticated journey and visual state"],
    "status": "in_progress",
    "decision": {
      "status": "agent_decided",
      "summary": "Use the repository's existing retry boundary.",
      "rationale": "It preserves the current API contract and stays within the ticket.",
      "authority_reference": "repository:lib/retry_policy.dart",
      "reversible": true
    },
    "evidence": []
  }]
}
```

`authority` begins with `ticket_scope`. It then lists only applicable behavior sources in this order: `figma`, `design_document`, `ticket_detail`, and `repository`. The ticket is always the work boundary. Mapped Figma is the default visual and interaction authority, including over ambiguous or conflicting ticket details, and overrides a conflicting design document. Without applicable Figma, a design document resolves ambiguous ticket detail; a direct conflict with explicit acceptance criteria may require `decision_needed`.

`design_document_manifest` references the single run-level manifest and fingerprints that file. A `referenced` row maps exact document and section IDs from that manifest, repeats only the mapped section hash needed to freeze the contract version, and states the contributed behavior. The independent reviewer checks the mapping against the referenced manifest.

`figma_bundles` references each extraction's `metadata.json`. Node IDs use canonical colon form, such as `10047:10900`. A `mapped` row names one bundle and node IDs in that bundle.

`source_resolution.status` is one of `aligned`, `figma_resolves_ticket`, `figma_overrides_design_document`, `design_document_resolves_ticket_ambiguity`, or `decision_needed`. Every non-`aligned` resolution includes a summary. Automatic Figma and design-document resolutions do not require approval.

`source_change.status` is `baseline_created`, `unchanged`, `update_detected`, `reconciliation_active`, `reconciled`, or `source_unavailable`. Only confirmed material changes to mapped sources use the update/reconciliation states. A changed whole-document hash or PNG byte hash alone does not. `source_unavailable` uses `impact: "unknown"` and blocks the affected ticket; other changed states use `within_ticket`. Unmapped source content has no row and no source-change state.

`decision.status` is `none`, `agent_decided`, `decision_needed`, `proposed_deviation`, `approved_deviation`, or `rejected_deviation`. `agent_decided` records a summary, rationale, authority reference, and reversibility. `approved_deviation` additionally requires `approval.reference`. A delivered row cannot contain an unresolved decision or unapproved deviation.

Requirement `status` is `in_progress`, `delivered`, `deferred`, or `not_in_release`. Deferred states require a disposition and describe only an explicit selected-ticket requirement; design content never creates such a row. A delivered row requires its owning PR and evidence.

Validate with:

```text
node <skill-dir>/scripts/validate-feature-contract.mjs <contract> --mode preflight
node <skill-dir>/scripts/validate-feature-contract.mjs <contract> --mode delivery
```

Preflight returns `execution_ready`, `execution_ready_with_decisions`, or `contract_invalid`. Delivery returns `delivery_ready` or `release_held`.

`decision_needed` in `source_resolution`, `design_basis.design_document`, or `design_basis.figma` produces a preflight warning and still permits dispatch. In delivery mode, any of those unresolved authoritative source choices on a `delivered` row produces an issue and `release_held`, even with `decision.status: "none"`, an owning PR, and evidence. Resolving the source choice restores eligibility for `delivery_ready`; optional sources remain optional.

Contract JSON snapshots and referenced manifests are immutable. Their task-index receipts carry exact SHA-256 values; a receipt revision never changes an earlier snapshot or index record. Validate the selected receipt and referenced bytes before running the JSON validator. The JSON validator checks the supplied snapshot, not live Jira, Figma, Git, or hosted evidence.
