import { expect, failures } from "../lib.mjs";

// typed-judgment fallback, seen through a skill step that names a judgment: verify-implementation's grade step runs
// `judge.mjs grade-steps`. A `node` stub removes the TypeSafe key for `judge.mjs` only (unsets TYPESAFE_API_KEY and points
// both key-file lookups at a missing path), so the helper exits 3. The step must then proceed on its deterministic rule
// (the fixture's repository checks pass, so `passed`), never ask for the key, and say once that judgments were skipped.
// Other `node` calls (npm, the build) pass through to the real binary.
const node = process.execPath;
const stub = `case "$*" in
  *judge.mjs*) unset TYPESAFE_API_KEY; export TYPESAFE_API_KEY_FILE=/nonexistent/typesafe-key XDG_CONFIG_HOME=/nonexistent;;
esac
exec '${node.replace(/'/g, "'\\''")}' "$@"`;

const SKIPPED = /\bjudg(?:e)?ments?\b(?!-)[^\n.]{0,80}(?:skipp|unavailab|not (?:run|available))|(?:skipp\w*|unavailab\w*)[^\n.]{0,40}\bjudg(?:e)?ments?\b(?!-)|\b(?:typed-judgment|judge|judgment|grading) helper\b[^\n.]{0,80}(?:couldn'?t|could not|can'?t|cannot|didn'?t|did not|unable|not (?:set|run|available)|unavailab|exit(?:ed)? 3)/i;

export default {
  covers: ["typed-judgment"],
  slug: "typed-judgment-unavailable",
  title: "Verify a package build with no TypeSafe key",
  workflow: "oneshot",
  fixtures: ["verify-required-arguments"],
  request: `Verify the existing notification CLI against the task plan and repository checks. Preserve implementation and configuration.`,
  stubs: { node: stub },
  phases: [
    {
      skill: "verify-implementation",
      artifactType: "verification",
      template: "verification_template.md",
      next: "review-code",
      check: ({ artifact, answer, stubCalls }) => {
        const text = artifact?.text ?? "";
        const judged = stubCalls.filter((c) => /judge\.mjs/.test(c));
        // The answer template's `Known limits:` list may repeat the fact once; the body of the reply may say it once; one mention anywhere in the reply satisfies the rule.
        const [body, limits = ""] = (answer ?? "").split(/^Known limits:/m);
        const lines = body.split("\n").filter((l) => SKIPPED.test(l));
        const repeats = limits.split("\n").filter((l) => SKIPPED.test(l));
        return failures(
          judged.length ? null : "typed-judgment: the grade step never ran judge.mjs, so the fallback was not exercised",
          artifact?.fm?.status === "passed" ? null : `typed-judgment: verification status is ${JSON.stringify(artifact?.fm?.status)}; the deterministic rule passes this fixture`,
          expect.matches("typed-judgment: the artifact holds the repository's own check", text, /npm run build -- RUNTIME=node/),
          lines.length + repeats.length >= 1 ? null : "typed-judgment: the reply never says judgments were skipped",
          lines.length <= 1 ? null : `typed-judgment: the reply body says judgments were skipped ${lines.length} times, expected at most once`,
          repeats.length <= 1 ? null : `typed-judgment: the reply repeats the skipped judgments ${repeats.length} times under Known limits`,
          expect.excludes("typed-judgment: the reply does not ask the user for a key", answer, /(?:provide|send|paste|enter|set)[^\n]{0,40}(?:TYPESAFE|api key)/i),
          expect.excludes("typed-judgment: an unavailable helper is not a failed step", text, /(?:blocked|failed)[^\n]{0,60}judge/i),
        );
      },
    },
  ],
};
