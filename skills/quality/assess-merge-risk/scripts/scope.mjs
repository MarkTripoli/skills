#!/usr/bin/env node
// Pins what merging <source> into <target> changes: the merge base, commits on each side, textual conflicts from a
// trial merge, files changed on both sides since the base, and every changed file with its line counts and surface tags.
// Also prints where this source's report lives: one file per source branch inside the git directory, so the working tree
// stays clean and a later session finds the report it is answering.
// Usage: node scope.mjs <source> [--target <branch>] [--json]   (run inside the repository; reads only, writes nothing)

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// What a changed file can break for users. Each surface is one entry in references/surfaces.json:
//   { "tag": "auth", "paths": ["<regex>", ...], "flags": "i", "signals": "<what to look for in the diff>", "worst": "<typical worst outcome>" }
// A file takes every tag whose path pattern matches it, and "code" when none does. An entry without "paths" matches no
// file by name: its signals apply to every diff. The tags only direct reading; the diff decides the risk.
const SURFACE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "references", "surfaces.json");
// A repository adds, replaces or removes surfaces without editing the skill, in this file on the target branch:
//   { "add": [<surface entries>], "remove": ["<tag>", ...] }
export const OVERRIDE_PATH = ".agents/merge-risk.json";

// Returns the surface table for the built-in entries with an override applied; throws naming the entry to fix.
export function compileSurfaces(entries, override = {}, from = "surfaces.json") {
  if (!Array.isArray(entries)) throw new Error(`${from} must hold a JSON array of surfaces`);
  const { add = [], remove = [] } = override ?? {};
  if (!Array.isArray(add) || !Array.isArray(remove)) throw new Error(`${OVERRIDE_PATH} needs "add" as an array of surfaces and "remove" as an array of tags`);
  const compile = (entry, where) => {
    if (!entry || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.tag ?? "")) throw new Error(`${where}: every surface needs a kebab-case "tag"`);
    if (typeof entry.signals !== "string" || !entry.signals) throw new Error(`${where}: surface "${entry.tag}" needs "signals", the changes to look for in a diff`);
    const patterns = (entry.paths ?? []).map((source) => {
      try { return new RegExp(source, entry.flags ?? "i"); }
      catch (error) { throw new Error(`${where}: surface "${entry.tag}" has an invalid path pattern ${JSON.stringify(source)}: ${error.message}`); }
    });
    return { tag: entry.tag, patterns, signals: entry.signals, worst: entry.worst ?? "" };
  };
  const table = entries.map((entry) => compile(entry, from));
  for (const entry of add.map((item) => compile(item, OVERRIDE_PATH))) {
    const at = table.findIndex((existing) => existing.tag === entry.tag);
    if (at === -1) table.push(entry);
    else table[at] = entry;
  }
  const unknown = remove.filter((tag) => !table.some((entry) => entry.tag === tag));
  if (unknown.length) throw new Error(`${OVERRIDE_PATH}: "remove" names no surface called ${unknown.join(", ")}; tags are ${table.map((entry) => entry.tag).join(", ")}`);
  return table.filter((entry) => !remove.includes(entry.tag));
}

const BUILT_IN = JSON.parse(fs.readFileSync(SURFACE_FILE, "utf8"));
export const SURFACES = compileSurfaces(BUILT_IN);

export function surfaces(file, table = SURFACES) {
  const tags = table.filter((entry) => entry.patterns.some((pattern) => pattern.test(file))).map((entry) => entry.tag);
  return tags.length ? tags : ["code"];
}

function git(cwd, ...args) {
  // Diffs of large changes and lockfiles exceed Node's 1 MiB default; 256 MiB covers any diff a person could review.
  const out = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return { status: out.status, stdout: (out.stdout ?? "").trimEnd(), stderr: (out.stderr ?? "").trim() };
}

