// Helpers shared by the eval runner and the scenarios: artifact lookup, frontmatter, the handoff fence,
// and small assertion builders that return failure strings instead of throwing, so one phase reports
// every miss at once.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { indexFileExists, readArtifactIndex } from "../shared/task-artifacts.mjs";
import { execFileSync, spawn } from "node:child_process";

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

// Indexed artifacts are digest-validated and selected by their semantic current pointers.
// Numbered directory scanning is reserved for genuinely legacy tasks without an index.
export function artifacts(taskDir) {
  if (!fs.existsSync(taskDir)) return [];
  if (indexFileExists(path.join(taskDir, "index.json"))) {
    const index = readArtifactIndex(taskDir);
    return Object.values(index.artifactSeries).flatMap((series) =>
      [...series.iterations].reverse().map((record) => {
        const file = record.path;
        const text = fs.readFileSync(path.join(taskDir, file), "utf8");
        return { file, path: path.join(taskDir, file), text, fm: frontmatter(text) ?? {}, record, current: record.id === series.current };
      }));
  }
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
  return artifacts(taskDir).find((a) => a.fm.type === type && a.current !== false) ?? null;
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
const TEMPLATE_FIELDS = /\{(artifact_link|artifact_file|summary|source_file|implementation_command|next_command|review_check|known_limits|needed|completed_phase|next_phase|task_dir|child_slug|child_issue|child_start_command|report_link)\}/g;
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

// The environment a live session runs in: the operator's Slack services stay out of reach. No `SLACK_*` variables, a direct-thread
// env file that does not exist, and a failing `slack-coordinator` stub ahead of the real one on PATH. This hides the usual routes;
// it is not a sandbox (an absolute path to the daemon or its socket under HOME still works).
export function isolatedEnv(env = process.env) {
  const out = Object.fromEntries(Object.entries(env).filter(([k]) => !/^SLACK_/i.test(k)));
  const stubs = fs.mkdtempSync(path.join(env.TMPDIR ?? "/tmp", "no-slack-"));
  fs.writeFileSync(path.join(stubs, "slack-coordinator"), "#!/bin/sh\necho 'slack-coordinator is unavailable in evals' >&2\nexit 1\n", { mode: 0o755 });
  out.PATH = [stubs, env.PATH].filter(Boolean).join(path.delimiter);
  out.SLACK_AGENT_ENV_FILE = path.join(stubs, "no-such-slack-env");
  return out;
}

// `spawn` for a session that runs in an `isolatedEnv`: the stub directory goes when the process ends or fails to start.
export function spawnIsolated(command, args, { isolated, ...options }) {
  const child = spawn(command, args, options);
  const done = () => disposeIsolatedEnv(isolated);
  child.once("close", done);
  child.once("error", done);
  return child;
}

// Removes the stub directory `isolatedEnv` made, once the session that used it has closed.
export function disposeIsolatedEnv(env) {
  const dir = env.SLACK_AGENT_ENV_FILE ? path.dirname(env.SLACK_AGENT_ENV_FILE) : "";
  if (path.basename(dir).startsWith("no-slack-")) fs.rmSync(dir, { recursive: true, force: true });
}

// A directory to put first on PATH so every `omp` the orchestrator starts itself records its session under `nestedDir`: a call that
// already names `--session-dir` (the runner's own) passes through. A session started by absolute path, or from a script that resets
// PATH, leaves `nestedDir` empty and the grader fails the run rather than guess who built.
export function ompShim(nestedDir, env = process.env) {
  const real = execFileSync("sh", ["-c", "command -v omp"], { env, encoding: "utf8" }).trim();
  const dir = fs.mkdtempSync(path.join(env.TMPDIR ?? "/tmp", "omp-shim-"));
  fs.mkdirSync(nestedDir, { recursive: true });
  const q = (x) => `'${x.replace(/'/g, "'\\''")}'`;
  fs.writeFileSync(path.join(dir, "omp"), `#!/bin/sh\nfor a in "$@"; do case "$a" in --session-dir|--session-dir=*) exec ${q(real)} "$@";; esac; done\nexec ${q(real)} --session-dir ${q(nestedDir)} "$@"\n`, { mode: 0o755 });
  return dir;
}

// The arguments of every live phase session. `--no-skills` keeps the operator's global skills out of the run; the prompt names each
// SKILL.md by path.
export function ompArgs({ prompt, sessionDir = null, maxMinutes, model = null }) {
  return ["-p", "--auto-approve", "--no-skills", "--mode", "json", ...(sessionDir ? ["--session-dir", sessionDir] : ["--no-session"]), `--max-time=${maxMinutes}m`, ...(model !== null ? ["--model", model] : []), prompt];
}

// A scenario or phase may set `stubs: { <command>: "<sh body>" }`. Each becomes an executable first on PATH that appends
// "<command> <args>" (one line per call, newlines inside an argument folded to spaces) to `stub-calls.log` in the phase's
// result directory. The body can append diagnostic state through the quoted shell variable `stub_log` and exit with any code.
// Checks read the log as `ctx.stubCalls`, live or re-graded, so a refusal can be graded by the calls that never happened.
export function writeStubs(stubs, logFile) {
  if (!stubs || !Object.keys(stubs).length) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-eval-stubs-"));
  const quote = value => `'${value.replace(/'/g, "'\\''")}'`;
  for (const [name, body] of Object.entries(stubs)) {
    fs.writeFileSync(path.join(dir, name), `#!/bin/sh\nstub_log=${quote(logFile)}\n{ printf '%s' "${name} $*" | tr '\\n' ' '; echo; } >> "$stub_log"\n${body}\n`, { mode: 0o755 });
  }
  return dir;
}

export function stubCalls(out) {
  const file = path.join(out, "stub-calls.log");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean) : [];
}

