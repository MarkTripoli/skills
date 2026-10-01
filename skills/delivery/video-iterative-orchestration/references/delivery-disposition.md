# Delivery disposition gate

Run this gate only when the orchestrator proposes `blocked` from a worker's `recovery_exhausted` evidence. Workers do not assign this state. A pending, missing, or failed PR pipeline is never a delivery blocker.

Write a temporary JSON file outside the repository or under the ignored orchestration evidence directory, then run:

```text
node <video-iterative-orchestration-skill-dir>/scripts/validate-delivery-disposition.mjs <disposition.json>
```

A proposed blocker uses one `reason_code`: `authoritative_source_unreadable`, `required_access_unavailable`, `long_lived_credential_unavailable`, `renewal_facility_unavailable`, `external_service_unavailable`, `destructive_or_out_of_authority`, `material_product_decision`, `resume_source_missing`, `resume_needs_lineage`, or `unrecoverable_repository_state`. Its evidence names the exact condition, at least two materially different recovery attempts, and the smallest owner action.

An authentication blocker using `long_lived_credential_unavailable` or `renewal_facility_unavailable` also records this completed preflight without secret values:

```json
{
  "auth_preflight": {
    "documented_flow_inspected": true,
    "fixture_or_credential_source_inspected": true,
    "runtime_injection_attempted": true,
    "local_backend_checked": true,
    "renewal_request_attempted": true,
    "failure_classified_from_redacted_evidence": true
  }
}
```

Do not use `waiting_for_backend_merge`, `waiting_for_client_publication`, `frontend_unmerged_backend_dependency_red`, `unrelated_ci_infrastructure_failure`, `runtime_values_unset`, `short_lived_code_missing`, `local_feature_backend_setup`, `ide_launcher_unavailable`, `assigned_branch_submission_authority`, `merge_conflict`, or `missing_evidence` as blocker reasons. The validator rejects them. `local_feature_backend_setup` includes reusing or restarting the selected feature backend and applying repository-documented migrations or required fixtures to its local test data; it never authorizes mutation of an unrelated stale or shared service. `ide_launcher_unavailable` includes VS Code, `code`, editor task runners, and compound-launch UI: the worker reads their configuration as process data and launches the complete topology directly. The pipeline reasons are forbidden because pipeline status no longer gates delivery.

After validation, exclusively create a versioned JSON snapshot and record a `delivery-disposition` receipt in `delivery.disposition` under the resolved task directory. Bind the snapshot path/SHA-256, ticket, observed source head, and validation result. Every revision creates the next immutable iteration. Validate the index and referenced snapshot digest on resume; the operational cache never overrides this receipt.
