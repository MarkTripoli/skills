import { expect, failures } from "../lib.mjs";

const expectedMetadata = {
  vcs: { platform: "github" },
  onboarding: {
    schemaVersion: 1,
    profile: "default",
    appliedRevision: 1,
    providers: {},
  },
};

function bytes(manifest, file) {
  const encoded = manifest?.[file]?.bytes;
  return encoded ? Buffer.from(encoded, "base64") : null;
}

export default {
  slug: "setup-repository-basic",
  title: "Set up local repository metadata twice",
  workflow: "oneshot",
  fixtures: ["setup-repository-basic"],
  gitRemotes: [{ name: "origin", url: "https://github.com/acme/setup-repository-fixture.git" }],
  request: "Create local repository onboarding metadata, then prove the same setup is byte-stable.",
  phases: [
    {
      phaseType: "terminal",
      skill: "setup-repository",
      request: "Run `/setup-repository` in exact `reconcile` mode.",
      allowedChangedPaths: ["ai-utilities.json"],
      check: ({ answer, afterRepository, changedPaths }) => {
        const metadataBytes = bytes(afterRepository, "ai-utilities.json");
        let metadata = null;
        try {
          metadata = JSON.parse(metadataBytes?.toString("utf8") ?? "");
        } catch {}
        return failures(
          expect.includes("repository: only metadata changed", changedPaths.join("\n"), "ai-utilities.json"),
          metadataBytes ? null : "repository: ai-utilities.json missing",
          metadata && JSON.stringify(metadata) === JSON.stringify(expectedMetadata)
            ? null
            : `repository: unexpected metadata ${JSON.stringify(metadata)}`,
          expect.matches("receipt: reconcile mode", answer, /Mode:\s*reconcile/i),
          expect.matches("receipt: ticketing remains unresolved", answer, /Unresolved choices:[^\n]*ticketing\.tool/i),
          expect.matches("receipt: exact changed path", answer, /(?:Planned paths|Written):[^\n]*ai-utilities\.json/i),
          expect.matches("receipt: verified", answer, /Verification:[^\n]*(?:match|verified|success)/i),
          expect.matches("receipt: no external operations", answer, /External operations:\s*0/i),
        );
      },
    },
    {
      phaseType: "terminal",
      skill: "setup-repository",
      request: "Run `/setup-repository` again in exact `reconcile` mode.",
      allowedChangedPaths: [],
      check: ({ answer, beforeRepository, afterRepository, changedPaths }) => failures(
        changedPaths.length === 0 ? null : `repository: rerun changed ${changedPaths.join(", ")}`,
        bytes(beforeRepository, "ai-utilities.json")?.equals(bytes(afterRepository, "ai-utilities.json"))
          ? null
          : "repository: rerun changed ai-utilities.json bytes",
        expect.matches("receipt: current observed state", answer, /Observed state:\s*current\b/i),
        expect.matches("receipt: no conflicts", answer, /Conflicts:\s*none\b/i),
        expect.matches("receipt: no written paths", answer, /Written:\s*(?:none|nothing)/i),
        expect.matches("receipt: unchanged verification", answer, /Verification:[^\n]*(?:unchanged|match)/i),
        expect.matches("receipt: no external operations", answer, /External operations:\s*0/i),
      ),
    },
  ],
};
