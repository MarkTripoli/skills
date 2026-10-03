import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { validateContract } from "../../skills/delivery/feature-conformance/scripts/validate-feature-contract.mjs";
import { git } from "../deliver-grade.mjs";
import { expect, failures as flat } from "../lib.mjs";
const failures = (...checks) => flat(checks.flat(Infinity));

// `feature-conformance`: derive a ticket-scoped feature contract from collected inputs under `.agent-evidence/orchestration/run-1/`
// (two Jira tickets, two Figma bundle metadata files, one design document with a manifest). Ground truth the grader holds:
//   AOK-201: mapped Figma (reopened draft restored, with a banner) conflicts with the design document ("draft discarded"). The
//            ticket's acceptance criteria are ambiguous, not contradicted, so Figma wins automatically: `figma_overrides_design_document`,
//            no `decision_needed`, no deviation.
//   AOK-202: no Figma for the ticket; the design document supplies the missing detail: `design_document_resolves_ticket_ambiguity`.
//   Unmapped content (the `settings-screen` bundle, the `billing-export` section) gets no row, no deferral, no mapping.
// Needs only `node`: the validator is run by the grader as well. Terminal phase: the skill ends with the contract file, not a handoff.
// The run's files are untracked, so the contract is also copied into the task directory (`contract.json`) to survive a re-grade.
const RUN = ".agent-evidence/orchestration/run-1";
const COPY = "contract.json";
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const UNMAPPED = /\b20:1\b|settings-screen|notification settings|billing|csv/i;

