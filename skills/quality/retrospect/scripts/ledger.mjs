#!/usr/bin/env node
// The lessons ledger: plain files under `lessons/` in a git repository.
//   lessons/<slug>/LESSON.md          frontmatter (title, status, target, product, dates, verify) and the lesson text
//   lessons/<slug>/occurrences/*.md   each time it happened
//   lessons/<slug>/verifications/*.md each check that it held
//   lessons/<slug>/actions.json       the remaining steps after a person accepts the product
//
// A lesson moves watching -> proposed -> acting -> verifying -> held, or not-held (needs a stronger product), or
// rejected. Merging the product PR is the approval. This script never merges anything.
//
//   node ledger.mjs start   [--repo <dir>]                          new branch worktree for ledger edits; prints its path
//   node ledger.mjs list    [--repo <dir>]                          lessons as JSON
//   node ledger.mjs record  [--repo <dir>] --slug <s> [--evidence <text>] [--title <t> --target <t> --lesson-file <md>]
//                           [--status <s>] [--product <PR url or none>] [--verify <sentence>] [--verify-after <YYYY-MM-DD>]
//   node ledger.mjs action  [--repo <dir>] --slug <s> --id <id> [--kind pr|task --title <t> --where <repo or owner>]
//                           [--status planned|open|done|dropped] [--ref <PR url>] [--note <text>]
//   node ledger.mjs verdict [--repo <dir>] --slug <s> --held yes|no --evidence <text>
//   node ledger.mjs sync    [--repo <dir>]                          move lessons on from their PR states (needs gh)
//   node ledger.mjs due     [--repo <dir>]                          lessons that need a follow-up
//   node ledger.mjs publish [--repo <dir>] --message <subject>      commit lessons/, push and open a PR (needs gh)
//
// <dir> is --repo, else $SKILLS_LESSONS_DIR, else the current directory's repository. GitHub is reached through
// `gh` only; when `gh` is missing or not signed in, sync skips PR states and publish commits locally and says so.
// Exit 0 with JSON on stdout; 1 with the cause on stderr; 2 on a usage error.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STATUSES = ["watching", "proposed", "acting", "verifying", "held", "not-held", "rejected"];
export const ACTION_KINDS = ["pr", "task"];
export const ACTION_STATUSES = ["planned", "open", "done", "dropped"];
// Without a `verify` sentence, a lesson held when it did not happen again for this many days after acceptance.
export const DEFAULT_VERIFY_DAYS = 14;
// A watching lesson with this many occurrences is promoted to proposed.
export const PROMOTE_AT = 2;

const day = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => day(new Date(d.getTime() + n * 86_400_000));
const finished = (a) => a.status === "done" || a.status === "dropped";

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: 120_000 });
  return { ok: !r.error && r.status === 0, out: (r.stdout ?? "").trim(), err: r.error ? `${cmd}: ${r.error.code === "ENOENT" ? "not installed" : r.error.message}` : (r.stderr || r.stdout || "").trim() };
}
function sh(cmd, args, cwd) {
  const r = run(cmd, args, cwd);
  if (!r.ok) throw new Error(`${cmd} ${args.join(" ")} failed: ${r.err.slice(0, 400)}`);
  return r.out;
}

export function ledgerRepo(flag, env = process.env, cwd = process.cwd()) {
  const dir = flag || env.SKILLS_LESSONS_DIR || cwd;
  const top = run("git", ["rev-parse", "--show-toplevel"], dir);
  if (!top.ok) throw new Error(`${dir} is not inside a git repository: pass --repo <dir> or set SKILLS_LESSONS_DIR`);
  return top.out;
}

export function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2] };
}
const renderFrontmatter = (meta, body) => `---\n${Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n${body.startsWith("\n") ? body : `\n${body}`}`;
export const slugOk = (slug) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug ?? "") && slug.length <= 60;

const dirOf = (repo, slug) => path.join(repo, "lessons", slug);
const mdFiles = (dir) => { try { return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort(); } catch { return []; } };
function readActions(repo, slug) {
  try { const a = JSON.parse(fs.readFileSync(path.join(dirOf(repo, slug), "actions.json"), "utf8")); return Array.isArray(a) ? a : []; } catch { return []; }
}

