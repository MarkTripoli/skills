#!/usr/bin/env node
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const blockerReasons = new Set([
  "authoritative_source_unreadable",
  "required_access_unavailable",
  "long_lived_credential_unavailable",
  "renewal_facility_unavailable",
  "external_service_unavailable",
  "destructive_or_out_of_authority",
  "material_product_decision",
  "resume_source_missing",
  "resume_needs_lineage",
  "unrecoverable_repository_state",
]);
const forbiddenBlockerReasons = new Set([
  "waiting_for_backend_merge",
  "waiting_for_client_publication",
  "frontend_unmerged_backend_dependency_red",
  "unrelated_ci_infrastructure_failure",
  "runtime_values_unset",
  "short_lived_code_missing",
  "local_feature_backend_setup",
  "ide_launcher_unavailable",
  "assigned_branch_submission_authority",
  "merge_conflict",
  "missing_evidence",
]);
const authChecks = [
  "documented_flow_inspected",
  "fixture_or_credential_source_inspected",
  "runtime_injection_attempted",
  "local_backend_checked",
  "renewal_request_attempted",
  "failure_classified_from_redacted_evidence",
];

const nonBlank = (value) => typeof value === "string" && value.trim().length > 0;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function validateDisposition(disposition) {
  const issues = [];
  const issue = (message) => issues.push(message);

  if (!object(disposition)) return { valid: false, issues: ["disposition must be a JSON object"] };
  if (!nonBlank(disposition.ticket)) issue("ticket is required");
  if (disposition.proposed_state !== "blocked") issue("proposed_state must be blocked");

  const evidence = disposition.evidence;
  if (!object(evidence)) issue("evidence is required");

  if (disposition.proposed_state === "blocked") {
    const reason = disposition.reason_code;
    if (forbiddenBlockerReasons.has(reason)) issue(`${reason} is not a blocker`);
    else if (!blockerReasons.has(reason)) issue("reason_code is not an allowed blocker reason");

    if (!nonBlank(evidence?.exact_condition)) issue("blocked needs evidence.exact_condition");
    if (!Array.isArray(evidence?.recovery_attempts) || evidence.recovery_attempts.length < 2 || evidence.recovery_attempts.some((attempt) => !nonBlank(attempt))) {
      issue("blocked needs at least two materially different evidence.recovery_attempts");
    }
    if (!nonBlank(evidence?.smallest_owner_action)) issue("blocked needs evidence.smallest_owner_action");

    if (["long_lived_credential_unavailable", "renewal_facility_unavailable"].includes(reason)) {
      for (const check of authChecks) if (evidence?.auth_preflight?.[check] !== true) issue(`${reason} needs evidence.auth_preflight.${check}=true`);
    }
  }

  return { valid: issues.length === 0, issues };
}

function runCli() {
  const [file] = process.argv.slice(2);
  if (!file) {
    console.error("usage: validate-delivery-disposition.mjs <disposition.json>");
    process.exitCode = 2;
    return;
  }
  try {
    const result = validateDisposition(JSON.parse(fs.readFileSync(file, "utf8")));
    console.log(JSON.stringify(result));
    if (!result.valid) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ valid: false, issues: [`cannot read disposition: ${error.message}`] }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli();
