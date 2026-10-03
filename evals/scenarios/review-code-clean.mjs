import { REQUEST, featureBranch, noPr, reviewCheck } from "./review-code-seeded-defect.mjs";

// The clean counterpart of review-code-seeded-defect: the same feature and the same trivial style nit, the
// implementation correct and fully tested. A review that raises the nit as a blocking finding, or cannot
// call a clean diff clean, fails. Setup and checks are shared with the seeded scenario.
export default {
  slug: "review-code-clean",
  title: "Add pagination",
  workflow: "oneshot",
  fixtures: [],
  request: REQUEST,
  stubs: noPr,
  phases: [
    {
      skill: "review-code",
      terminal: true,
      artifactType: "code-review",
      setup: featureBranch("clean"),
      request: "The change is committed on branch `feature/pagination`, cut from `main`. Review it against `main` as round 1. Do not edit product code.",
      check: reviewCheck("clean"),
    },
  ],
};
