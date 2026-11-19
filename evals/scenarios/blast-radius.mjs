import { expect, failures } from "../lib.mjs";

// The diff trims leading and trailing hyphens from slugs. Stored posts keep the slug computed at save time, so
// a post saved as "hello-" no longer matches its freshly computed path. The reply must name that stored-data
// risk, show a run or mark the safety fact unproven, and use the five-part shape.
function check({ live, answer }) {
  if (!live) return [];
  return failures(
    expect.matches("blast-radius: names the stored slug mismatch", answer, /savedSlug|stored|saved/i),
    expect.matches("blast-radius: cites the consumer", answer, /src\/routes\.mjs/),
    expect.matches("blast-radius: states the safety fact", answer, /one fact/i),
    expect.matches("blast-radius: shows proof or says unproven", answer, /unproven|node |\$ |output/i),
    expect.matches("blast-radius: lists what to run before merging", answer, /before merging/i),
  );
}

export default {
  slug: "blast-radius-slug",
  title: "Find what a slug normalization change breaks",
  workflow: "oneshot",
  fixtures: ["blast-radius"],
  request: "What could the change in change.diff break?",
  phases: [{ skill: "blast-radius", terminal: true, request: "/blast-radius of applying change.diff to src/slug.mjs. Do not modify tracked files.", check }],
};
