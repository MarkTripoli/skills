#!/usr/bin/env node
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const modes = new Set(["preflight", "delivery"]);
const requirementStatuses = new Set(["in_progress", "delivered", "deferred", "not_in_release"]);
const decisionStatuses = new Set(["none", "agent_decided", "decision_needed", "proposed_deviation", "approved_deviation", "rejected_deviation"]);
const releaseStatuses = new Set(["in_progress", "release_complete", "design_complete"]);
const designDocumentStatuses = new Set(["not_supplied", "not_applicable", "referenced", "decision_needed"]);
const figmaStatuses = new Set(["not_supplied", "not_applicable", "mapped", "decision_needed"]);
const sourceResolutionStatuses = new Set(["aligned", "figma_resolves_ticket", "figma_overrides_design_document", "design_document_resolves_ticket_ambiguity", "decision_needed"]);
const sourceChangeStatuses = new Set(["baseline_created", "unchanged", "update_detected", "reconciliation_active", "reconciled", "source_unavailable"]);
const sourceChangeImpacts = new Set(["none", "within_ticket", "unknown"]);
const authorityValues = ["ticket_scope", "figma", "design_document", "ticket_detail", "repository"];
const sha256 = (value) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const canonicalNodeId = (value) => typeof value === "string" && /^\d+:\d+$/.test(value);

