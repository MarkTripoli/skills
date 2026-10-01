// Reads the omp session JSONL a terminal phase leaves (`--session-dir`): the orchestrator's session and one
// child session per spawned subagent, each with its agent, resolved model, first prompt and tool calls.
// Review authorship requires successful full-content writes or their same-child native edit lineage.

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

function jsonlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? jsonlFiles(path.join(dir, e.name)) : e.name.endsWith(".jsonl") ? [path.join(dir, e.name)] : []));
}

// Parse only the observed literal cat transport, never run captured commands or expand shell syntax.
// A quoted delimiter makes the body data. Extra commands, substitutions, append and unquoted
// heredocs remain opaque; a success receipt or a destination alone cannot prove their output bytes.
function literalShellWrite(command) {
  const word = `(?:[\\w./-]+|'[\\w./-]+'|"[\\w./-]+")`;
  const match = new RegExp(`^(?:mkdir -p (${word}) && )?cat > (${word}) <<'([A-Za-z_]\\w*)'\\n([\\s\\S]*)\\n\\3\\n?$`).exec(command);
  if (!match) return null;
  const unquotePath = (value) => value.replace(/^['"]|['"]$/g, "");
  const target = unquotePath(match[2]);
  if (match[1] && path.posix.normalize(unquotePath(match[1])) !== path.posix.dirname(target)) return null;
  if (match[4].split("\n").includes(match[3])) return null;
  return { path: target, content: `${match[4]}\n` };
}

function authoredWrite(call) {
  if (call?.name === "write" && typeof call.args.path === "string" && typeof call.args.content === "string") return call.args;
  if (call?.name === "bash" && typeof call.args.command === "string") return literalShellWrite(call.args.command);
  return null;
}

// Relative paths need an observed cwd to bind to absolute native receipt paths.
function receiptPath(target, cwd) {
  if (typeof target !== "string" || !target || /[$`\0]|^[A-Za-z][\w+.-]*:|^~/.test(target)) return null;
  if (path.isAbsolute(target)) return path.normalize(target);
  return typeof cwd === "string" && path.isAbsolute(cwd) ? path.resolve(cwd, target) : path.normalize(target);
}

function authoredEdit(call, details, cwd, owned) {
  if (call.name !== "edit" || details?.op !== "update" || typeof details.oldText !== "string" || typeof details.newText !== "string" || limitedRead(details)) return null;
  const headers = [...String(call.args.input ?? "").matchAll(/^\[([^\]\n]+)#[A-Fa-f0-9]{4}\]$/gm)];
  const targets = [...(typeof call.args.path === "string" ? [call.args.path] : []), ...headers.map((h) => h[1])];
  const target = receiptPath(details.path, cwd);
  // A snapshot names one file. Do not attribute multi-file patches or infer targets from diffs.
  if (!target || !targets.length || headers.length > 1 || targets.some((t) => receiptPath(t, cwd) !== target) || owned.get(target) !== details.oldText) return null;
  return { path: target, content: details.newText };
}

export function readSessions(dir) {
  return jsonlFiles(dir).map((file) => {
    const s = { file, id: null, child: false, agent: null, model: null, cwd: null, task: "", calls: [], authoredWrites: [], texts: [], lastTime: 0 };
    const owned = new Map();
    const receipts = new Set();
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      let d;
      try {
        d = JSON.parse(line);
      } catch {
        continue;
      }
      // omp stamps every child's `session_exit` when the parent closes, long after the child's last real entry; ignore it.
      const at = d.customType === "session_exit" ? 0 : Date.parse(d.timestamp ?? "");
      if (at > s.lastTime) s.lastTime = at;
      if (d.type === "session") {
        s.id = d.id;
        s.child = Boolean(d.parentSession);
        if (typeof d.cwd === "string" && path.isAbsolute(d.cwd)) s.cwd = d.cwd;
      } else if (d.type === "model_change" && !s.model) s.model = d.model;
      else if (d.type === "session_init") {
        s.agent = d.agent ?? null;
        s.task += `${d.task ?? ""}\n`;
        if (d.resolvedModel) s.model = d.resolvedModel;
      } else if (d.type === "message" && d.message?.role === "user") {
        const c = d.message.content;
        s.task += `${typeof c === "string" ? c : (c ?? []).map((p) => p.text ?? "").join("\n")}\n`;
      } else if (d.type === "message" && d.message?.role === "assistant") {
        for (const part of d.message.content ?? []) {
          if (part.type === "toolCall") s.calls.push({ id: part.id, name: part.name, args: part.arguments ?? {} });
          else if (part.type === "text") s.texts.push(part.text);
        }
      } else if (d.type === "message" && d.message?.role === "toolResult") {
        const matches = s.calls.filter((c) => typeof c.id === "string" && c.id === d.message.toolCallId);
        if (matches.length !== 1 || receipts.has(d.message.toolCallId)) continue;
        receipts.add(d.message.toolCallId);
        const call = matches[0];
        if (d.message.isError || (d.message.toolName && d.message.toolName !== call.name)) continue;
        if (d.message.details?.exitCode !== undefined && d.message.details.exitCode !== 0) continue;
        if (["read", "bash"].includes(call.name)) call.result = { content: d.message.content, details: d.message.details };
        const written = authoredWrite(call);
        const edited = s.child && d.message.toolName === "edit" ? authoredEdit(call, d.message.details, s.cwd, owned) : null;
        // Native children may write a reserved staging file or external scratch. Publication can
        // copy either unchanged; bind authored bytes, not a staging UUID or publisher's wrapper.
        const authored = written ?? edited;
        if (authored) s.authoredWrites.push({ path: authored.path, sha256: createHash("sha256").update(authored.content).digest("hex") });
        if (written) {
          const target = receiptPath(written.path, s.cwd);
          const native = d.message.details?.resolvedPath;
          if (target && (native === undefined || receiptPath(native, s.cwd) === target)) owned.set(target, written.content);
        } else if (edited) owned.set(edited.path, edited.content);
      }
    }
    return s;
  });
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Shell segments of a command, split on unquoted `;`, `&`, `|` and newlines.
const segments = (command) => {
  const out = [];
  let quote = null;
  let current = "";
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === "\\" && quote === '"') current += ch + (command[++i] ?? "");
      else {
        current += ch;
        if (ch === quote) quote = null;
      }
    } else if (ch === "\\") current += ch + (command[++i] ?? "");
    else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (";&|\n".includes(ch)) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  return [...out, current];
};
// A `git commit` the command runs. The prompt handed to a nested `omp -p` may mention `git commit`; that segment is not a commit here.
// `eval '…'` and `sh -c '…'` wrap a whole command line in one quoted word, so their argument is read as a command line of its own.
const WRAPPED = /^\s*(?:eval|(?:ba|z)?sh\s+-c)\s+(["'])([\s\S]*)\1\s*$/;
const unquote = (quote, text) => (quote === "'" ? text.replace(/'\\''/g, "'") : text.replace(/\\(["\\$`])/g, "$1"));
const runsCommit = (command) => segments(command).some((seg) => {
  const wrapped = WRAPPED.exec(seg);
  if (wrapped) return runsCommit(unquote(wrapped[1], wrapped[2]));
  return !/^\s*(?:\w+=\S+\s+)*omp\b/.test(seg) && /\bgit\b[^\n]*\bcommit\b/.test(seg);
});
const bashCommits = (s) => s.calls.filter((c) => c.name === "bash" && runsCommit(String(c.args.command ?? "")));

// Did this session write `file` (by basename)? A write call on it, an omp edit whose `input` opens with its
// `[<path>#` header, an edit with a path, or a shell redirect into it. Writes through `eval` or a script name
// no parseable target; the mtime rule in `sessionProblems` covers those.
export function wrote(s, file) {
  return s.calls.some((c) => {
    if (c.name === "edit" && new RegExp(`^\\[[^\\]\\n]*${escape(file)}#`, "m").test(String(c.args.input ?? ""))) return true;
    if (c.name === "write" || c.name === "edit") return String(c.args.path ?? "").endsWith(file);
    return c.name === "bash" && new RegExp(`(?:(?<![=\\-])>{1,2}|\\btee\\s+(?:-a\\s+)?)\\s*["']?[^\\s()"']*${escape(file)}["']?(?=$|[\\s;&|])`).test(String(c.args.command ?? ""));
  });
}

// Problems with the claim "a builder subagent made the commits and distinct stronger reviewer subagents wrote the records".
// `records` are review records ({file, reviewer_model, group, mtime}); `subjects` the builder commit subjects.
// `timesPreserved` says the records' mtimes are the originals: each must then be no later than the last entry of the
// session that wrote it, so a record touched after its reviewer finished (an orchestrator patch) fails.
// `separate` are top-level sessions the orchestrator itself started for the builder (`omp -p --model`), read from their own
// directory: they stand in for the agent-implementer subagent, and no subagent builder may exist beside them.
export function sessionProblems({ sessions, records, subjects, economy, strongest, timesPreserved = false, separate = null, changed = [] }) {
  const out = [];
  const orchestrator = sessions.filter((s) => !s.child);
  if (orchestrator.length !== 1) out.push(`sessions: ${orchestrator.length} orchestrator sessions, expected 1`);
  if (orchestrator.some((s) => bashCommits(s).length)) out.push("sessions: the orchestrator ran git commit itself; a builder subagent must commit");
  const subagents = sessions.filter((s) => s.child && s.agent === "agent-implementer");
  const bare = (m) => String(m ?? "").replace(/^[^/]+\//, "");
  if (separate) {
    if (subagents.length) out.push("sessions: a task subagent built; this run has no pinned builder definition, so the builder must be a separate `omp -p --model` session");
    if (!separate.length) out.push("sessions: no separate builder session recorded; the orchestrator did not start one through `omp`, or the runner could not attribute it");
  } else if (!subagents.length) out.push("sessions: no agent-implementer subagent session");
  const builders = separate ?? subagents;
  for (const b of builders) if (bare(b.model) !== bare(economy)) out.push(`sessions: builder ${b.id} ran ${b.model}, expected the economy candidate ${economy}`);
  for (const subject of subjects) if (!builders.some((b) => bashCommits(b).some((c) => JSON.stringify(c.args).includes(subject)))) out.push(`sessions: no builder session ran git commit for "${subject}"`);
  // The files the task is about were written by a builder session: attributed to it, not assumed from the commit.
  for (const file of changed) if (!builders.some((b) => wrote(b, file))) out.push(`sessions: no builder session wrote ${file}`);
  // Only the builder changes the files the task is about; a reviewer or the orchestrator that writes one has done the builder's work.
  for (const s of sessions.filter((x) => !builders.includes(x))) for (const file of changed) if (wrote(s, file)) out.push(`sessions: ${s.agent ?? "orchestrator"} ${s.id} wrote ${file}; only the builder may change it`);
  if (economy === strongest) out.push("profile: the economy and strongest candidates are the same model");
  const transcript = builders.flatMap((b) => b.texts.flatMap((t) => t.split("\n")).map((l) => l.trim()).filter((l) => l.length >= 80));
  const writers = new Map();
  for (const r of records) {
    const who = [...sessions, ...(separate ?? [])].filter((s) =>
      r.sha256 && s.authoredWrites?.some((p) => p.sha256 === r.sha256));
    if (!who.length) {
      out.push(`sessions: no session wrote ${r.file}`);
      continue;
    }
    for (const s of who) {
      const label = `${r.file} written by ${s.agent ?? "orchestrator"} ${s.id}`;
      if (!s.child) out.push(`sessions: ${label}: the orchestrator wrote a review record`);
      // Immutable publication can follow the child's exit. Its digest already binds those bytes;
      // only direct legacy writes need the original file's mtime to detect a later parent edit.
      if (timesPreserved && s.child && wrote(s, r.file) && r.mtime > s.lastTime) out.push(`sessions: ${label}: the file changed after its session ended (${new Date(r.mtime).toISOString()} > ${new Date(s.lastTime).toISOString()}); something else edited the record`);
      if (builders.includes(s)) out.push(`sessions: ${label}: the builder wrote a review record`);
      if (s.model !== strongest) out.push(`sessions: ${label}: ran ${s.model}, expected the strongest candidate ${strongest}`);
      // The skill has a reviewer write `unobserved: <requested>` when it cannot see its own model; the session is the observation.
      if (![s.model, `unobserved: ${s.model}`].includes(r.reviewer_model)) out.push(`sessions: ${r.file}: reviewer_model ${JSON.stringify(r.reviewer_model)} does not match its session model ${s.model}`);
      if (transcript.some((l) => s.task.includes(l))) out.push(`sessions: ${label}: its first prompt contains builder transcript text`);
    }
    writers.set(r.file, who.map((s) => s.id));
  }
  // The two final reviewers are separate sessions.
  const finals = records.filter((r) => r.group === "final").map((r) => writers.get(r.file)?.[0]);
  if (new Set(finals.filter(Boolean)).size < finals.filter(Boolean).length) out.push("sessions: one session wrote both final records; they must be separate fresh reviewers");
  return out;
}

// Keep attempted paths for provenance even when the call failed or its output was incomplete.
// Resolve only assignments recorded in the same command; never evaluate captured shell/source.
const skillRefs = (s) => s.calls.filter((c) => c.name === "read" || c.name === "bash").flatMap((call) => {
  let text = String(call.name === "read" ? call.args.path ?? "" : call.args.command ?? "");
  const vars = Object.fromEntries([...text.matchAll(/(?:^|[;&\n]\s*|\bexport\s+)([A-Za-z_]\w*)=("[^"]*"|'[^']*'|[^\s;&|]+)/g)].map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
  for (let i = 0; i < 3; i++) text = text.replace(/\$(?:\{(\w+)\}|(\w+))/g, (whole, a, b) => vars[a ?? b] ?? whole);
  return [...text.matchAll(/skill:\/\/([\w-]+)|([^\s"'`;&|]*?)\/([\w-]+)\/SKILL\.md/g)].map((m) => ({ name: m[1] ?? m[3], where: m[1] ? "skill://" : m[2], path: m[0], call, resolved: text, cwd: call.args.cwd ?? s.cwd }));
});

// Whole native reads and simple literal cats retain transport proof for relocated captures.
// Compound cats need exact installed source bytes in addition to a literal read target.
function wholeSkillReader(ref) {
  if (ref.call.name === "read") return ref.resolved === ref.path || ref.resolved === `${ref.path}:raw`;
  // Single quotes suppress shell expansion; the provenance resolver alone cannot prove it.
  if (/'[^']*\$[^']*'/.test(String(ref.call.args.command ?? ""))) return false;
  const word = `(?:[\\w./-]+|'[\\w./-]+'|"[\\w./-]+")`;
  const setup = `(?:\\s*(?:export\\s+)?[A-Za-z_]\\w*=${word}\\s*(?:;|&&)\\s*)*`;
  const match = new RegExp(`^${setup}cat\\s+(${word}(?:\\s+${word})*)\\s*$`).exec(ref.resolved);
  if (!match) return false;
  const files = match[1].match(new RegExp(word, "g")).map((f) => f.replace(/^["']|["']$/g, ""));
  // Combined SKILL documents need separate source-byte proof below.
  return files[0] === ref.path && files.filter((f) => f.endsWith("/SKILL.md")).length === 1;
}

function compoundSkillReader(ref) {
  if (ref.call.name !== "bash") return false;
  const command = String(ref.call.args.command ?? "");
  const parts = segments(command);
  // Do not infer directory changes or instruction reads from executable wrappers.
  if (parts.some((p) => /^\s*(?:cd|pushd|popd|eval)\b|^\s*(?:ba|z)?sh\s+-c\b/.test(p))) return false;
  const word = `(?:[\\w./-]+|'[\\w./-]+'|"[\\w./-]+")`;
  const assignment = new RegExp(`^\\s*(?:export\\s+)?([A-Za-z_]\\w*)=(${word})\\s*$`);
  const cat = new RegExp(`^\\s*cat\\s+(${word}(?:\\s+${word})*)\\s*$`);
  const vars = {};
  let offset = 0;
  for (const part of parts) {
    const before = command[offset - 1];
    const after = command[offset + part.length];
    const standalone = before !== "|" && after !== "|" &&
      (before !== "&" || command[offset - 2] === "&") &&
      (after !== "&" || command[offset + part.length + 1] === "&");
    offset += part.length + 1;
    const setup = assignment.exec(part);
    if (setup) {
      vars[setup[1]] = setup[2].replace(/^["']|["']$/g, "");
      continue;
    }
    // Resolve only prior literal assignments. Single-quoted variables are not expanded.
    if (!standalone || /'[^']*\$[^']*'/.test(part)) continue;
    const resolved = part.replace(/\$(?:\{(\w+)\}|(\w+))/g, (whole, a, b) => vars[a ?? b] ?? whole);
    const match = cat.exec(resolved);
    if (match && match[1].match(new RegExp(word, "g")).some((f) => f.replace(/^["']|["']$/g, "") === ref.path)) return true;
  }
  return false;
}

function skillDocument(text, name) {
  const document = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  return Boolean(document && new RegExp(`^name:\\s*${escape(name)}\\s*$`, "m").test(document[1]) && document[2].trim());
}

function limitedRead(details) {
  if (!details || typeof details !== "object") return false;
  return Object.entries(details).some(([key, value]) =>
    ((/truncat|omitt|partial/i.test(key) || key === "limits") && Boolean(value) && (typeof value !== "object" || Object.keys(value).length > 0)) ||
    (value && typeof value === "object" && limitedRead(value)));
}

function completeSkillRead(ref) {
  const result = ref.call.result;
  if (!result || limitedRead(result.details)) return false;
  const parts = result.content;
  let text = typeof parts === "string" ? parts : Array.isArray(parts) && parts.every((p) => p.type === "text" && typeof p.text === "string") ? parts.map((p) => p.text).join("\n") : "";
  // Inspect the model-visible text, not details.displayContent (which can itself be truncated).
  if (!text || /^\[(?:[^\]\n]*(?:truncated|omitted)|Showing lines\b)[^\n]*\]/im.test(text) || /^(?:…|\.\.\.)\s*$/m.test(text)) return false;
  if (!wholeSkillReader(ref)) {
    if (!compoundSkillReader(ref)) return false;
    const source = receiptPath(ref.path, ref.cwd);
    if (!source || !path.isAbsolute(source)) return false;
    try {
      const expected = fs.readFileSync(source, "utf8");
      return skillDocument(expected, ref.name) && text.includes(expected);
    } catch {
      // A compound stream cannot prove completeness from a path or count alone.
      return false;
    }
  }
  if (ref.call.name === "read" && text.startsWith("[")) {
    const header = /^\[[^\n]+#[A-Fa-f0-9]{4}\]\n/.exec(text);
    if (!header) return false;
    const lines = text.slice(header[0].length).replace(/\n+$/, "").split("\n").map((line) => /^(\d+):(.*)$/.exec(line));
    if (!lines.every((line, i) => line && Number(line[1]) === i + 1)) return false;
    if (!Number.isInteger(result.details?.totalLines) || lines.length !== result.details.totalLines) return false;
    text = lines.map((line) => line[2]).join("\n");
  } else if (ref.call.name === "read") {
    // A raw range is not whole-file evidence. A raw whole read still needs actual SKILL bytes.
    if (ref.resolved !== `${ref.path}:raw`) return false;
    if (Object.hasOwn(result.details ?? {}, "totalLines") && (!Number.isInteger(result.details.totalLines) || text.replace(/\n$/, "").split("\n").length !== result.details.totalLines)) return false;
  } else text = text.replace(/\n{2,}Wall time: [\d.]+ seconds\s*$/, "");
  return skillDocument(text, ref.name);
}

// Bind completeness to successful model-visible output and under-test provenance.
// Whole-file transports survive relocation; compound output requires the captured source.
export function skillLoadProblems({ sessions, names }) {
  const out = [];
  const underTest = (r) => r.where !== "skill://" && !/[$`]/.test(r.where) && /(^|\/)(\.dist\/skills|\.omp\/skills)$/.test(r.where);
  const refs = new Map(sessions.map((s) => [s, skillRefs(s)]));
  for (const s of sessions) {
    for (const r of refs.get(s).filter((x) => !underTest(x))) out.push(`skills: ${s.agent ?? "orchestrator"} ${s.id} loaded ${r.name} from ${r.where === "skill://" ? "skill://" : `${r.where}/${r.name}/SKILL.md`}, not from the run's .dist/skills or the project's .omp/skills`);
  }
  for (const name of names) if (!sessions.some((s) => s.child && refs.get(s).some((r) => r.name === name && underTest(r) && completeSkillRead(r)))) out.push(`skills: no child session completely read ${name}/SKILL.md from the run's .dist/skills or the project's .omp/skills with successful untruncated output`);
  return [...new Set(out)];
}
