import fs from "node:fs";
import path from "node:path";
import { expect, failures, section } from "../lib.mjs";

export default {
  slug: "verify-required-arguments",
  title: "Verify a package build with a required runtime argument",
  workflow: "oneshot",
  fixtures: ["verify-required-arguments"],
  request: `Verify the existing greeting CLI against the task plan and repository checks. Preserve implementation and configuration.`,
  phases: [
    {
      skill: "verify-implementation",
      artifactType: "verification",
      template: "verification_template.md",
      next: "review-code",
      check: ({ artifact, live, repo }) => {
        const text = artifact?.text ?? "";
        const run = section(text, "## Run") ?? "";
        const runtimeOutput = live
          ? (() => {
              try {
                return fs.readFileSync(path.join(repo, "dist", "runtime.txt"), "utf8").trim();
              } catch (error) {
                return `__missing__: ${error.code ?? error.message}`;
              }
            })()
          : null;
        return failures(
          artifact?.fm?.status === "passed" ? null : `verification: artifact status is ${JSON.stringify(artifact?.fm?.status)}`,
          expect.matches("verification: package build uses the discovered runtime argument", text, /npm run build -- RUNTIME=node/),
          expect.matches("verification: successful syntax/build evidence", text, /build complete for node|runtime\.txt|built for node|syntax/i),
          expect.matches("verification: package, CI, and docs discovered", run, /package\.json|CI|build\.yml|README/i),
          expect.excludes("verification: bare usage is not graded as a failure", text, /npm run build[^`\n]*usage[^\n]*\|\s*fail/i),
          ...(live ? [expect.matches("verification: build emitted actual runtime output", runtimeOutput, /^built for node$/)] : []),
        );
      },
    },
  ],
};
