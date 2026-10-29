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

// Path patterns that hint at what a file can break for users. A file takes every tag that matches; `code` when none does.
// The tags only direct reading: the diff decides the risk.
export const SURFACES = [
  ["migration", /(^|\/)(migrations?|migrate|alembic|db\/schema)(\/|\.)|\.sql$|(^|\/)schema\.(prisma|rb)$/i],
  ["api-contract", /(openapi|swagger)[^/]*\.(ya?ml|json)$|\.(proto|graphql|gql|avsc)$|(^|\/)(api|routes?|controllers?|handlers?|endpoints?|resolvers?)(\/|\.)/i],
  ["auth", /(^|[/_.-])(auth\w*|permissions?|roles?|acl|polic(y|ies)|sessions?|login|oauth|jwt|tokens?|csrf|cors|secrets?)([/_.-]|$)/i],
  ["dependency", /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|go\.(mod|sum)|Cargo\.(toml|lock)|requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|uv\.lock|Gemfile(\.lock)?|pom\.xml|build\.gradle(\.kts)?|composer\.(json|lock)|Podfile(\.lock)?|Package\.resolved)$/],
  ["config", /(^|\/)\.env[^/]*$|(^|\/)(config|settings|conf)(\/|\.)|\.config\.[cm]?[jt]s$|(^|\/)(feature[-_]?flags?|flags)(\/|\.)/i],
  ["infra", /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*|\.gitlab-ci\.yml|\.github\/workflows\/.*|Procfile|nginx[^/]*\.conf)$|\.(tf|tfvars)$|(^|\/)(helm|k8s|kubernetes|deploy|infra|charts)\//i],
  ["shared-ui", /(^|\/)(styles?|theme|themes|tokens|design-system|ui|primitives|common|shared|layouts?)\/.*\.(css|scss|sass|less|[jt]sx?|vue|svelte)$|(^|\/)(globals?|base|reset|variables|app|index|main)\.(css|scss|sass|less)$|(^|\/)tailwind\.config\.[cm]?[jt]s$/i],
  ["ui", /\.(css|scss|sass|less|[jt]sx|vue|svelte|html|hbs|erb|njk|twig|swift|kt|xib|storyboard)$/i],
  ["i18n", /(^|\/)(locales?|i18n|l10n|translations?|lang)\/|\.(po|pot|xliff|strings|arb)$/i],
  ["test", /(^|\/)(tests?|__tests__|spec|specs|e2e|cypress|playwright|fixtures)\/|\.(test|spec)\.[^/]+$|_test\.(go|py|rb)$/i],
  ["docs", /\.(md|mdx|rst|adoc|txt)$|(^|\/)docs?\//i],
];

export function surfaces(file) {
  const tags = SURFACES.filter(([, pattern]) => pattern.test(file)).map(([tag]) => tag);
  return tags.length ? tags : ["code"];
}

function git(cwd, ...args) {
  // Diffs of large MRs and lockfiles exceed Node's 1 MiB default; 256 MiB covers any diff a person could review.
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
  if (git(cwd, "rev-parse", "--git-dir").status !== 0) throw new Error(`${cwd} is not inside a git repository; run from the repository the MR belongs to`);
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
    files.push({ status: status[0], file, ...(from ? { from } : {}), ...(numstat.get(file) ?? { added: 0, deleted: 0 }), surfaces: surfaces(file) });
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
  for (const [tag] of [...SURFACES, ["code"]]) {
    if (!bySurface[tag]) continue;
    out.push(`[${tag}]`);
    for (const f of bySurface[tag]) out.push(`  ${f.status} ${f.from ? `${f.from} -> ` : ""}${f.file} +${f.added} -${f.deleted}`);
  }
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
