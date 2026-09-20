// Helpers shared by the eval runner and the scenarios: artifact lookup, frontmatter, the handoff fence,
// and small assertion builders that return failure strings instead of throwing, so one phase reports
// every miss at once.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const SNAPSHOT_EXCLUDED_DIRECTORIES = new Set([".git", ".agents", ".omp"]);

function snapshotBytes(bytes) {
  return {
    kind: "file",
    bytes: bytes.toString("base64"),
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

function snapshotSymbolicLink(file) {
  const linkTarget = fs.readlinkSync(file);
  return {
    kind: "symlink",
    linkTarget,
    sha256: crypto.createHash("sha256").update(linkTarget).digest("hex"),
  };
}

export function snapshotGitConfig(root) {
  const config = path.join(root, ".git", "config");
  if (!fs.existsSync(config)) return null;
  const stats = fs.lstatSync(config);
  if (stats.isSymbolicLink()) return snapshotSymbolicLink(config);
  if (!stats.isFile()) return null;
  return snapshotBytes(fs.readFileSync(config));
}

export function gitConfigChanged(before, after) {
  return !isDeepStrictEqual(before, after);
}

export function snapshotRepository(root) {
  const manifest = {};
  const visit = (directory, relativeDirectory = "") => {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (relativeDirectory === "" && entry.isDirectory() && SNAPSHOT_EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const fullPath = path.join(directory, entry.name);
      const stats = fs.lstatSync(fullPath);
      if (stats.isDirectory()) {
        visit(fullPath, relativePath);
        continue;
      }
      if (stats.isSymbolicLink()) {
        manifest[relativePath] = snapshotSymbolicLink(fullPath);
        continue;
      }
      if (!stats.isFile()) continue;
      manifest[relativePath] = snapshotBytes(fs.readFileSync(fullPath));
    }
  };
  visit(root);
  return manifest;
}

export function diffRepositorySnapshots(before, after) {
  const beforePaths = new Set(Object.keys(before));
  const afterPaths = new Set(Object.keys(after));
  const created = [...afterPaths].filter((file) => !beforePaths.has(file)).sort();
  const deleted = [...beforePaths].filter((file) => !afterPaths.has(file)).sort();
  const modified = [...beforePaths]
    .filter((file) => afterPaths.has(file) && !isDeepStrictEqual(before[file], after[file]))
    .sort();
  return {
    created,
    modified,
    deleted,
    changedPaths: [...created, ...modified, ...deleted].sort(),
  };
}

export function unexpectedRepositoryChanges(changedPaths, allowedChangedPaths = []) {
  const allowed = new Set(allowedChangedPaths);
  return [...changedPaths].filter((file) => !allowed.has(file)).sort();
}

export function frontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return null;
  const out = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    out[line.slice(0, idx).trim()] = line
      .slice(idx + 1)
      .trim()
      .replace(/^"(.*)"$/, "$1");
  }
  return out;
}

// Every `NN-*.md` in the task directory with its parsed frontmatter, newest number first.
export function artifacts(taskDir) {
  if (!fs.existsSync(taskDir)) return [];
  return fs
    .readdirSync(taskDir)
    .filter((f) => /^\d{2}-.+\.md$/.test(f))
    .sort()
    .reverse()
    .map((file) => {
      const text = fs.readFileSync(path.join(taskDir, file), "utf8");
      return { file, path: path.join(taskDir, file), text, fm: frontmatter(text) ?? {} };
    });
}

export function newest(taskDir, type) {
  return artifacts(taskDir).find((a) => a.fm.type === type) ?? null;
}

