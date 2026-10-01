#!/usr/bin/env node
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const sha = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const evidenceKinds = new Set(["android_video", "chrome_video", "ios_video", "api_contract"]);
const hostedUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
};
const allowedApproval = new Set(["not_required", "managed_approval_granted"]);
const nonBlank = (value) => typeof value === "string" && value.trim().length > 0;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function validateSubmissionClosure(receipt) {
  const issues = [];
  const issue = (message) => issues.push(message);

  if (!object(receipt)) return { valid: false, issues: ["receipt must be a JSON object"] };
  if (!nonBlank(receipt.ticket)) issue("ticket is required");
  if (!nonBlank(receipt.local_commit) || !sha.test(receipt.local_commit)) issue("local_commit must be a git commit SHA");

  if (!object(receipt.remote)) issue("remote is required");
  if (!nonBlank(receipt.remote?.branch)) issue("remote.branch is required");
  if (!nonBlank(receipt.remote?.commit) || !sha.test(receipt.remote?.commit ?? "")) issue("remote.commit must be a git commit SHA");
  if (receipt.remote?.verified !== true) issue("remote.verified must be true");
  if (nonBlank(receipt.local_commit) && nonBlank(receipt.remote?.commit) && receipt.local_commit !== receipt.remote.commit) {
    issue("remote.commit must equal local_commit");
  }

  if (!object(receipt.pull_request)) issue("pull_request is required");
  if (!/^https:\/\/[^/]+\/[^/]+\/[^/]+\/pull\/[1-9]\d*$/.test(receipt.pull_request?.url ?? "")) issue("pull_request.url must be a GitHub pull request URL");
  if (!nonBlank(receipt.pull_request?.source_branch)) issue("pull_request.source_branch is required");
  if (!nonBlank(receipt.pull_request?.target_branch)) issue("pull_request.target_branch is required");
  if (receipt.pull_request?.head_commit !== receipt.local_commit) issue("pull_request.head_commit must equal local_commit");
  if (!nonBlank(receipt.intended_target)) issue("intended_target is required");
  if (receipt.pull_request?.target_branch !== receipt.intended_target) issue("pull_request.target_branch must equal intended_target");
  if (receipt.pull_request?.verified !== true) issue("pull_request.verified must be true");
  if (nonBlank(receipt.remote?.branch) && nonBlank(receipt.pull_request?.source_branch) && receipt.remote.branch !== receipt.pull_request.source_branch) {
    issue("pull_request.source_branch must equal remote.branch");
  }

  if (!Array.isArray(receipt.required_evidence) || receipt.required_evidence.length === 0 || receipt.required_evidence.some((kind) => !evidenceKinds.has(kind))) issue("required_evidence must list assigned evidence kinds");
  if (!object(receipt.evidence)) issue("evidence is required");
  if (receipt.evidence?.pr_description_verified !== true) issue("evidence.pr_description_verified must be true");
  if (!Array.isArray(receipt.evidence?.items) || receipt.evidence.items.length === 0) {
    issue("evidence.items must contain at least one item");
  } else {
    for (const [index, item] of receipt.evidence.items.entries()) {
      if (!object(item)) {
        issue(`evidence.items[${index}] must be an object`);
        continue;
      }
      if (["android_video", "chrome_video", "ios_video"].includes(item.kind)) {
        if (!hostedUrl(item.location)) issue(`evidence.items[${index}] video must use a durable HTTPS hosted URL without credentials or signed query parameters`);
        if (item.playability_verified !== true) issue(`evidence.items[${index}].playability_verified must be true`);
        if (!/^sha256:[a-f0-9]{64}$/.test(item.content_sha256 ?? "")) issue(`evidence.items[${index}].content_sha256 must bind the downloaded capture`);
        if (item.authenticated_download_verified !== true) issue(`evidence.items[${index}].authenticated_download_verified must be true`);
        if (!Number.isInteger(item.expected_bytes) || item.expected_bytes <= 0) issue(`evidence.items[${index}].expected_bytes must be a positive integer`);
      } else if (item.kind === "api_contract") {
        if (!hostedUrl(item.location) && !nonBlank(item.summary)) issue(`evidence.items[${index}] API contract needs a durable location or summary`);
      } else {
        issue(`evidence.items[${index}].kind must be android_video, chrome_video, ios_video, or api_contract`);
      }
    }
  }

  for (const kind of Array.isArray(receipt.required_evidence) ? receipt.required_evidence : []) {
    if (!Array.isArray(receipt.evidence?.items) || !receipt.evidence.items.some((item) => item?.kind === kind)) issue(`missing assigned evidence: ${kind}`);
  }

  if (!object(receipt.slack) || typeof receipt.slack.requested !== "boolean") {
    issue("slack.requested must be boolean");
  } else if (receipt.slack.requested) {
    if (!nonBlank(receipt.slack.run_id)) issue("requested Slack coordination needs slack.run_id");
    if (!/^https:\/\//.test(receipt.slack.thread_permalink ?? "")) issue("requested Slack coordination needs slack.thread_permalink");
    if (receipt.slack.submission_event_acknowledged !== true) issue("requested Slack coordination needs slack.submission_event_acknowledged=true");
  }

  const requiredActions = ["push", "pull_request", "evidence"];
  if (receipt.slack?.requested === true) requiredActions.push("slack");
  if (!object(receipt.actions)) issue("actions is required");
  for (const name of requiredActions) {
    const action = receipt.actions?.[name];
    if (!object(action)) {
      issue(`actions.${name} is required`);
      continue;
    }
    if (action.status !== "succeeded") issue(`actions.${name}.status must be succeeded`);
    if (!allowedApproval.has(action.approval)) issue(`actions.${name}.approval must be not_required or managed_approval_granted`);
    if (!nonBlank(action.verification)) issue(`actions.${name}.verification is required`);
  }

  return { valid: issues.length === 0, issues };
}

function runCli() {
  const [file] = process.argv.slice(2);
  if (!file) {
    console.error("usage: validate-submission-closure.mjs <receipt.json>");
    process.exitCode = 2;
    return;
  }
  try {
    const result = validateSubmissionClosure(JSON.parse(fs.readFileSync(file, "utf8")));
    console.log(JSON.stringify(result));
    if (!result.valid) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ valid: false, issues: [`cannot read receipt: ${error.message}`] }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli();
