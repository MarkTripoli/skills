export default {
  slug: "counter-evidence",
  title: "Inspect and improve the recorded counter flows",
  workflow: "oneshot",
  fixtures: ["iterate-evidence"],
  request: "Use iterate-evidence to record and inspect both counter flows against spec.md, repair any evidenced in-scope defect, improve a check only where an observed gap warrants it, and verify fresh recorded behavior. You are authorized to edit app.js and check.mjs only, plus your numbered evidence-iteration receipt and ignored evidence files. Preserve expectations and every earlier observation. Required regression coverage is one Add one activation from zero and Reset from nonzero. Use the default bounded allowance. Deliver locally to the requester; do not publish or hand off.",
  phases: [{
    skill: "iterate-evidence",
    artifactType: "evidence-iteration",
    template: "evidence_iteration_template.md",
    check: ({ artifact }) => [
      ...(artifact?.fm.type === "evidence-iteration" ? [] : ["primary: evidence-iteration receipt missing"]),
      ...(artifact?.fm.limit === "3" ? [] : ["primary: default allowance must be exactly 3"]),
    ],
  }],
};
