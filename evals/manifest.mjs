import crypto from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const OBJECT_ID = /^[a-f0-9]{40,64}$/;
const FILE_MODE = /^[0-7]{6}$/;
const PERMISSION_MODE = /^[0-7]{4}$/;
const OTHER_TYPES = new Set(["other", "fifo", "socket", "block-device", "character-device"]);
const READ_ERROR_CLASSES = new Set(["io-error", "permission-denied", "read-failure"]);
const INDEX_OPERATIONS = new Set(["diff-visible-intent", "diff-ordinary-staged", "ls-files", "parse-ls-files"]);
const INDEX_REASONS = new Set(["absent-git-root", "unsafe-git-root", "unreadable-git-root"]);

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validBase64(value) {
  return typeof value === "string"
    && value.length % 4 === 0
    && /^[A-Za-z0-9+/]*={0,2}$/.test(value)
    && Buffer.from(value, "base64").toString("base64") === value;
}

function payloadDigest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function pathProblem(file, ownedRoot = null) {
  const normalized = file.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    file === ""
    || normalized !== file
    || normalized.startsWith("/")
    || /^[A-Za-z]:\//.test(normalized)
    || segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) return `has invalid path ${JSON.stringify(file)}`;
  if (ownedRoot === null && [".agents", ".git", ".omp"].includes(segments[0])) {
    return `has reserved root path ${JSON.stringify(file)}`;
  }
  if (ownedRoot !== null && segments[0] !== ownedRoot) {
    return `has path outside bucket ${JSON.stringify(file)}`;
  }
  return null;
}

function entryProblem(entry, file, contentlessIndex) {
  if (!record(entry) || typeof entry.kind !== "string") return `${file} has no known record kind`;
  switch (entry.kind) {
    case "directory":
      return exactKeys(entry, ["kind", "mode"])
        && typeof entry.mode === "string"
        && PERMISSION_MODE.test(entry.mode)
        ? null
        : `${file} directory record is malformed`;
    case "file":
      if (contentlessIndex && file === ".git/index") {
        return exactKeys(entry, ["kind", "mode"])
          && typeof entry.mode === "string"
          && PERMISSION_MODE.test(entry.mode)
          ? null
          : `${file} contentless record is malformed`;
      }
      if (!exactKeys(entry, ["bytes", "kind", "mode", "sha256"])
        || !validBase64(entry.bytes)
        || typeof entry.mode !== "string"
        || !PERMISSION_MODE.test(entry.mode)
        || typeof entry.sha256 !== "string"
        || !HASH.test(entry.sha256)) return `${file} file record is malformed`;
      return payloadDigest(Buffer.from(entry.bytes, "base64")) === entry.sha256
        ? null
        : `${file} file digest mismatch`;
    case "symlink":
      if (!exactKeys(entry, ["kind", "linkTarget", "sha256"])
        || typeof entry.linkTarget !== "string"
        || typeof entry.sha256 !== "string"
        || !HASH.test(entry.sha256)) return `${file} symlink record is malformed`;
      return payloadDigest(entry.linkTarget) === entry.sha256
        ? null
        : `${file} symlink digest mismatch`;
    case "file-error":
      return exactKeys(entry, ["errorClass", "kind", "mode", "operation", "sha256"])
        && typeof entry.mode === "string"
        && PERMISSION_MODE.test(entry.mode)
        && entry.operation === "read-file"
        && typeof entry.errorClass === "string"
        && READ_ERROR_CLASSES.has(entry.errorClass)
        && entry.sha256 === null
        ? null
        : `${file} file-error record is malformed`;
    case "other":
      return exactKeys(entry, ["kind", "type"])
        && typeof entry.type === "string"
        && OTHER_TYPES.has(entry.type)
        ? null
        : `${file} special-entry record is malformed`;
    default:
      return `${file} has unknown record kind ${JSON.stringify(entry.kind)}`;
  }
}

