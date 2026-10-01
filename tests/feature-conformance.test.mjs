import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { validateContract } = await import(path.join(repo, "skills", "delivery", "feature-conformance", "scripts", "validate-feature-contract.mjs"));

const digest = (character) => `sha256:${character.repeat(64)}`;
const baseRequirement = {
  id: "R3",
  owner: { ticket: "APP-103" },
  behavior: { backend: "Persist and restore the report draft.", frontend: "Restore values, recipients, attachments, and group rows." },
  design_basis: {
    sources: ["ticket"],
    design_document: { status: "not_supplied" },
    figma: { status: "not_supplied" },
  },
  lifecycle: { must_not: ["Silently drop persisted recipients or attachments."] },
  verification: ["authenticated Chrome and Android reopen-draft journey"],
  status: "in_progress",
  decision: { status: "decision_needed", summary: "Clarify whether group rows are editable offline." },
  source_change: { status: "baseline_created", changed_sources: [], impact: "none" },
  evidence: [],
};
const baseContract = {
  schema_version: 5,
  feature_id: "reports-r1-r8",
  contract_version: 1,
  release_status: "in_progress",
  authority: ["ticket_scope", "ticket_detail", "repository"],
  requirements: [baseRequirement],
};
const figmaBundle = {
  id: "report-draft",
  metadata_path: "/evidence/figma/report-draft/metadata.json",
  file_key: "figma-file",
  root_node_id: "10047:10900",
  selection_sha256: digest("d"),
  nodes: [{ node_id: "10047:10900", content_sha256: digest("e") }],
};
const documentManifest = { path: "/evidence/design-documents/manifest.json", content_sha256: digest("a") };
const documentMapping = {
  document_id: "report-draft-design",
  section_id: "draft-lifecycle",
  section_sha256: digest("b"),
  assertion: "Draft values, recipients, attachments, and group rows persist and restore.",
};

test("preflight remains executable when a rare product decision is pending", () => {
  const result = validateContract(baseContract, "preflight");
  assert.equal(result.valid, true);
  assert.equal(result.report.state, "execution_ready_with_decisions");
});

test("delivery accepts a requirement with evidence and an owning PR", () => {
  const result = validateContract({
    ...baseContract,
    release_status: "release_complete",
    requirements: [{
      ...baseRequirement,
      owner: { ticket: "APP-103", pr: "https://github.com/example/app/pull/103" },
      status: "delivered",
      decision: { status: "none" },
      evidence: [{ kind: "journey", location: "https://github.com/user-attachments/assets/103" }],
    }],
  }, "delivery");
  assert.equal(result.valid, true);
  assert.equal(result.report.state, "delivery_ready");
});

test("delivery holds an unproven requirement", () => {
  const result = validateContract({
    ...baseContract,
    release_status: "release_complete",
    requirements: [{ ...baseRequirement, owner: { ticket: "APP-103", pr: "https://github.com/example/app/pull/103" }, status: "delivered", decision: { status: "none" } }],
  }, "delivery");
  assert.equal(result.valid, false);
  assert.equal(result.report.state, "release_held");
});

test("approved deviations require an auditable approval reference", () => {
  const result = validateContract({
    ...baseContract,
    requirements: [{ ...baseRequirement, decision: { status: "approved_deviation", summary: "Ship alternate behavior." } }],
  }, "preflight");
  assert.equal(result.valid, false);
  assert.ok(result.report.issues.includes("R3: approved_deviation needs decision.approval.reference"));
});

test("agent decisions record rationale, authority, and reversibility", () => {
  const result = validateContract({
    ...baseContract,
    requirements: [{
      ...baseRequirement,
      decision: {
        status: "agent_decided",
        summary: "Use the existing retry boundary.",
        rationale: "It preserves the API contract.",
        authority_reference: "repository:lib/retry_policy.dart",
        reversible: true,
      },
    }],
  }, "preflight");
  assert.equal(result.valid, true);
  assert.equal(result.report.state, "execution_ready");
});

test("a design-document row references the single run-level manifest", () => {
  const result = validateContract({
    ...baseContract,
    authority: ["ticket_scope", "design_document", "ticket_detail", "repository"],
    design_document_manifest: documentManifest,
    requirements: [{
      ...baseRequirement,
      design_basis: {
        sources: ["ticket", "design_document"],
        design_document: { status: "referenced", sections: [documentMapping] },
        figma: { status: "not_supplied" },
      },
      source_resolution: { status: "design_document_resolves_ticket_ambiguity", summary: "The mapped lifecycle section resolves the ticket shorthand." },
    }],
  }, "preflight");
  assert.equal(result.valid, true);
});

test("embedded design-document manifests are rejected", () => {
  const result = validateContract({ ...baseContract, design_documents: [] }, "preflight");
  assert.equal(result.valid, false);
  assert.ok(result.report.issues.some((issue) => issue.includes("embed no design_documents")));
});

test("Figma resolves mapped ticket detail and overrides the design document", () => {
  const result = validateContract({
    ...baseContract,
    authority: ["ticket_scope", "figma", "design_document", "ticket_detail", "repository"],
    design_document_manifest: documentManifest,
    figma_bundles: [figmaBundle],
    requirements: [{
      ...baseRequirement,
      decision: { status: "none" },
      design_basis: {
        sources: ["ticket", "figma", "design_document"],
        design_document: { status: "referenced", sections: [documentMapping] },
        figma: { status: "mapped", bundle_id: "report-draft", node_ids: ["10047:10900"] },
      },
      source_resolution: {
        status: "figma_overrides_design_document",
        summary: "The mapped Figma reopen state supersedes the document's discard-on-close behavior.",
      },
    }],
  }, "preflight");
  assert.equal(result.valid, true);
  assert.equal(result.report.state, "execution_ready");
});

