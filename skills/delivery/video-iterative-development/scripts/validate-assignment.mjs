#!/usr/bin/env node
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.trim().length > 0;
const commit = (value) => typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value);
const digest = (value) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);

// Checks an observed assignment snapshot, not live owner identity, Git or services.
export function validateAssignment(assignment, stage = "implementation") {
  const issues = [];
  const result = (state) => ({ valid: issues.length === 0, state, issues });
  if (!object(assignment)) return { valid: false, state: "decision_request", issues: ["assignment must be an object"] };
  if (!["implementation", "runtime"].includes(stage)) issues.push("stage must be implementation or runtime");
  for (const name of ["ticket", "owner_id", "branch", "intended_target", "write_surface"]) {
    if (!text(assignment[name])) issues.push(`${name} is required`);
  }
  if (!["backend_only", "frontend_only", "cross_layer"].includes(assignment.change_scope)) issues.push("change_scope must be assigned explicitly");
  if (!commit(assignment.source_commit)) issues.push("source_commit must be a full git SHA");
  if (!digest(assignment.source_fingerprint)) issues.push("source_fingerprint must bind the contract, source and adopted diff");
  if (typeof assignment.plan_review_required !== "boolean") issues.push("plan_review_required must be boolean");
  if (issues.length) return result("decision_request");
  if (/^on[- ]hold$/i.test(assignment.ticket_status?.trim() ?? "")) {
    issues.push("ticket is On Hold; preserve work without new authorization");
    return result("skipped_on_hold");
  }
  if (assignment.plan_review_required) {
    const plan = assignment.plan;
    if (!object(plan) || !Number.isInteger(plan.revision) || plan.revision < 1 || !text(plan.path) || !digest(plan.content_sha256)) {
      issues.push("a fingerprinted immutable plan revision is required");
      return result("planning");
    }
    const approval = plan.approval;
    if (!object(approval) || approval.decision !== "approved") {
      issues.push("current plan needs explicit owner approval");
      return result(approval?.decision === "rejected" ? "planning" : "awaiting_plan_approval");
    }
    if (approval.owner_id !== assignment.owner_id || !text(approval.reference)) issues.push("plan approval must identify the authorized owner and decision reference");
    const baseline = stage === "runtime" ? assignment.implementation_baseline : assignment;
    if (!object(baseline) || !commit(baseline.source_commit) || !digest(baseline.source_fingerprint) || (stage === "runtime" && !text(baseline.authorization_reference))) {
      issues.push("runtime proof needs the recorded implementation authorization baseline");
    }
    if (approval.revision !== plan.revision || approval.content_sha256 !== plan.content_sha256 || approval.source_fingerprint !== baseline?.source_fingerprint || approval.source_commit !== baseline?.source_commit) {
      issues.push("plan approval does not match the current revision and source fingerprints");
    }
    if (issues.length) return result("awaiting_plan_approval");
  }
  if (stage === "runtime") {
    const runtime = assignment.runtime;
    if (!object(runtime) || !["isolated_local", "shared_canonical"].includes(runtime.mode)) {
      issues.push("runtime.mode must select the observed repository setup");
      return result("decision_request");
    }
    if (runtime.mode === "shared_canonical" && runtime.lease_ticket !== assignment.ticket) {
      issues.push("shared runtime requires this ticket's exclusive lease");
      return result("waiting");
    }
    const readiness = runtime.readiness;
    if (!object(readiness) || readiness.source_commit !== assignment.source_commit || readiness.source_fingerprint !== assignment.source_fingerprint) issues.push("runtime readiness must match the assigned source identity");
    if (readiness?.supervised !== true) issues.push("runtime processes must remain supervised");
    if (!Array.isArray(readiness?.probes) || readiness.probes.length === 0 || readiness.probes.some((probe) => !object(probe) || !text(probe.name) || probe.result !== "passed")) issues.push("all assigned readiness probes must pass");
    if (runtime.expected_actor !== undefined && (!text(runtime.expected_actor) || readiness?.authenticated_actor !== runtime.expected_actor)) issues.push("authenticated actor must match the scenario contract");
    if (issues.length) return result("recovery_required");
  }
  return result("ready");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, stage = "implementation"] = process.argv.slice(2);
  if (!file) {
    console.error("usage: validate-assignment.mjs <assignment.json> [implementation|runtime]");
    process.exitCode = 2;
  } else {
    try {
      const result = validateAssignment(JSON.parse(fs.readFileSync(file, "utf8")), stage);
      console.log(JSON.stringify(result));
      if (!result.valid) process.exitCode = 1;
    } catch (error) {
      console.log(JSON.stringify({ valid: false, state: "decision_request", issues: [`cannot read assignment: ${error.message}`] }));
      process.exitCode = 1;
    }
  }
}