function treeProblem(value, contentlessIndex = false, ownedRoot = null) {
  if (!record(value)) return "must be an object keyed by repository-relative path";
  for (const [file, entry] of Object.entries(value)) {
    const invalidPath = pathProblem(file, ownedRoot);
    if (invalidPath) return invalidPath;
    const problem = entryProblem(entry, file, contentlessIndex);
    if (problem) return problem;
  }
  return null;
}

export function repositoryManifestProblem(value) {
  return treeProblem(value);
}

export function excludedRootsManifestProblem(value) {
  if (!record(value) || !exactKeys(value, [".agents", ".git", ".omp"])) {
    return "must contain only .agents, .git, and .omp roots";
  }
  for (const root of [".agents", ".git", ".omp"]) {
    const problem = treeProblem(value[root], root === ".git", root);
    if (problem) return `${root}: ${problem}`;
  }
  return null;
}

export function gitConfigManifestProblem(value) {
  if (value === null) return null;
  if (!record(value) || typeof value.kind !== "string") return "must be null or a typed config record";
  if (value.kind === "file") {
    return exactKeys(value, ["kind", "mode", "sha256"])
      && typeof value.mode === "string"
      && PERMISSION_MODE.test(value.mode)
      && typeof value.sha256 === "string"
      && HASH.test(value.sha256)
      ? null
      : "regular-file record must contain only kind and sha256";
  }
  return entryProblem(value, ".git/config", false);
}

function indexEntryProblem(entry) {
  const keys = ["assumeUnchanged", "intentToAdd", "mode", "object", "path", "skipWorktree", "stage"];
  if (!record(entry) || !exactKeys(entry, keys)) return "entry has unknown or missing fields";
  if (typeof entry.path !== "string" || entry.path === "") return "entry path must be non-empty";
  if (!Number.isInteger(entry.stage) || entry.stage < 0 || entry.stage > 3) return "entry stage must be 0 through 3";
  if (typeof entry.mode !== "string" || !FILE_MODE.test(entry.mode)) return "entry mode is malformed";
  if (typeof entry.object !== "string" || !OBJECT_ID.test(entry.object)) return "entry object id is malformed";
  if ([entry.assumeUnchanged, entry.skipWorktree, entry.intentToAdd].some((flag) => typeof flag !== "boolean")) {
    return "entry flags must be boolean";
  }
  return null;
}

export function gitIndexManifestProblem(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const problem = indexEntryProblem(entry);
      if (problem) return problem;
    }
    return null;
  }
  if (!record(value) || typeof value.kind !== "string") return "must be an entry array or typed error evidence";
  if (value.kind === "unavailable") {
    return exactKeys(value, ["kind", "reason"])
      && typeof value.reason === "string"
      && INDEX_REASONS.has(value.reason)
      ? null
      : "unavailable evidence is malformed";
  }
  if (value.kind === "error") {
    return exactKeys(value, ["code", "indexSha256", "kind", "operation"])
      && typeof value.operation === "string"
      && INDEX_OPERATIONS.has(value.operation)
      && typeof value.code === "string"
      && /^(?:exit-[1-9][0-9]*|spawn-error|spawn-enoent|unexpected-record)$/.test(value.code)
      && (value.indexSha256 === null || (typeof value.indexSha256 === "string" && HASH.test(value.indexSha256)))
      ? null
      : "error evidence is malformed";
  }
  return `has unknown evidence kind ${JSON.stringify(value.kind)}`;
}

export function phaseStatusProblem(value) {
  if (!record(value) || typeof value.kind !== "string") return "must be typed process status evidence";
  if (value.kind === "exit") {
    return exactKeys(value, ["code", "kind"])
      && Number.isInteger(value.code)
      && value.code >= 0
      ? null
      : "exit status is malformed";
  }
  if (value.kind === "signal") {
    return exactKeys(value, ["kind", "signal"])
      && typeof value.signal === "string"
      && /^SIG[A-Z0-9]+$/.test(value.signal)
      ? null
      : "signal status is malformed";
  }
  return `has unknown status kind ${JSON.stringify(value.kind)}`;
}
