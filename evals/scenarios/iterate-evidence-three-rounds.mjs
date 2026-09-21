import { failures } from "../lib.mjs";

export default {
  slug: "counter-three-rounds",
  title: "Inspect and repair independent counter flows one finding at a time",
  workflow: "oneshot",
  fixtures: ["iterate-evidence", "iterate-evidence-three-rounds"],
  minMinutes: 45,
  request: "Use iterate-evidence to record and inspect all four independent counters against spec.md. Repair only one evidenced required finding per round, in counter order A, B, C, D; do not batch repairs for multiple counters into one round. Capture and inspect all eight required flows at baseline and after every repair: each counter's Add one activation from zero, followed by each counter's Reset from nonzero. Keep all four increment states visible together before resetting any counter. You are authorized to edit app.js and check.mjs only, plus your numbered evidence-iteration receipt and ignored evidence files. Improve a check only where an observed gap warrants it, without changing expectations or treating other known application failures as unavailable prerequisites. Preserve stable finding IDs, prior observations, recorded sessions, and round history. Deliver locally to the requester; do not publish or hand off.",
  phases: [{
    skill: "iterate-evidence",
    artifactType: "evidence-iteration",
    template: "evidence_iteration_template.md",
    check: ({ artifact }) => failures(
      artifact?.fm?.type === "evidence-iteration" ? null : "three-rounds: evidence-iteration receipt missing",
      artifact?.fm?.status === "failed" ? null : "three-rounds: remaining required defect must leave the receipt failed",
      artifact?.fm?.stop_reason === "exhaustion" ? null : "three-rounds: productive rounds must stop at allowance exhaustion",
      artifact?.fm?.limit === "3" ? null : "three-rounds: unspecified allowance must retain the default limit of three",
      artifact?.fm?.consumed_rounds === "3" ? null : "three-rounds: exactly three productive repair rounds must be consumed",
    ),
  }],
};