test("rows using Figma and a design document require source resolution", () => {
  const result = validateContract({
    ...baseContract,
    authority: ["ticket_scope", "figma", "design_document", "ticket_detail", "repository"],
    design_document_manifest: documentManifest,
    figma_bundles: [figmaBundle],
    requirements: [{
      ...baseRequirement,
      design_basis: {
        sources: ["ticket", "figma", "design_document"],
        design_document: { status: "referenced", sections: [documentMapping] },
        figma: { status: "mapped", bundle_id: "report-draft", node_ids: ["10047:10900"] },
      },
    }],
  }, "preflight");
  assert.equal(result.valid, false);
  assert.equal(result.report.state, "contract_invalid");
});

test("Figma node IDs must use canonical colon form", () => {
  const result = validateContract({
    ...baseContract,
    authority: ["ticket_scope", "figma", "ticket_detail", "repository"],
    figma_bundles: [{ ...figmaBundle, root_node_id: "10047-10900" }],
    requirements: [{
      ...baseRequirement,
      decision: { status: "none" },
      design_basis: {
        sources: ["ticket", "figma"],
        design_document: { status: "not_supplied" },
        figma: { status: "mapped", bundle_id: "report-draft", node_ids: ["10047:10900"] },
      },
      source_resolution: { status: "figma_resolves_ticket", summary: "Figma supplies the mapped interaction detail." },
    }],
  }, "preflight");
  assert.equal(result.valid, false);
  assert.ok(result.report.issues.some((issue) => issue.includes("canonical colon form")));
});

test("a confirmed mapped source update remains executable and is reported separately", () => {
  const result = validateContract({
    ...baseContract,
    requirements: [{
      ...baseRequirement,
      decision: { status: "none" },
      source_change: { status: "update_detected", changed_sources: ["figma"], impact: "within_ticket", summary: "Visual review confirmed the mapped empty state changed." },
    }],
  }, "preflight");
  assert.equal(result.valid, true);
  assert.equal(result.report.state, "execution_ready");
  assert.deepEqual(result.report.updates, ["R3: mapped source update detected"]);
});

test("delivery is held while a mapped source update is unreconciled", () => {
  const result = validateContract({
    ...baseContract,
    release_status: "release_complete",
    requirements: [{
      ...baseRequirement,
      owner: { ticket: "APP-103", pr: "https://github.com/example/app/pull/103" },
      status: "delivered",
      decision: { status: "none" },
      source_change: { status: "reconciliation_active", changed_sources: ["design_document"], impact: "within_ticket", summary: "The mapped lifecycle behavior changed." },
      evidence: [{ kind: "journey", location: "https://github.com/user-attachments/assets/103" }],
    }],
  }, "delivery");
  assert.equal(result.valid, false);
  assert.equal(result.report.state, "release_held");
});

test("outside_ticket_scope is not a contract lifecycle state", () => {
  const result = validateContract({
    ...baseContract,
    requirements: [{
      ...baseRequirement,
      source_change: { status: "outside_ticket_scope", changed_sources: ["figma"], impact: "unknown", summary: "Unmapped context changed." },
    }],
  }, "preflight");
  assert.equal(result.valid, false);
  assert.ok(result.report.issues.includes("R3: source_change.status is invalid"));
});

test("an unavailable supplied source is a hard preflight blocker", () => {
  const result = validateContract({
    ...baseContract,
    authority: ["ticket_scope", "figma", "ticket_detail", "repository"],
    requirements: [{
      ...baseRequirement,
      decision: { status: "none" },
      design_basis: {
        sources: ["ticket", "figma"],
        design_document: { status: "not_supplied" },
        figma: { status: "decision_needed" },
      },
      source_change: { status: "source_unavailable", changed_sources: ["figma"], impact: "unknown", summary: "The supplied Figma root cannot be read." },
    }],
  }, "preflight");
  assert.equal(result.valid, false);
  assert.equal(result.report.state, "contract_invalid");
  assert.ok(result.report.issues.includes("R3: supplied design source is unavailable"));
});

test("malformed collection shapes produce a rejection rather than an exception", () => {
  for (const contract of [null, { ...baseContract, requirements: {} }, { ...baseContract, authority: "ticket_scope" }, { ...baseContract, requirements: [{ ...baseRequirement, source_change: { changed_sources: {} } }] }]) {
    const result = validateContract(contract, "preflight");
    assert.equal(result.valid, false);
    assert.equal(result.report.state, "contract_invalid");
  }
});

test("mapped Figma rows cannot refer to nodes absent from the selected bundle", () => {
  const result = validateContract({
    ...baseContract,
    authority: ["ticket_scope", "figma", "ticket_detail", "repository"],
    figma_bundles: [figmaBundle],
    requirements: [{ ...baseRequirement, design_basis: {
      sources: ["ticket", "figma"], design_document: { status: "not_supplied" },
      figma: { status: "mapped", bundle_id: "report-draft", node_ids: ["12:99"] },
    } }],
  }, "preflight");
  assert.equal(result.valid, false);
  assert.ok(result.report.issues.some((issue) => issue.includes("unknown node")));
});