export function list(repo) {
  let slugs = [];
  try { slugs = fs.readdirSync(path.join(repo, "lessons"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { slugs = []; }
  return slugs.map((slug) => {
    let text = "";
    try { text = fs.readFileSync(path.join(dirOf(repo, slug), "LESSON.md"), "utf8"); } catch { text = ""; }
    const { meta, body } = parseFrontmatter(text);
    const occurrences = mdFiles(path.join(dirOf(repo, slug), "occurrences"));
    const acceptedAt = meta.accepted_at ?? "";
    return {
      slug, title: meta.title ?? "", status: meta.status ?? "", target: meta.target ?? "", product: meta.product ?? "none",
      firstSeen: meta.first_seen ?? "", acceptedAt, verify: meta.verify ?? "", verifyAfter: meta.verify_after ?? "",
      occurrences: occurrences.length, lastSeen: occurrences.at(-1)?.slice(0, 10) ?? "",
      occurrencesSinceAccepted: acceptedAt ? occurrences.filter((o) => o.slice(0, 10) > acceptedAt).length : 0,
      verifications: mdFiles(path.join(dirOf(repo, slug), "verifications")).length,
      actions: readActions(repo, slug),
      rule: (/## Rule\n+([\s\S]*?)(\n## |$)/.exec(body)?.[1] ?? "").trim().slice(0, 400),
    };
  });
}

function writeMeta(repo, slug, changes) {
  const file = path.join(dirOf(repo, slug), "LESSON.md");
  const { meta, body } = parseFrontmatter(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, renderFrontmatter({ ...meta, ...changes }, body));
}
function writeNumbered(dir, prefix, text) {
  fs.mkdirSync(dir, { recursive: true });
  let n = 1;
  while (fs.existsSync(path.join(dir, `${prefix}-${n}.md`))) n += 1;
  const file = path.join(dir, `${prefix}-${n}.md`);
  fs.writeFileSync(file, text.endsWith("\n") ? text : `${text}\n`);
  return file;
}

export function record(repo, { slug, evidence, title, target, lessonFile, status, product, verify, verifyAfter, now = new Date() }) {
  if (!slugOk(slug)) throw new Error("--slug must be lowercase words joined by hyphens, at most 60 characters");
  if (status && !STATUSES.includes(status)) throw new Error(`--status must be one of ${STATUSES.join(", ")}`);
  if (verifyAfter && !/^\d{4}-\d{2}-\d{2}$/.test(verifyAfter)) throw new Error("--verify-after must be YYYY-MM-DD");
  const dir = dirOf(repo, slug);
  const exists = fs.existsSync(path.join(dir, "LESSON.md"));
  const changes = {};
  if (!exists) {
    if (!title || !target || !lessonFile) throw new Error(`no lesson ${slug} yet: a new lesson needs --title, --target and --lesson-file`);
    fs.mkdirSync(dir, { recursive: true });
    const meta = { title, status: status ?? "watching", target, product: product ?? "none", first_seen: day(now) };
    fs.writeFileSync(path.join(dir, "LESSON.md"), renderFrontmatter(meta, fs.readFileSync(lessonFile, "utf8")));
  } else {
    if (status) changes.status = status;
    if (product) changes.product = product;
  }
  if (verify) changes.verify = verify;
  if (verifyAfter) changes.verify_after = verifyAfter;
  if (Object.keys(changes).length) writeMeta(repo, slug, changes);
  let promoted = false;
  if (evidence) {
    writeNumbered(path.join(dir, "occurrences"), day(now), evidence);
    const l = list(repo).find((x) => x.slug === slug);
    if (l.status === "watching" && !status && l.occurrences >= PROMOTE_AT) { writeMeta(repo, slug, { status: "proposed" }); promoted = true; }
  }
  return { ...list(repo).find((x) => x.slug === slug), promoted };
}

export function action(repo, { slug, id, kind, title, where, status, ref, note }) {
  if (!fs.existsSync(path.join(dirOf(repo, slug), "LESSON.md"))) throw new Error(`no lesson ${slug}: record it first`);
  if (!id) throw new Error("--id is required");
  if (kind && !ACTION_KINDS.includes(kind)) throw new Error(`--kind must be one of ${ACTION_KINDS.join(", ")}`);
  if (status && !ACTION_STATUSES.includes(status)) throw new Error(`--status must be one of ${ACTION_STATUSES.join(", ")}`);
  const actions = readActions(repo, slug);
  let a = actions.find((x) => x.id === id);
  if (!a) {
    if (!kind || !title) throw new Error(`no action ${id} yet: a new action needs --kind and --title`);
    a = { id, kind, title, where: where ?? null, status: "planned", ref: null, note: null };
    actions.push(a);
  }
  for (const [k, v] of Object.entries({ kind, title, where, status, ref, note })) if (v !== undefined) a[k] = v;
  fs.writeFileSync(path.join(dirOf(repo, slug), "actions.json"), `${JSON.stringify(actions, null, 2)}\n`);
  return a;
}

export function verdict(repo, { slug, held, evidence, now = new Date() }) {
  if (!["yes", "no"].includes(held)) throw new Error("--held must be yes or no");
  if (!evidence) throw new Error("--evidence must say what was checked and what it showed");
  if (!fs.existsSync(path.join(dirOf(repo, slug), "LESSON.md"))) throw new Error(`no lesson ${slug}`);
  writeNumbered(path.join(dirOf(repo, slug), "verifications"), day(now), `held: ${held}\n\n${evidence}`);
  writeMeta(repo, slug, { status: held === "yes" ? "held" : "not-held" });
  return list(repo).find((x) => x.slug === slug);
}

// The state of a GitHub PR: "open", "merged", "closed", or null when gh cannot tell.
export function prState(url) {
  const r = run("gh", ["pr", "view", url, "--json", "state"]);
  if (!r.ok) return null;
  try { return JSON.parse(r.out).state.toLowerCase(); } catch { return null; }
}
const isPr = (ref) => /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(ref ?? "");

// Applies every move that needs no judgment. stateOf is injectable for tests.
export function sync(repo, { stateOf = prState, now = new Date() } = {}) {
  const today = day(now);
  const changed = [];
  const unknown = [];
  const state = (url) => { const s = stateOf(url); if (!s) unknown.push(url); return s; };
  for (const l of list(repo)) {
    const set = (changes, why) => { writeMeta(repo, l.slug, changes); Object.assign(l, changes); changed.push({ slug: l.slug, ...changes, why }); };
    if (l.status === "proposed" && isPr(l.product)) {
      const s = state(l.product);
      if (s === "closed") set({ status: "rejected" }, "product PR closed");
      if (s === "merged") {
        l.acceptedAt = today;
        set({ status: l.actions.every(finished) ? "verifying" : "acting", accepted_at: today, ...(l.verifyAfter ? {} : { verify_after: addDays(now, DEFAULT_VERIFY_DAYS) }) }, "product PR merged");
      }
    }
    if (l.status === "acting") {
      for (const a of l.actions.filter((x) => x.status === "open" && isPr(x.ref))) {
        const s = state(a.ref);
        if (s === "merged" || s === "closed") { a.status = s === "merged" ? "done" : "dropped"; action(repo, { slug: l.slug, id: a.id, status: a.status }); changed.push({ slug: l.slug, action: a.id, status: a.status, why: `action PR ${s}` }); }
      }
      if (l.actions.every(finished)) set({ status: "verifying" }, "every action finished");
    }
    if (["acting", "verifying", "held"].includes(l.status) && l.occurrencesSinceAccepted > 0) set({ status: "not-held" }, `${l.occurrencesSinceAccepted} occurrence(s) after acceptance`);
    if (l.status === "verifying" && !l.verify && l.verifyAfter && today >= l.verifyAfter) set({ status: "held" }, "quiet until verify_after");
  }
  return { changed, unknown, gh: unknown.length ? "unavailable or PR not found: states not read for the listed URLs" : "ok" };
}

// Lessons a follow-up has work on.
export function due(lessons, { now = new Date() } = {}) {
  const today = day(now);
  const out = [];
  for (const l of lessons) {
    const why = [];
    if (["proposed", "not-held"].includes(l.status) && isPr(l.product)) why.push("answer review comments on the product PR");
    if (l.status === "proposed" && l.product === "none") why.push("make the product: none was opened");
    if (l.status === "acting" && l.actions.some((a) => a.status === "planned")) why.push("start planned actions");
    if (l.status === "acting" && l.actions.some((a) => a.status === "open" && a.kind === "task")) why.push("check open tasks with their owner");
    if (l.status === "verifying" && l.verify && l.verifyAfter && today >= l.verifyAfter) why.push("judge the verification");
    if (l.status === "not-held") why.push("make a stronger product");
    if (why.length) out.push({ slug: l.slug, status: l.status, why });
  }
  return out;
}

const ghReady = () => run("gh", ["auth", "status"]).ok;

export function start(repo, { now = new Date() } = {}) {
  const base = run("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], repo);
  if (base.ok) run("git", ["fetch", "-q", "origin", base.out.replace(/^origin\//, "")], repo);
  const from = base.ok ? base.out : "HEAD";
  const branch = `lessons/${day(now)}-${now.getTime().toString(36)}`;
  const worktree = path.join(os.homedir(), ".agents", "worktrees", path.basename(repo), branch.replace("/", "-"));
  sh("git", ["worktree", "add", "-q", "-b", branch, worktree, from], repo);
  return { repo, worktree, branch, from };
}

export function publish(repo, { message }) {
  if (!message) throw new Error("--message needs a Conventional Commit subject, such as \"docs(lessons): record skipped-test-run\"");
  sh("git", ["add", "--", "lessons"], repo);
  if (!run("git", ["diff", "--cached", "--quiet"], repo).ok) sh("git", ["commit", "-q", "-m", message], repo);
  else return { committed: false, pr: null, note: "no ledger changes to publish" };
  const branch = sh("git", ["rev-parse", "--abbrev-ref", "HEAD"], repo);
  const remote = run("git", ["remote", "get-url", "origin"], repo);
  if (!remote.ok) return { committed: true, branch, pr: null, note: "no origin remote: the commit stays on this local branch" };
  if (!/github\.com/.test(remote.out)) return { committed: true, branch, pr: null, note: `origin is not GitHub (${remote.out}): push ${branch} and open the PR by hand` };
  if (!ghReady()) return { committed: true, branch, pr: null, note: `gh is missing or not signed in: run gh auth login, then push ${branch} and open the PR` };
  const push = run("git", ["push", "-q", "-u", "origin", branch], repo);
  if (!push.ok) return { committed: true, branch, pr: null, note: `push failed: ${push.err.slice(0, 300)}` };
  const pr = run("gh", ["pr", "create", "--head", branch, "--title", message, "--body", "Lessons ledger update from /retrospect. Merge to keep these records; nothing merges on its own."], repo);
  return pr.ok ? { committed: true, branch, pr: pr.out.split("\n").at(-1) } : { committed: true, branch, pr: null, note: `gh pr create failed: ${pr.err.slice(0, 300)}` };
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const m = /^--([a-z-]+)$/.exec(argv[i]);
    if (!m || argv[i + 1] === undefined) throw Object.assign(new Error(`unexpected argument ${argv[i]}: options take the form --name value`), { usage: true });
    opts[m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[i + 1];
    i += 1;
  }
  return opts;
}

export function main(argv) {
  const [cmd, ...rest] = argv;
  const commands = ["start", "list", "record", "action", "verdict", "sync", "due", "publish"];
  try {
    if (!commands.includes(cmd)) throw Object.assign(new Error(`first argument must be one of ${commands.join(", ")}`), { usage: true });
    const { repo: repoFlag, ...opts } = parseArgs(rest);
    const repo = ledgerRepo(repoFlag);
    const result = {
      start: () => start(repo), list: () => list(repo), record: () => record(repo, opts), action: () => action(repo, opts),
      verdict: () => verdict(repo, opts), sync: () => sync(repo), due: () => due(list(repo)), publish: () => publish(repo, opts),
    }[cmd]();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (e) {
    process.stderr.write(`ledger.mjs ${cmd ?? ""}: ${e.message}\n`);
    return e.usage ? 2 : 1;
  }
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