function must(cwd, ...args) {
  const out = git(cwd, ...args);
  if (out.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${out.stderr || `exit ${out.status}`}`);
  return out.stdout;
}

const lines = (text) => (text ? text.split("\n") : []);

// The target is what the source merges into: an explicit --target, else the remote default branch, else main.
function defaultTarget(cwd) {
  const head = git(cwd, "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD");
  if (head.status === 0 && head.stdout) return head.stdout;
  for (const name of ["origin/main", "main", "origin/master", "master"]) if (git(cwd, "rev-parse", "--verify", "--quiet", `${name}^{commit}`).status === 0) return name;
  throw new Error("no target branch found; pass --target <branch>");
}

export function scope(cwd, source, target) {
  if (git(cwd, "rev-parse", "--git-dir").status !== 0) throw new Error(`${cwd} is not inside a git repository; run from the repository the change belongs to`);
  if (!source) throw new Error("missing <source>: the branch, tag or commit to be merged");
  target ??= defaultTarget(cwd);
  const resolve = (ref) => {
    const out = git(cwd, "rev-parse", "--verify", "--quiet", `${ref}^{commit}`);
    if (out.status !== 0) throw new Error(`"${ref}" does not name a commit here; fetch it first (git fetch origin ${ref})`);
    return out.stdout;
  };
  const sourceSha = resolve(source);
  const targetSha = resolve(target);
  const base = git(cwd, "merge-base", targetSha, sourceSha);
  if (base.status !== 0) throw new Error(`${source} and ${target} share no history`);
  const mergeBase = base.stdout;

  // The override is read from the target commit, so the assessment does not depend on the working tree.
  const override = git(cwd, "show", `${targetSha}:${OVERRIDE_PATH}`);
  let table = SURFACES;
  if (override.status === 0) {
    let parsed;
    try { parsed = JSON.parse(override.stdout); }
    catch (error) { throw new Error(`${OVERRIDE_PATH} on ${target} is not valid JSON: ${error.message}`); }
    table = compileSurfaces(BUILT_IN, parsed);
  }

  const sourceCommits = lines(must(cwd, "log", "--format=%h %s", `${targetSha}..${sourceSha}`));
  const targetCommits = lines(must(cwd, "log", "--format=%h %s", `${sourceSha}..${targetSha}`));

  // A trial merge in memory: the first line is the merged tree (conflicted files keep their markers), then conflicted
  // paths; exit 0 when clean, 1 with conflicts. Needs git 2.38 or later. `git grep <pattern> <mergedTree>` searches
  // the code as it will be after the merge, including callers the target gained since the base.
  const trial = git(cwd, "merge-tree", "--write-tree", "--name-only", "--no-messages", targetSha, sourceSha);
  const ran = trial.status === 0 || trial.status === 1;
  const mergedTree = ran ? lines(trial.stdout)[0] : null;
  const conflicts = ran ? lines(trial.stdout).slice(1).filter(Boolean) : null;

  // -z output: a rename's numstat record is "added\tdeleted\t" followed by two NUL-separated paths; binary files count 0.
  const numstat = new Map();
  const counts = must(cwd, "diff", "--numstat", "-z", "-M", mergeBase, sourceSha).split("\0");
  for (let i = 0; i < counts.length; i++) {
    if (!counts[i]) continue;
    const [added, deleted, file] = counts[i].split("\t");
    const to = file === "" ? counts[(i += 2)] : file;
    numstat.set(to, { added: Number(added) || 0, deleted: Number(deleted) || 0 });
  }
  const files = [];
  const names = must(cwd, "diff", "--name-status", "-z", "-M", mergeBase, sourceSha).split("\0");
  for (let i = 0; i < names.length; i++) {
    const status = names[i];
    if (!status) continue;
    const from = /^[RC]/.test(status) ? names[++i] : undefined;
    const file = names[++i];
    files.push({ status: status[0], file, ...(from ? { from } : {}), ...(numstat.get(file) ?? { added: 0, deleted: 0 }), surfaces: surfaces(file, table) });
  }
  const targetFiles = new Set(lines(must(cwd, "diff", "--name-only", mergeBase, targetSha)));
  const overlap = files.map((f) => f.file).filter((file) => targetFiles.has(file));

  // `origin/feature/x` and `feature/x` name the same branch, so they share a report.
  const slug = source.replace(/^(refs\/(heads|remotes)\/)?origin\//, "").replace(/[^A-Za-z0-9._-]+/g, "-");
  const reportPath = path.resolve(cwd, must(cwd, "rev-parse", "--git-path", `assess-merge-risk-${slug}.md`));

  return {
    source, target, sourceSha, targetSha, mergeBase, mergedTree, reportPath,
    sourceCommits, targetCommits,
    conflicts, overlap, files,
    surfaceTable: table.map(({ tag, signals, worst, patterns }) => ({ tag, signals, worst, everyDiff: patterns.length === 0 })),
    totals: { files: files.length, added: files.reduce((n, f) => n + f.added, 0), deleted: files.reduce((n, f) => n + f.deleted, 0) },
  };
}

export function format(s) {
  const short = (sha) => sha.slice(0, 10);
  const bySurface = {};
  for (const f of s.files) for (const tag of f.surfaces) (bySurface[tag] ??= []).push(f);
  const out = [
    `source  ${s.source} ${short(s.sourceSha)} (${s.sourceCommits.length} commits not on target)`,
    `target  ${s.target} ${short(s.targetSha)} (${s.targetCommits.length} commits since the merge base)`,
    `base    ${short(s.mergeBase)}`,
    `merged tree ${s.mergedTree ?? "unknown"}`,
    `report  ${s.reportPath}`,
    `changed ${s.totals.files} files, +${s.totals.added} -${s.totals.deleted}`,
    `conflicts ${s.conflicts === null ? "unknown (git merge-tree --write-tree needs git 2.38 or later)" : s.conflicts.length ? s.conflicts.join(", ") : "none"}`,
    `changed on both sides ${s.overlap.length ? s.overlap.join(", ") : "none"}`,
    "",
  ];
  for (const { tag, signals, worst } of [...s.surfaceTable, { tag: "code" }]) {
    if (!bySurface[tag]) continue;
    out.push(`[${tag}]${signals ? ` look for: ${signals}. Typical worst outcome: ${worst}` : ""}`);
    for (const f of bySurface[tag]) out.push(`  ${f.status} ${f.from ? `${f.from} -> ` : ""}${f.file} +${f.added} -${f.deleted}`);
  }
  const everyDiff = s.surfaceTable.filter((entry) => entry.everyDiff);
  if (everyDiff.length) out.push("", "in every diff, also look for:", ...everyDiff.map((entry) => `  [${entry.tag}] ${entry.signals}. Typical worst outcome: ${entry.worst}`));
  // The exact next command, filled in, so the report is checked before it becomes the reply.
  const checker = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-report.mjs");
  if (s.mergedTree) out.push("", `next: write the report to ${s.reportPath}, then run until it prints ok:`, `  node ${checker} ${s.reportPath} --tree ${s.mergedTree} --base ${s.mergeBase}`);
  return out.join("\n");
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  let entrypoint;
  try { entrypoint = fs.realpathSync(process.argv[1]); }
  catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return false;
    throw error;
  }
  return entrypoint === fs.realpathSync(fileURLToPath(import.meta.url));
})();
if (isMain) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--target");
  const target = at === -1 ? undefined : args[at + 1];
  const source = args.find((a, i) => !a.startsWith("--") && (at === -1 || i !== at + 1));
  try {
    if (at !== -1 && !target) throw new Error("--target needs a branch name");
    const result = scope(process.cwd(), source, target);
    console.log(args.includes("--json") ? JSON.stringify(result, null, 2) : format(result));
  } catch (error) {
    console.error(`scope: ${error.message}\nUsage: node scope.mjs <source> [--target <branch>] [--json]`);
    process.exitCode = 1;
  }
}