export default {
  slug: "feature-conformance-authority",
  title: "Derive the feature contract for the draft and offline tickets",
  workflow: "oneshot",
  fixtures: ["feature-conformance"],
  request: `Derive the feature contract for feature group AOK-201 and AOK-202 of run \`run-1\`. The orchestrator's collected inputs are in \`${RUN}/context.md\` and the files it names.`,
  phases: [
    {
      skill: "feature-conformance",
      terminal: true,
      request: [
        `Derive the preflight feature contract for tickets AOK-201 and AOK-202 (run id \`run-1\`, feature id \`aok-200-aok-201-aok-202\`) from the inputs in \`${RUN}/context.md\`; those are all the context there is, so do not ask me anything and do not create anything outside the paths the skill names.`,
        `Save the contract where the skill says (\`${RUN}/features/<feature-id>/feature-contract.json\`), run its validator in preflight mode, fix any error it reports and rerun. Then copy the final contract unchanged to \`.agents/tasks/feature-conformance-authority/${COPY}\` and print the skill's final answer with the validator's state.`,
      ].join("\n"),
      check: ({ live, repo, taskDir, answer, codeRoot, dist }) => {
        // The run's pinned fixture snapshot, so a later fixture edit cannot move the expected hashes.
        const fixtureRun = path.join(dist, "fixtures", "feature-conformance", RUN);
        let contract = null;
        let readError = null;
        try {
          contract = read(path.join(taskDir, COPY));
        } catch (error) {
          readError = `feature-conformance: ${COPY} is missing or not JSON in the task directory (${error.code ?? error.message})`;
        }
        const manifest = read(path.join(fixtureRun, "design-documents", "manifest.json"));
        const sections = new Map(manifest.documents[0].sections.map((s) => [s.section_id, s.section_sha256]));
        const bundle = read(path.join(fixtureRun, "figma", "report-draft", "metadata.json"));
        const rows = contract?.requirements ?? [];
        const row = (ticket) => rows.find((r) => r.owner?.ticket === ticket);
        const r201 = row("AOK-201");
        const r202 = row("AOK-202");
        const mappedNodes = new Set(rows.flatMap((r) => r.design_basis?.figma?.node_ids ?? []));
        const mappedSections = rows.flatMap((r) => r.design_basis?.design_document?.sections ?? []);
        const validated = contract ? validateContract(contract, "preflight") : null;
        const skillCopy = live ? path.join(repo, RUN, "features") : null;
        let produced = [];
        if (live) {
          try {
            produced = fs.readdirSync(skillCopy).map((d) => path.join(skillCopy, d, "feature-contract.json")).filter((f) => fs.existsSync(f));
          } catch {
            produced = [];
          }
        }
        const manifests = live ? execFileSync("find", [path.join(repo, RUN), "-name", "*manifest*.json"], { encoding: "utf8" }).split("\n").filter(Boolean) : [];
        return failures(
          readError,
          contract ? [
            validated.valid ? null : `feature-conformance: the contract fails its own preflight validator: ${validated.report.issues.slice(0, 3).join("; ")}`,
            expect.matches("feature-conformance: validator state is execution_ready*", validated.report.state, /^execution_ready/),
            // The ticket boundary: rows only for the two selected tickets, none for unmapped content.
            rows.every((r) => ["AOK-201", "AOK-202"].includes(r.owner?.ticket)) ? null : `feature-conformance: a row owned by an unselected ticket: ${rows.map((r) => r.owner?.ticket).join(", ")}`,
            r201 ? null : "feature-conformance: no row for AOK-201",
            r202 ? null : "feature-conformance: no row for AOK-202",
            mappedNodes.has("20:1") || JSON.stringify(rows).match(UNMAPPED) ? "feature-conformance: a row carries unmapped content (settings-screen bundle or billing-export section)" : null,
            rows.some((r) => ["deferred", "not_in_release"].includes(r.status)) ? "feature-conformance: a deferral row exists, but no selected ticket names deferred work" : null,
            mappedSections.some((s) => s.section_id === "billing-export") ? "feature-conformance: a row maps the unmapped billing-export section" : null,
            // AOK-201: mapped Figma beats the conflicting document, automatically.
            r201 ? [
              expect.matches("feature-conformance: AOK-201 resolution is figma_overrides_design_document", r201.source_resolution?.status, /^figma_overrides_design_document$/),
              expect.matches("feature-conformance: AOK-201 maps Figma", r201.design_basis?.figma?.status, /^mapped$/),
              r201.design_basis?.figma?.bundle_id === "report-draft" && (r201.design_basis.figma.node_ids ?? []).every((n) => ["10:1", "10:2"].includes(n)) && (r201.design_basis.figma.node_ids ?? []).length ? null : `feature-conformance: AOK-201 Figma mapping is ${JSON.stringify(r201.design_basis?.figma)}, expected bundle report-draft with node 10:1 and/or 10:2`,
              ["decision_needed", "proposed_deviation", "approved_deviation", "rejected_deviation"].includes(r201.decision?.status) ? `feature-conformance: AOK-201 decision is ${r201.decision.status}; the conflict resolves automatically, so no decision or deviation` : null,
              (r201.design_basis?.design_document?.sections ?? []).some((s) => s.section_id === "draft-lifecycle" && s.section_sha256 === sections.get("draft-lifecycle")) ? null : "feature-conformance: AOK-201 does not map the draft-lifecycle section with the manifest's hash",
            ] : null,
            // AOK-202: no Figma, so the design document settles the ambiguity.
            r202 ? [
              expect.matches("feature-conformance: AOK-202 resolution is design_document_resolves_ticket_ambiguity", r202.source_resolution?.status, /^design_document_resolves_ticket_ambiguity$/),
              ["not_supplied", "not_applicable"].includes(r202.design_basis?.figma?.status) ? null : `feature-conformance: AOK-202 has no Figma, but its Figma status is ${r202.design_basis?.figma?.status}`,
              (r202.design_basis?.design_document?.sections ?? []).some((s) => s.section_id === "offline-banner" && s.section_sha256 === sections.get("offline-banner")) ? null : "feature-conformance: AOK-202 does not map the offline-banner section with the manifest's hash",
            ] : null,
            // Referenced, not copied: one run-level manifest, and the bundle values as exported.
            contract.design_documents !== undefined ? "feature-conformance: the contract embeds design_documents instead of referencing the manifest" : null,
            /design-documents[\\/]manifest\.json$/.test(contract.design_document_manifest?.path ?? "") ? null : `feature-conformance: design_document_manifest.path is ${JSON.stringify(contract.design_document_manifest?.path)}`,
            (contract.figma_bundles ?? []).filter((b) => b.id === "report-draft").every((b) => b.selection_sha256 === bundle.selection_sha256 && b.root_node_id === "10:1") ? null : "feature-conformance: the report-draft bundle's root or selection hash differs from its metadata.json",
          ] : null,
          expect.matches("feature-conformance: reply carries the validator state", answer, /execution_ready/),
          ...(live ? [
            produced.length === 1 ? null : `feature-conformance: expected one contract under ${RUN}/features/, found ${produced.length}`,
            produced.length === 1 && contract && JSON.stringify(read(produced[0])) !== JSON.stringify(contract) ? "feature-conformance: the task copy differs from the contract the skill saved" : null,
            manifests.length === 1 ? null : `feature-conformance: ${manifests.length} manifests under the run directory, expected the single supplied one`,
            git(repo, "status", "--porcelain") ? "feature-conformance: repository left dirty" : null,
          ] : []),
        );
      },
    },
  ],
};
