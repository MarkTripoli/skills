import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { validateSubmissionClosure } = await import(path.join(repo, "skills", "delivery", "video-iterative-orchestration", "scripts", "validate-submission-closure.mjs"));

const commit = "0123456789abcdef0123456789abcdef01234567";
const complete = () => ({
  ticket: "APP-9195",
  local_commit: commit,
  intended_target: "main",
  required_evidence: ["android_video"],
  remote: { branch: "feature/app-9195", commit, verified: true },
  pull_request: {
    url: "https://github.com/example/project/pull/123",
    head_commit: commit,
    source_branch: "feature/app-9195",
    target_branch: "main",
    verified: true,
  },
  evidence: {
    pr_description_verified: true,
    items: [{
      kind: "android_video",
      location: "https://github.com/user-attachments/assets/01234567-89ab-cdef-0123-456789abcdef",
      playability_verified: true,
      content_sha256: `sha256:${"a".repeat(64)}`,
      authenticated_download_verified: true,
      expected_bytes: 12345,
    }],
  },
  slack: {
    requested: true,
    run_id: "01RUN",
    thread_permalink: "https://workspace.slack.com/archives/C123/p123",
    submission_event_acknowledged: true,
  },
  actions: {
    push: { status: "succeeded", approval: "managed_approval_granted", verification: "remote SHA matched" },
    pull_request: { status: "succeeded", approval: "not_required", verification: "PR API matched" },
    evidence: { status: "succeeded", approval: "not_required", verification: "upload downloaded" },
    slack: { status: "succeeded", approval: "not_required", verification: "event acknowledged" },
  },
});

test("accepts independently verified submission closure", () => {
  assert.deepEqual(validateSubmissionClosure(complete()), { valid: true, issues: [] });
});

test("rejects local-only delivery and pending conversational approval", () => {
  const receipt = complete();
  receipt.remote.commit = "abcdef0123456789abcdef0123456789abcdef01";
  receipt.remote.verified = false;
  receipt.actions.push = {
    status: "pending_owner_confirmation",
    approval: "conversational_confirmation_requested",
    verification: "Asked the owner to say go ahead",
  };

  const result = validateSubmissionClosure(receipt);
  assert.equal(result.valid, false);
  assert.ok(result.issues.includes("remote.commit must equal local_commit"));
  assert.ok(result.issues.includes("actions.push.status must be succeeded"));
  assert.ok(result.issues.includes("actions.push.approval must be not_required or managed_approval_granted"));
});

test("rejects missing PR proof, durable video, or requested Slack receipt", () => {
  const receipt = complete();
  receipt.pull_request.verified = false;
  receipt.evidence.items[0].location = "/tmp/proof.mp4";
  receipt.evidence.items[0].authenticated_download_verified = false;
  receipt.slack.submission_event_acknowledged = false;
  delete receipt.actions.slack;

  const result = validateSubmissionClosure(receipt);
  assert.equal(result.valid, false);
  assert.ok(result.issues.includes("pull_request.verified must be true"));
  assert.ok(result.issues.includes("evidence.items[0] video must use a durable HTTPS hosted URL without credentials or signed query parameters"));
  assert.ok(result.issues.includes("requested Slack coordination needs slack.submission_event_acknowledged=true"));
  assert.ok(result.issues.includes("actions.slack is required"));
});

test("accepts API contract evidence with Slack disabled", () => {
  const receipt = complete();
  receipt.required_evidence = ["api_contract"];
  receipt.evidence.items = [{ kind: "api_contract", summary: "Authenticated valid and invalid responses are summarized in the PR." }];
  receipt.slack = { requested: false };
  delete receipt.actions.slack;

  assert.equal(validateSubmissionClosure(receipt).valid, true);
});

test("rejects moved PR heads and an unintended target", () => {
  const receipt = complete();
  receipt.pull_request.head_commit = "f".repeat(40);
  receipt.pull_request.target_branch = "another-branch";
  const result = validateSubmissionClosure(receipt);
  assert.equal(result.valid, false);
  assert.ok(result.issues.includes("pull_request.head_commit must equal local_commit"));
  assert.ok(result.issues.includes("pull_request.target_branch must equal intended_target"));
});

test("requires every assigned evidence surface and rejects expired signed links", () => {
  const receipt = complete();
  receipt.required_evidence = ["android_video", "chrome_video"];
  receipt.evidence.items[0].location += "?expires=123";
  receipt.evidence.items[0].playability_verified = false;
  const result = validateSubmissionClosure(receipt);
  assert.equal(result.valid, false);
  assert.ok(result.issues.includes("missing assigned evidence: chrome_video"));
  assert.ok(result.issues.some((issue) => issue.includes("durable HTTPS")));
  assert.ok(result.issues.some((issue) => issue.includes("playability_verified")));
});
