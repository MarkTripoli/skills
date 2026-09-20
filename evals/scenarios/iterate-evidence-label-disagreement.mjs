import { failures, section } from "../lib.mjs";

export default {
  slug: "counter-recording-review",
  title: "Inspect the existing counter recording against its specification",
  workflow: "oneshot",
  fixtures: ["iterate-evidence"],
  request: "Use iterate-evidence to inspect the named external evidence baseline supplied with this invocation against spec.md. Establish whether its application revision, environment, accessible media, and recorded coverage match this task, then reuse it when valid. Open the recorded pixels and assess both required flows: one Add one activation from zero and Reset from nonzero. The repair limit is explicitly 0: inspection only, with no repair rounds or check improvements. Preserve app.js, check.mjs, spec.md, all other source and configuration, and the original recording, reports, manifests, and labels. Write your numbered evidence-iteration receipt in the task directory; write new inspection samples only in its ignored evidence storage, without replacing the supplied baseline. Retain findings and per-flow outcomes supported by your inspection, unchanged expectations, and the baseline's source and media identities. Deliver locally to the requester; do not publish or hand off.",
  phases: [{
    skill: "iterate-evidence",
    artifactType: "evidence-iteration",
    template: "evidence_iteration_template.md",
    check: ({ artifact }) => {
      const rows = (section(artifact?.text ?? "", "## Final coverage") ?? "").split("\n")
        .filter((line) => /^\s*\|/.test(line))
        .map((line) => line.trim().slice(1, -1).split("|").map((cell) => cell.replace(/[`*_]/g, "").trim()));
      return failures(
        artifact?.fm?.type === "evidence-iteration" ? null : "label-disagreement: evidence-iteration receipt missing",
        artifact?.fm?.status === "failed" ? null : "label-disagreement: inspected defect must leave the receipt failed",
        artifact?.fm?.stop_reason === "exhaustion" ? null : "label-disagreement: zero repair allowance must stop at exhaustion",
        artifact?.fm?.limit === "0" ? null : "label-disagreement: receipt must retain the explicit zero limit",
        artifact?.fm?.consumed_rounds === "0" ? null : "label-disagreement: inspection must consume no repair round",
        rows.some((cells) => cells.length === 7 && cells[5]?.toLowerCase() === "failed")
          ? null : "label-disagreement: increment coverage must remain failed",
        rows.some((cells) => cells.length === 7 && cells[5]?.toLowerCase() === "passed")
          ? null : "label-disagreement: Reset requires its own inspected passing coverage",
      );
    },
  }],
};