// The one `/<skill>[ @<file>]` command in the reply's final text fence, or null.
export function handoff(answer) {
  const fences = [...answer.matchAll(/^(`{3,})([^\n]*)\n([\s\S]*?)^\1[ \t]*$/gm)];
  const last = fences.at(-1);
  if (!last) return null;
  const match = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)(?: @(\S+))?$/.exec(last[3].trim());
  if (!match) return null;
  return { skill: match[1], file: match[2] ?? null, lang: last[2].trim(), fences: fences.length, index: last.index };
}

// Lines of `text` with fenced code blocks blanked, so a `# comment` inside a fence is not a heading.
function unfenced(text) {
  let inFence = false;
  return text.split("\n").map((line) => {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      return "";
    }
    return inFence ? "" : line;
  });
}

// Text of a Markdown section: from the heading line to the next heading of the same or higher level,
// fenced code ignored when locating headings. `last: true` takes the last occurrence of the heading
// (`### Known limits` under `## Human Review` when a body section reused the name). `body: true`
// stops at the first sub-heading too, for a section whose template nests another under it.
export function section(text, heading, { last = false, body = false } = {}) {
  const lines = text.split("\n");
  const scan = unfenced(text);
  const wanted = heading.trim().toLowerCase();
  const starts = scan.map((line, i) => (line.trim().toLowerCase() === wanted ? i : -1)).filter((i) => i !== -1);
  if (!starts.length) return null;
  const start = last ? starts.at(-1) : starts[0];
  const level = /^#+/.exec(scan[start])[0].length;
  let end = lines.length;
  for (let i = start + 1; i < scan.length; i++) {
    const m = /^(#+)\s/.exec(scan[i]);
    if (m && (m[1].length <= level || body)) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n").trim();
}

// The bracket prompts and `{field}` placeholders a template carries, as literals. An artifact that
// still contains one of them verbatim was not filled there.
export function templatePlaceholders(templateText) {
  const found = new Set();
  for (const m of templateText.matchAll(/\[[^\]\n]{3,}\]|\{[a-z_]+\}/g)) {
    // A YAML flow list such as `tags: [research, codebase]` is a value, not a prompt.
    if (/^\[[a-z0-9-]+(, [a-z0-9-]+)+\]$/.test(m[0])) continue;
    found.add(m[0]);
  }
  return [...found];
}

// Placeholders left in `text`: every bracket prompt and field literal from `templateText` (when given),
// plus the answer-template `{name}` fields a model reproduces without a template in hand. No generic
// `[Capitalized ...]` scan: an artifact legitimately carries `[INFERENCE ...]` tags, Mermaid node labels,
// and link text, and the template's own literals are the placeholders that matter. Not every `{word}`
// either: a URL template such as `{page_id}` is legitimate excerpt content.
const TEMPLATE_FIELDS = /\{(artifact_link|artifact_file|summary|plan_file|implementation_command|next_command|review_check|known_limits|needed|completed_phase|next_phase|task_dir|child_slug|child_issue|child_start_command|report_link)\}/g;
export function placeholders(text, templateText = "") {
  const literals = templatePlaceholders(templateText).filter((literal) => text.includes(literal));
  const fields = [...text.matchAll(TEMPLATE_FIELDS)].map((m) => m[0]);
  return [...new Set([...literals, ...fields])];
}

// Paragraphs of `text` (blank-line separated) matching `re`.
export function paragraphs(text, re) {
  return (text ?? "").split(/\n\s*\n/).filter((p) => re.test(p));
}

// Sentences of `text` (also split at line breaks and table cells) matching `re`; a table row or a
// bullet is judged on its own, not on the paragraph around it.
export function sentences(text, re) {
  return (text ?? "")
    .split(/\n|(?<=[.!?])\s+(?=[A-Z`])|\s\|\s/)
    .map((s) => s.trim())
    .filter((s) => s && re.test(s));
}

// `path:N` and `path:A-B` pointers into source files, resolved against `root`. Each result carries the
// pointer, whether the file exists, whether the lines exist, and the cited text, so a check can demand
// that a citation is real and says what it is cited for.
export function pointers(text, root, fileRe = /(?:src|tests|README)[A-Za-z0-9_./-]*\.(?:mjs|md|json)/) {
  const out = [];
  for (const m of text.matchAll(new RegExp(`(${fileRe.source}):(\\d+)(?:-(\\d+))?`, "g"))) {
    const file = m[1];
    const from = Number(m[2]);
    const to = m[3] ? Number(m[3]) : from;
    const full = path.join(root, file);
    const exists = fs.existsSync(full);
    const lines = exists ? fs.readFileSync(full, "utf8").split("\n") : [];
    const valid = exists && from >= 1 && to >= from && to <= lines.length;
    out.push({ pointer: m[0], file, from, to, exists, valid, text: valid ? lines.slice(from - 1, to).join("\n") : "" });
  }
  return out;
}

const needleTest = (text, needle) => (needle instanceof RegExp ? needle.test(text) : text.includes(needle));

export const expect = {
  includes: (label, text, needle) => (text && needleTest(text, needle) ? null : `${label}: missing ${needle instanceof RegExp ? needle : `"${needle}"`}`),
  // A missing section is a failure, not a vacuous pass: the negative is only meaningful on a section that exists.
  excludes: (label, text, needle) => {
    if (text === null || text === undefined) return `${label}: section missing`;
    return needleTest(text, needle) ? `${label}: unexpected ${needle instanceof RegExp ? needle : `"${needle}"`}` : null;
  },
  matches: (label, text, re) => (text && re.test(text) ? null : `${label}: no match for ${re}`),
  present: (label, value) => (value ? null : `${label}: missing`),
  atLeast: (label, count, min) => (count >= min ? null : `${label}: ${count}, expected at least ${min}`),
  filled: (label, text) => {
    if (text === null || text === undefined) return `${label}: section missing`;
    if (text.trim() === "") return `${label}: section empty`;
    const left = placeholders(text);
    return left.length ? `${label}: template placeholder left: ${left[0]}` : null;
  },
};

export const failures = (...checks) => checks.flat().filter(Boolean);