// True when a logged `glab`/`gh` call writes to the host: an `api` call with a method other than GET, or with a body flag
// (`-f -F --field --raw-field --form --input`) and no explicit GET (the clients default to POST then), or a create/update/
// note/merge/approve/close/review/comment subcommand. Every scenario that grades "nothing posted" uses this one detector.
export function isHostWrite(call) {
  const m = /^(glab|gh)\s+(.*)$/s.exec(call.trim());
  if (!m) return false;
  const rest = m[2];
  if (/^(?:-\S+\s+)*api\b/.test(rest)) {
    const method = /(?:--method|-X)[ =]*([A-Za-z]+)/.exec(rest)?.[1]?.toUpperCase();
    if (method) return method !== "GET";
    return /(?:^|\s)(?:-f|-F|--field|--raw-field|--form|--input)(?=[\s=]|$)/.test(rest);
  }
  return /(?:^|\s)(?:mr|pr|issue)\s+(?:create|update|edit|note|comment|merge|approve|close|review|reopen)\b/.test(rest);
}

// The environment of one phase session: the isolated base, then PATH ordered stubs, omp shim, isolated stubs; `unsetEnv` removes every
// matching name; `overrides` ({ NAME: value | null }) wins last. Pure over `base`, so one phase's environment never reaches another's.
export function sessionEnv(base, { shim = null, stubDir = null, unsetEnv = null, overrides = {} } = {}) {
  const env = { ...base };
  if (shim) env.PATH = [shim, env.PATH].join(path.delimiter);
  if (stubDir) env.PATH = [stubDir, env.PATH].join(path.delimiter);
  // Isolation owns SLACK_* and PATH: no pattern removes them.
  for (const pattern of [unsetEnv].flat().filter(Boolean)) for (const name of Object.keys(env)) if (pattern.test(name) && !/^(?:SLACK_|PATH$)/i.test(name)) delete env[name];
  for (const [name, value] of Object.entries(overrides)) {
    if (/^PATH$/i.test(name)) throw new Error("scenario env may not set PATH; use stubs");
    // Isolation hides the operator's Slack; a scenario override may not hand it back.
    if (/^SLACK_/i.test(name)) throw new Error(`scenario env may not set ${name}; Slack stays isolated`);
    value === null ? delete env[name] : (env[name] = value);
  }
  return env;
}

// Stub-host phases receive no operator GitHub/GitLab token or config, even when a real host client is invoked by absolute path.
// Every ssh git transport fails instead of using the operator's key.
export const NO_HOST = { unsetEnv: /^(?:GITLAB_|GLAB_|GITHUB_|GH_)/, env: { GLAB_CONFIG_DIR: "/nonexistent-glab-config", GH_CONFIG_DIR: "/nonexistent-gh-config", GIT_SSH_COMMAND: "false" } };
