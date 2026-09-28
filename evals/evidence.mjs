import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function isEnvironmentFile(name) {
  return name === ".env" || name.startsWith(".env.");
}
// Every local module that can affect recording or regrading is copied under runner/.
export const RUNNER_SOURCES = [
  "acme-chain.mjs", "evidence-flows.mjs", "evidence.mjs", "feedback.mjs", "iterate-evidence-hooks.mjs",
  "iterate-evidence.mjs", "lib.mjs", "metrics.mjs", "record-solo.mjs", "run.mjs",
  "security-assessment.mjs", "worker-gate.mjs",
].map((file) => ({ source: `evals/${file}`, snapshot: file })).concat([
  { source: "scripts/check-commits.mjs", snapshot: "scripts/check-commits.mjs" },
]);

export function fingerprintDirectories(roots) {
  const hash = crypto.createHash("sha256");
  const addFile = (file, relative) => hash.update(relative).update("\0").update(fs.readFileSync(file)).update("\0");
  const visit = (base, directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      if (isEnvironmentFile(entry.name)) continue;
      const file = path.join(directory, entry.name);
      const relative = `${prefix}/${path.relative(base, file).split(path.sep).join("/")}`;
      if (entry.isDirectory()) visit(base, file, prefix);
      else if (entry.isFile()) addFile(file, relative);
      else if (entry.isSymbolicLink()) hash.update(relative).update("\0link:").update(fs.readlinkSync(file)).update("\0");
      else throw new TypeError(`unsupported source snapshot entry: ${relative}`);
    }
  };
  for (const { label, root } of [...roots].sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0)) {
    const base = path.resolve(root);
    hash.update(label).update("\0");
    const stat = fs.lstatSync(base);
    if (stat.isDirectory()) visit(base, base, label);
    else if (stat.isFile() && !isEnvironmentFile(path.basename(base))) addFile(base, `${label}/${path.basename(base)}`);
    else if (stat.isSymbolicLink()) hash.update(label).update("\0link:").update(fs.readlinkSync(base)).update("\0");
    else throw new TypeError(`unsupported source snapshot root: ${label}`);
  }
  return hash.digest("hex");
}

export function fingerprintDirectory(root) {
  return fingerprintDirectories([{ label: ".", root }]);
}

export function fingerprintEvalSource(dist, scenario, fixtureSnapshotRevision = fingerprintDirectory(path.join(dist, "fixtures"))) {
  const sources = fingerprintDirectories([
    { label: "scenario", root: path.join(dist, "eval-sources", "scenarios", `${scenario}.mjs`) },
    { label: "runner", root: path.join(dist, "eval-sources", "runner") },
    { label: "agents", root: path.join(dist, "agents") },
    { label: "skills", root: path.join(dist, "skills") },
    { label: "shared", root: path.join(dist, "shared") },
  ]);
  return crypto.createHash("sha256").update(sources).update("\0fixtures\0").update(fixtureSnapshotRevision).digest("hex");
}
