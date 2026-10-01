import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { validateDisposition } = await import(path.join(repo, "skills", "delivery", "video-iterative-orchestration", "scripts", "validate-delivery-disposition.mjs"));

const completeAuthPreflight = {
  documented_flow_inspected: true,
  fixture_or_credential_source_inspected: true,
  runtime_injection_attempted: true,
  local_backend_checked: true,
  renewal_request_attempted: true,
  failure_classified_from_redacted_evidence: true,
};

test("delivery disposition validates blockers only", () => {
  for (const proposed_state of ["accepted_unmerged_backend_dependency", "accepted_unrelated_ci_failure"]) {
    const result = validateDisposition({ ticket: "APP-9298", proposed_state, evidence: {} });
    assert.equal(result.valid, false);
    assert.ok(result.issues.includes("proposed_state must be blocked"));
  }
});

test("rejects pipeline and release waits as blockers", () => {
  for (const reason_code of ["waiting_for_backend_merge", "waiting_for_client_publication", "frontend_unmerged_backend_dependency_red", "unrelated_ci_infrastructure_failure"]) {
    const result = validateDisposition({
      ticket: "APP-9196",
      proposed_state: "blocked",
      reason_code,
      evidence: {
        exact_condition: "The hosted client lacks the unmerged API.",
        recovery_attempts: ["Inspected the backend PR.", "Inspected the failed frontend job."],
        smallest_owner_action: "Merge the backend.",
      },
    });
    assert.equal(result.valid, false, reason_code);
  }
});

test("rejects local setup, IDE launchers, and assigned branch submission as blockers", () => {
  for (const reason_code of ["runtime_values_unset", "short_lived_code_missing", "local_feature_backend_setup", "ide_launcher_unavailable", "assigned_branch_submission_authority"]) {
    const result = validateDisposition({
      ticket: "APP-9196",
      proposed_state: "blocked",
      reason_code,
      evidence: {
        exact_condition: "The current terminal has no injected Dart defines.",
        recovery_attempts: ["Inspected the shell.", "Inspected the device."],
        smallest_owner_action: "Provide authorization.",
      },
    });
    assert.equal(result.valid, false, reason_code);
  }
});

test("identifies a missing IDE launcher as recovery work", () => {
  const result = validateDisposition({
    ticket: "APP-9298",
    proposed_state: "blocked",
    reason_code: "ide_launcher_unavailable",
    evidence: {
      exact_condition: "The host does not expose the VS Code code executable.",
      recovery_attempts: ["Read the repository launch compound.", "Resolved its eleven configured processes."],
      smallest_owner_action: "Install VS Code.",
    },
  });

  assert.deepEqual(result, {
    valid: false,
    issues: ["ide_launcher_unavailable is not a blocker"],
  });
});

test("requires the documented local-auth diagnosis before accepting an auth blocker", () => {
  const incomplete = validateDisposition({
    ticket: "APP-9196",
    proposed_state: "blocked",
    reason_code: "renewal_facility_unavailable",
    evidence: {
      exact_condition: "Renewal endpoint remains unavailable.",
      recovery_attempts: ["Tried the documented endpoint.", "Retried against the effective local base URL."],
      smallest_owner_action: "Restore the local renewal fixture.",
      auth_preflight: { ...completeAuthPreflight, runtime_injection_attempted: false },
    },
  });
  assert.equal(incomplete.valid, false);

  const complete = validateDisposition({
    ticket: "APP-9196",
    proposed_state: "blocked",
    reason_code: "renewal_facility_unavailable",
    evidence: {
      exact_condition: "The documented renewal endpoint is absent from the local backend after fixture setup.",
      recovery_attempts: ["Started the documented seeded fixture.", "Verified the effective local route and server logs."],
      smallest_owner_action: "Restore the documented local renewal endpoint.",
      auth_preflight: completeAuthPreflight,
    },
  });
  assert.equal(complete.valid, true);
});
