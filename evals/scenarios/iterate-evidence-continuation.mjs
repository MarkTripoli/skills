import { failures } from "../lib.mjs";

export default {
  slug: "counter-evidence-continuation",
  title: "Complete recorded counter repair from its saved iteration receipt",
  workflow: "oneshot",
  fixtures: ["iterate-evidence"],
  request: "Use iterate-evidence to record and inspect both counter flows against spec.md, repair evidenced in-scope defects, and strengthen check.mjs where inspection exposes a gap. Verify the same strengthened check against preserved faulty source and the repaired served application without changing expectations. You are authorized to edit app.js and check.mjs only, plus your numbered evidence-iteration receipt and ignored evidence files. Required regression coverage is one Add one activation from zero and Reset from nonzero. Use the default bounded allowance. Persist inspected findings and the round reservation before mutation. Complete source and check work before starting the fresh post-repair recording; persist the completed repair/check steps, their results and application identity, and the pending capture step in the same receipt before beginning that capture. Keep the finding pending verification until you inspect newly recorded pixels. If this invocation names an existing iteration receipt, continue its next incomplete step in place, retaining its original findings, observations, reserved round, and consumed allowance; do not replay completed edits or reserve another round for the same work. Preserve all earlier evidence and history. Deliver locally to the requester; do not publish or hand off.",
  phases: [{
    skill: "iterate-evidence",
    artifactType: "evidence-iteration",
    template: "evidence_iteration_template.md",
    check: ({ artifact, artifacts = [] }) => {
      const findings = (artifact?.text ?? "").split("\n")
        .filter((line) => /^\s*\|/.test(line))
        .map((line) => line.trim().slice(1, -1).split("|").map((cell) => cell.replace(/[`*_]/g, "").trim()));
      return failures(
        artifact?.fm?.type === "evidence-iteration" ? null : "continuation: evidence-iteration receipt missing",
        artifact?.fm?.status === "passed" ? null : "continuation: completed verification must leave the receipt passed",
        artifact?.fm?.stop_reason === "success" ? null : "continuation: completed verification must stop at success",
        artifact?.fm?.limit === "3" ? null : "continuation: receipt must retain the default three-round allowance",
        artifact?.fm?.consumed_rounds === "1" ? null : "continuation: resumed work must complete the original single reserved round",
        findings.filter((cells) => cells[0] === "IE-001").at(-1)?.some((cell) => /(?:^|→\s*)resolved$/i.test(cell))
          || /\bIE-001\b[^\n]*(?:→|->)\s*resolved\b/i.test(artifact?.text ?? "")
          ? null : "continuation: original finding IE-001 must remain present and resolved",
        artifacts.filter((entry) => entry.fm?.type === "evidence-iteration").length === 1
          ? null : "continuation: both invocations must retain exactly one iteration receipt",
      );
    },
  }],
};
