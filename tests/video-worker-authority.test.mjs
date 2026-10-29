import assert from "node:assert/strict";
import test from "node:test";
import { validateAssignment } from "../skills/delivery/video-iterative-development/scripts/validate-assignment.mjs";

const head = "a".repeat(40);
const fingerprint = `sha256:${"b".repeat(64)}`;
const assignment = () => ({
  ticket: "PROJ-123", owner_id: "authorized-owner", ticket_status: "In Progress",
  branch: "feature/proj-123", intended_target: "main", write_surface: "/assigned/worktree",
  change_scope: "frontend_only", source_commit: head, source_fingerprint: fingerprint,
  plan_review_required: false,
});
const planned = () => ({
  ...assignment(), plan_review_required: true,
  plan: { revision: 1, path: "/excluded/plans/PROJ-123/1.md", content_sha256: `sha256:${"c".repeat(64)}` },
});
const approved = () => {
  const value = planned();
  value.plan.approval = { decision: "approved", owner_id: value.owner_id, reference: "owner-question-1", revision: value.plan.revision, content_sha256: value.plan.content_sha256, source_commit: head, source_fingerprint: fingerprint };
  return value;
};
const runtime = () => ({
  ...approved(),
  implementation_baseline: { source_commit: head, source_fingerprint: fingerprint, authorization_reference: "orchestrator-authorized-plan-1" },
  runtime: { mode: "isolated_local", expected_actor: "fixture-account-1", readiness: {
    source_commit: head, source_fingerprint: fingerprint, supervised: true,
    authenticated_actor: "fixture-account-1", probes: [{ name: "frontend-facing feature probe", result: "passed" }],
  } },
});

test("ungated source implementation requires an explicit bounded assignment", () => {
  assert.deepEqual(validateAssignment(assignment()), { valid: true, state: "ready", issues: [] });
  for (const name of ["owner_id", "change_scope", "source_commit", "write_surface", "intended_target"]) {
    const value = assignment();
    delete value[name];
    assert.equal(validateAssignment(value).state, "decision_request", name);
  }
});

test("Bug plan gates never mistake arrival, silence or rejection for implementation authority", () => {
  const value = planned();
  assert.equal(validateAssignment(value).state, "awaiting_plan_approval");
  value.plan.approval = { decision: "rejected" };
  assert.equal(validateAssignment(value).state, "planning");
  assert.equal(validateAssignment(approved()).valid, true);
  for (const change of [
    (v) => { v.plan.revision++; },
    (v) => { v.plan.content_sha256 = `sha256:${"d".repeat(64)}`; },
    (v) => { v.source_commit = "e".repeat(40); },
    (v) => { v.source_fingerprint = `sha256:${"f".repeat(64)}`; },
    (v) => { v.plan.approval.owner_id = "worker"; },
    (v) => { delete v.plan.approval.reference; },
  ]) {
    const changed = approved(); change(changed);
    assert.equal(validateAssignment(changed).state, "awaiting_plan_approval");
  }
});

test("On Hold preserves adopted work without treating it as blocked or delivered", () => {
  for (const status of ["On Hold", "On-Hold", " on hold "]) {
    const value = approved(); value.ticket_status = status;
    assert.equal(validateAssignment(value).state, "skipped_on_hold");
    assert.equal(validateAssignment(value).valid, false);
  }
});

test("isolated repository-native runtime needs no Coast service or shared lease", () => {
  assert.deepEqual(validateAssignment(runtime(), "runtime"), { valid: true, state: "ready", issues: [] });
});

test("shared runtime contention waits without authorizing another instance", () => {
  const value = runtime(); value.runtime.mode = "shared_canonical";
  assert.equal(validateAssignment(value, "runtime").state, "waiting");
  value.runtime.lease_ticket = value.ticket;
  assert.equal(validateAssignment(value, "runtime").valid, true);
});

test("readiness rejects stale source, dead supervision, failed probes and the wrong actor", () => {
  for (const change of [
    (v) => { v.runtime.readiness.source_commit = "f".repeat(40); },
    (v) => { v.runtime.readiness.supervised = false; },
    (v) => { v.runtime.readiness.probes[0].result = "failed"; },
    (v) => { v.runtime.readiness.authenticated_actor = "another-account"; },
  ]) {
    const value = runtime(); change(value);
    const result = validateAssignment(value, "runtime");
    assert.equal(result.valid, false);
    assert.equal(result.state, "recovery_required");
  }
});

test("authorized implementation can advance its head without retroactive plan reapproval", () => {
  const value = runtime();
  value.source_commit = "d".repeat(40);
  value.source_fingerprint = `sha256:${"e".repeat(64)}`;
  value.runtime.readiness.source_commit = value.source_commit;
  value.runtime.readiness.source_fingerprint = value.source_fingerprint;
  assert.equal(validateAssignment(value, "runtime").valid, true);
  // A new implementation/correction cycle still checks approval at its new baseline.
  assert.equal(validateAssignment(value, "implementation").state, "awaiting_plan_approval");
  delete value.implementation_baseline.authorization_reference;
  assert.equal(validateAssignment(value, "runtime").valid, false);
});
