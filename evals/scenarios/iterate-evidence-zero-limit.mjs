import { failures, section } from "../lib.mjs";
import { counterFlowCoverage } from "../evidence-flows.mjs";

export default {
  slug: "counter-zero-limit",
  title: "Inspect fresh counter footage without repair allowance",
  workflow: "oneshot",
  fixtures: ["iterate-evidence"],
  request: "Use iterate-evidence to capture a fresh ordinary baseline and inspect both counter flows against spec.md: one Add one activation from zero and Reset from nonzero. Use truthful narration and assertion labels supported by actual observations; no external baseline or injected success labels are supplied for this invocation. Open the recorded pixels yourself. The repair limit is explicitly 0: inspection only, with no repair reservation, delegation, source repair, or check improvement. Preserve app.js, check.mjs, spec.md, and every other source and configuration file byte-for-byte. Write only your numbered evidence-iteration receipt and ignored evidence files. Record the baseline application and served identities, media identities, unchanged expectations, stable finding IDs for observed defects, and separate per-flow coverage. Keep all recordings and observations, apply the skill's stop rules, and deliver locally to the requester without publishing or handing off.",
  phases: [{
    skill: "iterate-evidence",
    artifactType: "evidence-iteration",
    template: "evidence_iteration_template.md",
    check: ({ artifact }) => {
      const text = artifact?.text ?? "";
      const findings = (section(text, "## Findings") ?? "").split("\n")
        .filter((line) => /^\s*\|/.test(line))
        .map((line) => line.trim().slice(1, -1).split("|").map((cell) => cell.replace(/[`*_]/g, "").trim()))
        .filter((cells) => /^IE-\d{3,}$/.test(cells[0]));
      const coverage = counterFlowCoverage(text);
      return failures(
        artifact?.fm?.type === "evidence-iteration" ? null : "zero-limit: evidence-iteration receipt missing",
        artifact?.fm?.status === "failed" ? null : "zero-limit: inspected defect must leave the receipt failed",
        artifact?.fm?.stop_reason === "exhaustion" ? null : "zero-limit: zero repair allowance must stop at exhaustion",
        artifact?.fm?.limit === "0" ? null : "zero-limit: receipt must retain the explicit zero limit",
        artifact?.fm?.consumed_rounds === "0" ? null : "zero-limit: baseline inspection must consume no repair round",
        findings.some((cells) => cells[0] === "IE-001" && cells.some((cell) => cell.toLowerCase() === "open"))
          ? null : "zero-limit: inspected defect must retain stable finding IE-001 as open",
        findings.every((cells) => !cells.some((cell) => cell.toLowerCase() === "resolved"))
          ? null : "zero-limit: inspection without repair must not resolve a finding",
        coverage.increment
          ? null : "zero-limit: increment coverage must remain failed",
        coverage.reset
          ? null : "zero-limit: Reset requires its own inspected passing coverage",
      );
    },
  }],
};
