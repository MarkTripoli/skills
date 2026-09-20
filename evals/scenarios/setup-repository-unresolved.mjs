import { expect, failures } from "../lib.mjs";

const expectedMetadata = {
  onboarding: {
    schemaVersion: 1,
    profile: "default",
    appliedRevision: 1,
    providers: {},
  },
};

function metadata(manifest) {
  const encoded = manifest?.["ai-utilities.json"]?.bytes;
  if (!encoded) return null;
  try {
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export default {
  slug: "setup-repository-unresolved",
  title: "Set up metadata without an unambiguous supported remote",
  workflow: "oneshot",
  fixtures: ["setup-repository-basic"],
  request: "Create local onboarding metadata without guessing version-control or ticketing providers.",
  phases: [
    {
      phaseType: "terminal",
      skill: "setup-repository",
      request: "Run `/setup-repository` in exact `reconcile` mode. No supported remote is configured, so keep provider choices unresolved.",
      allowedChangedPaths: ["ai-utilities.json"],
      check: ({ answer, afterRepository, changedPaths }) => {
        const document = metadata(afterRepository);
        return failures(
          expect.includes("repository: only metadata changed", changedPaths.join("\n"), "ai-utilities.json"),
          document && JSON.stringify(document) === JSON.stringify(expectedMetadata)
            ? null
            : `repository: unexpected metadata ${JSON.stringify(document)}`,
          expect.matches("receipt: version control remains unresolved", answer, /Unresolved choices:[^\n]*vcs\.platform/i),
          expect.matches("receipt: ticketing remains unresolved", answer, /Unresolved choices:[^\n]*ticketing\.tool/i),
          expect.matches("receipt: no external operations", answer, /External operations:\s*0/i),
        );
      },
    },
  ],
};
