import { REQUEST, setup, grade } from "../babysit-pragmatic.mjs";

export default {
  slug: "babysit-pragmatic",
  title: "Repair selected PR CI without optional delivery proof",
  workflow: "oneshot",
  request: REQUEST,
  fixtures: ["babysit-pragmatic"],
  phases: [{
    skill: "babysit",
    terminal: true,
    model: "openai-codex/gpt-6.1-sol",
    artifactType: "babysit",
    setup,
    check: grade,
  }],
};