export function validateContract(contract, mode) {
  const issues = [];
  const warnings = [];
  const updates = [];
  const nonBlank = (value) => typeof value === "string" && value.trim().length > 0;
  const array = (value) => Array.isArray(value);
  const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const issue = (message) => issues.push(message);

  // Reject malformed collection shapes before walking row mappings.
  const collection = (value, label) => {
    if (value !== undefined && !array(value)) issue(`${label} must be an array`);
  };
  if (!object(contract)) issue("contract must be a JSON object");
  collection(contract?.authority, "authority");
  collection(contract?.requirements, "requirements");
  collection(contract?.figma_bundles, "figma_bundles");
  for (const bundle of array(contract?.figma_bundles) ? contract.figma_bundles : []) {
    if (!object(bundle)) issue("each Figma bundle must be an object");
    collection(bundle?.nodes, "Figma bundle nodes");
  }
  for (const row of array(contract?.requirements) ? contract.requirements : []) {
    if (!object(row)) issue("each requirement must be an object");
    collection(row?.design_basis?.sources, "design_basis.sources");
    collection(row?.design_basis?.design_document?.sections, "design-document sections");
    collection(row?.design_basis?.figma?.node_ids, "Figma node_ids");
    collection(row?.lifecycle?.must_not, "lifecycle.must_not");
    collection(row?.verification, "verification");
    collection(row?.evidence, "evidence");
    collection(row?.source_change?.changed_sources, "source_change.changed_sources");
  }
  if (issues.length) return {
    valid: false,
    report: { state: mode === "delivery" ? "release_held" : "contract_invalid", mode, feature_id: contract?.feature_id, contract_version: contract?.contract_version, issues, warnings, updates },
  };

  if (!modes.has(mode)) issue("mode must be preflight or delivery");
  if (!object(contract)) issue("contract must be a JSON object");
  if (contract?.schema_version !== 5) issue("schema_version must be 5");
  if (!nonBlank(contract?.feature_id)) issue("feature_id is required");
  if (!Number.isInteger(contract?.contract_version) || contract.contract_version < 1) issue("contract_version must be a positive integer");
  if (!releaseStatuses.has(contract?.release_status)) issue("release_status is invalid");
  if (!array(contract?.authority) || contract.authority[0] !== "ticket_scope") {
    issue("authority must start with ticket_scope");
  } else {
    const unknown = contract.authority.filter((value) => !authorityValues.includes(value));
    if (unknown.length) issue(`authority contains unknown values: ${unknown.join(", ")}`);
    const positions = contract.authority.map((value) => authorityValues.indexOf(value));
    if (positions.some((position, index) => index > 0 && position <= positions[index - 1])) {
      issue("authority order must be ticket_scope, figma, design_document, ticket_detail, repository");
    }
  }
  if (!array(contract?.requirements) || contract.requirements.length === 0) issue("requirements must be a non-empty array");

  const figmaUnavailable = contract?.requirements?.some((requirement) => requirement?.source_change?.status === "source_unavailable" && requirement.source_change.changed_sources?.includes("figma"));
  const documentUnavailable = contract?.requirements?.some((requirement) => requirement?.source_change?.status === "source_unavailable" && requirement.source_change.changed_sources?.includes("design_document"));

  if (contract?.design_documents !== undefined) issue("embed no design_documents; reference the single design_document_manifest");
  if (contract?.authority?.includes("design_document")) {
    if (!documentUnavailable && (!object(contract?.design_document_manifest) || !nonBlank(contract.design_document_manifest.path) || !sha256(contract.design_document_manifest.content_sha256))) {
      issue("design_document authority requires a fingerprinted design_document_manifest reference");
    }
  } else if (contract?.design_document_manifest !== undefined) {
    issue("design_document_manifest requires design_document authority");
  }

  const figmaBundles = new Map();
  if (contract?.authority?.includes("figma")) {
    if (!figmaUnavailable && (!array(contract?.figma_bundles) || contract.figma_bundles.length === 0)) issue("figma authority requires figma_bundles");
    for (const bundle of contract?.figma_bundles ?? []) {
      const label = nonBlank(bundle?.id) ? bundle.id : "<unknown Figma bundle>";
      if (!nonBlank(bundle?.id)) issue("each Figma bundle needs an id");
      else if (figmaBundles.has(bundle.id)) issue(`duplicate Figma bundle id ${bundle.id}`);
      if (!nonBlank(bundle?.metadata_path)) issue(`${label}: metadata_path is required`);
      if (!nonBlank(bundle?.file_key)) issue(`${label}: file_key is required`);
      if (!canonicalNodeId(bundle?.root_node_id)) issue(`${label}: root_node_id must use canonical colon form`);
      if (!sha256(bundle?.selection_sha256)) issue(`${label}: selection_sha256 must be a SHA-256 fingerprint`);
      if (!array(bundle?.nodes) || bundle.nodes.length === 0) issue(`${label}: nodes must be a non-empty array`);

      const nodes = new Map();
      for (const node of bundle?.nodes ?? []) {
        const nodeLabel = nonBlank(node?.node_id) ? node.node_id : "<unknown node>";
        if (!canonicalNodeId(node?.node_id)) issue(`${label}/${nodeLabel}: node_id must use canonical colon form`);
        else if (nodes.has(node.node_id)) issue(`${label}: duplicate node ID ${node.node_id}`);
        if (!sha256(node?.content_sha256)) issue(`${label}/${nodeLabel}: content_sha256 must be a SHA-256 fingerprint`);
        if (canonicalNodeId(node?.node_id)) nodes.set(node.node_id, node);
      }
      if (nonBlank(bundle?.id)) figmaBundles.set(bundle.id, { bundle, nodes });
    }
  } else if (array(contract?.figma_bundles) && contract.figma_bundles.length > 0) {
    issue("figma_bundles require figma authority");
  }

  const requirementIds = new Set();
  for (const requirement of contract?.requirements ?? []) {
    const label = nonBlank(requirement?.id) ? requirement.id : "<unknown requirement>";
    if (!nonBlank(requirement?.id)) issue("each requirement needs an id");
    else if (requirementIds.has(requirement.id)) issue(`duplicate requirement id ${requirement.id}`);
    else requirementIds.add(requirement.id);

    if (!object(requirement?.owner) || !nonBlank(requirement.owner.ticket)) issue(`${label}: owner.ticket is required`);
    if (!object(requirement?.behavior) || (!nonBlank(requirement.behavior.backend) && !nonBlank(requirement.behavior.frontend))) {
      issue(`${label}: behavior must describe backend or frontend behavior`);
    }

    const designBasis = requirement?.design_basis;
    if (!object(designBasis) || !array(designBasis.sources) || !designBasis.sources.includes("ticket")) {
      issue(`${label}: design_basis.sources must include ticket`);
    } else {
      const sources = new Set(designBasis.sources);
      for (const source of sources) {
        if (!["ticket", "figma", "design_document"].includes(source)) issue(`${label}: unknown design source ${source}`);
        if (source !== "ticket" && !contract?.authority?.includes(source)) issue(`${label}: design source ${source} is absent from contract authority`);
      }

      const document = designBasis.design_document;
      const figma = designBasis.figma;
      if (!object(document) || !designDocumentStatuses.has(document.status)) issue(`${label}: design_basis.design_document.status is invalid`);
      if (!object(figma) || !figmaStatuses.has(figma.status)) issue(`${label}: design_basis.figma.status is invalid`);

      if (sources.has("design_document") && !["referenced", "decision_needed"].includes(document?.status)) {
        issue(`${label}: design-document-backed rows need referenced or decision_needed status`);
      }
      if (document?.status === "referenced") {
        if (!array(document.sections) || document.sections.length === 0) issue(`${label}: referenced design documents need section mappings`);
        for (const mapping of document.sections ?? []) {
          if (!object(mapping) || !nonBlank(mapping.document_id) || !nonBlank(mapping.section_id) || !sha256(mapping.section_sha256) || !nonBlank(mapping.assertion)) {
            issue(`${label}: each design-document mapping needs document_id, section_id, section_sha256, and assertion`);
          }
        }
      }
      if (!sources.has("design_document") && !["not_supplied", "not_applicable"].includes(document?.status)) {
        issue(`${label}: rows without a design document cannot claim design-document context`);
      }

      if (sources.has("figma") && !["mapped", "decision_needed"].includes(figma?.status)) issue(`${label}: Figma-backed rows need mapped or decision_needed status`);
      if (figma?.status === "mapped") {
        if (!nonBlank(figma.bundle_id) || !array(figma.node_ids) || figma.node_ids.length === 0) {
          issue(`${label}: mapped Figma rows need bundle_id and node_ids`);
        } else {
          const bundle = figmaBundles.get(figma.bundle_id);
          if (!bundle) issue(`${label}: Figma mapping references unknown bundle ${figma.bundle_id}`);
          else for (const nodeId of figma.node_ids) {
            if (!canonicalNodeId(nodeId)) issue(`${label}: mapped Figma node ${nodeId} must use canonical colon form`);
            else if (!bundle.nodes.has(nodeId)) issue(`${label}: Figma mapping references unknown node ${figma.bundle_id}/${nodeId}`);
          }
        }
      }
      if (!sources.has("figma") && !["not_supplied", "not_applicable"].includes(figma?.status)) issue(`${label}: rows without Figma cannot claim Figma context`);

      const resolution = requirement?.source_resolution;
      if (resolution !== undefined) {
        if (!object(resolution) || !sourceResolutionStatuses.has(resolution.status)) issue(`${label}: source_resolution.status is invalid`);
        else {
          if (resolution.status !== "aligned" && !nonBlank(resolution.summary)) issue(`${label}: non-aligned source resolution needs a summary`);
          if (["figma_resolves_ticket", "figma_overrides_design_document"].includes(resolution.status) && figma?.status !== "mapped") {
            issue(`${label}: ${resolution.status} needs mapped Figma`);
          }
          if (resolution.status === "figma_overrides_design_document" && document?.status !== "referenced") {
            issue(`${label}: a Figma document override needs a referenced design document`);
          }
          if (resolution.status === "design_document_resolves_ticket_ambiguity" && document?.status !== "referenced") {
            issue(`${label}: design-document resolution needs a referenced design document`);
          }
          if (resolution.status === "decision_needed") warnings.push(`${label}: source decision needed`);
        }
      } else if (sources.has("figma") && sources.has("design_document")) {
        issue(`${label}: rows using Figma and a design document need source_resolution`);
      }
      if (document?.status === "decision_needed") warnings.push(`${label}: design-document decision needed`);
      if (figma?.status === "decision_needed") warnings.push(`${label}: Figma decision needed`);
    }

    if (!object(requirement?.lifecycle) || !array(requirement.lifecycle.must_not)) issue(`${label}: lifecycle.must_not must be an array`);
    if (!array(requirement?.verification) || requirement.verification.length === 0 || requirement.verification.some((value) => !nonBlank(value))) issue(`${label}: at least one verification is required`);
    if (!requirementStatuses.has(requirement?.status)) issue(`${label}: status is invalid`);
    if (!object(requirement?.decision) || !decisionStatuses.has(requirement.decision.status)) issue(`${label}: decision.status is invalid`);
    if (!array(requirement?.evidence)) issue(`${label}: evidence must be an array`);

    const sourceChange = requirement?.source_change;
    if (!object(sourceChange) || !sourceChangeStatuses.has(sourceChange.status)) {
      issue(`${label}: source_change.status is invalid`);
    } else {
      if (!array(sourceChange.changed_sources) || sourceChange.changed_sources.some((source) => !["figma", "design_document"].includes(source))) {
        issue(`${label}: source_change.changed_sources must contain only figma or design_document`);
      }
      if (!sourceChangeImpacts.has(sourceChange.impact)) issue(`${label}: source_change.impact is invalid`);
      if (["baseline_created", "unchanged"].includes(sourceChange.status)) {
        if ((sourceChange.changed_sources?.length ?? 0) !== 0 || sourceChange.impact !== "none") issue(`${label}: ${sourceChange.status} cannot record changed sources or impact`);
      } else {
        if ((sourceChange.changed_sources?.length ?? 0) === 0) issue(`${label}: ${sourceChange.status} needs changed_sources`);
        if (!nonBlank(sourceChange.summary)) issue(`${label}: ${sourceChange.status} needs a summary`);
      }
      if (["update_detected", "reconciliation_active", "reconciled"].includes(sourceChange.status) && sourceChange.impact !== "within_ticket") {
        issue(`${label}: ${sourceChange.status} needs within_ticket impact`);
      }
      if (sourceChange.status === "source_unavailable") {
        if (sourceChange.impact !== "unknown") issue(`${label}: source_unavailable needs unknown impact`);
        issue(`${label}: supplied design source is unavailable`);
      }
      if (["update_detected", "reconciliation_active", "source_unavailable"].includes(sourceChange.status)) {
        updates.push(`${label}: mapped source ${sourceChange.status.replaceAll("_", " ")}`);
      }
    }

    const decision = requirement?.decision;
    if (decision?.status === "agent_decided") {
      if (!nonBlank(decision.summary) || !nonBlank(decision.rationale) || !nonBlank(decision.authority_reference) || typeof decision.reversible !== "boolean") {
        issue(`${label}: agent_decided needs summary, rationale, authority_reference, and reversible`);
      }
    }
    if (["decision_needed", "proposed_deviation"].includes(decision?.status)) warnings.push(`${label}: ${decision.status.replaceAll("_", " ")}`);
    if (["decision_needed", "proposed_deviation", "approved_deviation", "rejected_deviation"].includes(decision?.status) && !nonBlank(decision.summary)) {
      issue(`${label}: ${decision.status} needs a summary`);
    }
    if (decision?.status === "approved_deviation" && (!object(decision.approval) || !nonBlank(decision.approval.reference))) {
      issue(`${label}: approved_deviation needs decision.approval.reference`);
    }

    if (requirement?.status === "delivered") {
      if (!nonBlank(requirement?.owner?.pr)) issue(`${label}: delivered requirements need owner.pr`);
      if (!array(requirement?.evidence) || requirement.evidence.length === 0) issue(`${label}: delivered requirements need evidence`);
      for (const evidence of requirement?.evidence ?? []) {
        if (!object(evidence) || !nonBlank(evidence.kind) || !nonBlank(evidence.location)) issue(`${label}: each evidence record needs kind and location`);
      }
      if (["decision_needed", "proposed_deviation", "rejected_deviation"].includes(decision?.status)) issue(`${label}: delivered requirements cannot contain an unresolved decision or deviation`);
    }
    if (["deferred", "not_in_release"].includes(requirement?.status) && !nonBlank(requirement?.disposition)) {
      issue(`${label}: deferred or not_in_release requirements need a disposition`);
    }
  }

  if (mode === "delivery") {
    for (const requirement of contract?.requirements ?? []) {
      if (requirement?.status === "in_progress") issue(`${requirement.id}: in_progress work cannot pass delivery`);
      if (requirement?.status === "delivered") {
        if (requirement?.source_resolution?.status === "decision_needed") issue(`${requirement.id}: unresolved source decision cannot pass delivery`);
        if (requirement?.design_basis?.design_document?.status === "decision_needed") issue(`${requirement.id}: unresolved design-document decision cannot pass delivery`);
        if (requirement?.design_basis?.figma?.status === "decision_needed") issue(`${requirement.id}: unresolved Figma decision cannot pass delivery`);
      }
      if (["update_detected", "reconciliation_active", "source_unavailable"].includes(requirement?.source_change?.status)) {
        issue(`${requirement.id}: unresolved mapped source change cannot pass delivery`);
      }
    }
    if (contract?.release_status === "design_complete") {
      for (const requirement of contract?.requirements ?? []) if (requirement?.status !== "delivered") issue(`${requirement.id}: design_complete requires delivered status`);
    }
  }

  const state = issues.length
    ? mode === "delivery" ? "release_held" : "contract_invalid"
    : mode === "delivery" ? "delivery_ready" : warnings.length ? "execution_ready_with_decisions" : "execution_ready";

  return {
    valid: issues.length === 0,
    report: { state, mode, feature_id: contract?.feature_id, contract_version: contract?.contract_version, issues, warnings, updates },
  };
}

function runCli() {
  const [file, flag, mode] = process.argv.slice(2);
  if (!file || flag !== "--mode" || !modes.has(mode)) {
    console.error("usage: validate-feature-contract.mjs <feature-contract.json> --mode <preflight|delivery>");
    process.exitCode = 2;
    return;
  }
  try {
    const result = validateContract(JSON.parse(fs.readFileSync(file, "utf8")), mode);
    console.log(JSON.stringify(result.report));
    if (!result.valid) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ state: mode === "delivery" ? "release_held" : "contract_invalid", issues: [`cannot read contract: ${error.message}`] }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli();
