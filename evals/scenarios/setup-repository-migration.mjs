import { expect, failures } from "../lib.mjs";

const expectedForeignState = {
  vcs: { platform: "github", repository: "acme/preserved" },
  ticketing: { tool: "linear", team: "ENG" },
  custom: { nested: { keep: true, values: ["alpha", "beta"] } },
};

const expectedOnboarding = {
  schemaVersion: 1,
  profile: "default",
  appliedRevision: 1,
  providers: {},
};
const expectedRevisionZeroForeignState = {
  vcs: { platform: "github", repository: "acme/revision-zero" },
  ticketing: { tool: "jira", project: "REV0" },
  custom: { nested: { keep: "exactly", values: [1, 2, 3] } },
};

function bytes(manifest, file) {
  const encoded = manifest?.[file]?.bytes;
  return encoded ? Buffer.from(encoded, "base64") : null;
}

function parseMetadata(manifest) {
  const metadataBytes = bytes(manifest, "ai-utilities.json");
  if (!metadataBytes) return null;
  try {
    return JSON.parse(metadataBytes.toString("utf8"));
  } catch {
    return null;
  }
}

export default {
  slug: "setup-repository-migration",
  title: "Migrate owned repository metadata without changing foreign state",
  workflow: "oneshot",
  fixtures: ["setup-repository-migration"],
  request: "Migrate supported repository onboarding metadata, then prove the result is byte-stable.",
  phases: [
    {
      phaseType: "terminal",
      skill: "setup-repository",
      request: "Run `/setup-repository` in exact `reconcile` mode and migrate supported managed metadata.",
      allowedChangedPaths: ["ai-utilities.json"],
      check: ({ answer, afterRepository, changedPaths }) => {
        const metadata = parseMetadata(afterRepository);
        const foreignState = metadata
          ? { vcs: metadata.vcs, ticketing: metadata.ticketing, custom: metadata.custom }
          : null;
        return failures(
          expect.includes("repository: only metadata changed", changedPaths.join("\n"), "ai-utilities.json"),
          metadata ? null : "repository: ai-utilities.json missing or invalid",
          JSON.stringify(foreignState) === JSON.stringify(expectedForeignState)
            ? null
            : `repository: foreign top-level state changed ${JSON.stringify(foreignState)}`,
          metadata && JSON.stringify(metadata.onboarding) === JSON.stringify(expectedOnboarding)
            ? null
            : `repository: unexpected onboarding state ${JSON.stringify(metadata?.onboarding)}`,
          expect.matches("receipt: old and new schema", answer, /(?:Old version|Observed version):[^\n]*0[\s\S]*New version:[^\n]*1/i),
          expect.matches("receipt: changed owned fields", answer, /Changed owned fields:[\s\S]*?(?:schemaVersion|profile|appliedRevision|providers)/i),
          expect.matches("receipt: preserved foreign fields", answer, /Preserved user fields:[^\n]*(?:vcs|ticketing|custom)/i),
          expect.matches("receipt: verified bytes", answer, /Verification bytes:[^\n]*(?:match|verified|success)/i),
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
        expect.matches("receipt: no written paths", answer, /Written:\s*(?:none|nothing)/i),
        expect.matches("receipt: unchanged bytes", answer, /Verification bytes:[^\n]*(?:unchanged|match)/i),
        expect.matches("receipt: no external operations", answer, /External operations:\s*0/i),
      ),
    },
    {
      phaseType: "terminal",
      skill: "setup-repository",
      request: "Run `/setup-repository` in exact `reconcile` mode. Migrate schema 1 at supported revision 0 without changing foreign top-level state.",
      fixtureOverlay: "setup-repository-migration-revision-zero",
      allowedChangedPaths: ["ai-utilities.json"],
      check: ({ answer, afterRepository, changedPaths }) => {
        const metadata = parseMetadata(afterRepository);
        const foreignState = metadata
          ? { vcs: metadata.vcs, ticketing: metadata.ticketing, custom: metadata.custom }
          : null;
        return failures(
          expect.includes("repository: only metadata changed", changedPaths.join("\n"), "ai-utilities.json"),
          JSON.stringify(foreignState) === JSON.stringify(expectedRevisionZeroForeignState)
            ? null
            : `repository: foreign top-level state changed ${JSON.stringify(foreignState)}`,
          metadata && JSON.stringify(metadata.onboarding) === JSON.stringify(expectedOnboarding)
            ? null
            : `repository: unexpected onboarding state ${JSON.stringify(metadata?.onboarding)}`,
          expect.matches("receipt: revision advanced", answer, /(?:Old version|Observed version):[^\n]*1[^\n]*0[\s\S]*New version:[^\n]*1[^\n]*1/i),
          expect.matches("receipt: no external operations", answer, /External operations:\s*0/i),
        );
      },
    },
    {
      phaseType: "terminal",
      skill: "setup-repository",
      request: "Run `/setup-repository` again in exact `reconcile` mode after the revision-0 migration.",
      allowedChangedPaths: [],
      check: ({ answer, beforeRepository, afterRepository, changedPaths }) => failures(
        changedPaths.length === 0 ? null : `repository: rerun changed ${changedPaths.join(", ")}`,
        bytes(beforeRepository, "ai-utilities.json")?.equals(bytes(afterRepository, "ai-utilities.json"))
          ? null
          : "repository: rerun changed revision-zero migration bytes",
        expect.matches("receipt: no written paths", answer, /Written:\s*(?:none|nothing)/i),
        expect.matches("receipt: no external operations", answer, /External operations:\s*0/i),
      ),
    },
  ],
};
