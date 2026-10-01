// Reads the omp session JSONL a terminal phase leaves (`--session-dir`): the orchestrator's session and one
// child session per spawned subagent, each with its agent, resolved model, first prompt and tool calls.
// A reviewer record is only credited to a separate agent when a child session wrote the file.

import fs from "node:fs";
import path from "node:path";

function jsonlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? jsonlFiles(path.join(dir, e.name)) : e.name.endsWith(".jsonl") ? [path.join(dir, e.name)] : []));
}

export function readSessions(dir) {
  return jsonlFiles(dir).map((file) => {
    const s = { file, id: null, child: false, agent: null, model: null, task: "", calls: [], publications: [], texts: [], lastTime: 0 };
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
      } else if (d.type === "message" && d.message?.role === "toolResult" && !d.message.isError) {
        const call = s.calls.find((c) => c.id === d.message.toolCallId);
        const command = String(call?.args.command ?? "");
        if (call?.name !== "bash" || !/task-artifacts\.mjs\s+record\b/.test(command)) continue;
        const staging = /\.artifact-staging\/[a-f0-9-]+\.md/.exec(command)?.[0];
        if (!staging || !wrote(s, staging)) continue;
        const text = (d.message.content ?? []).filter((p) => p.type === "text").map((p) => p.text).join("\n");
        for (const match of text.matchAll(/\{[^{}]*"sha256"[^{}]*\}/g)) {
          try {
            const record = JSON.parse(match[0]);
            if (typeof record.path === "string" && typeof record.sha256 === "string") s.publications.push(record);
          } catch { /* Non-JSON tool prose is not publication proof. */ }
        }
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
    const who = [...sessions, ...(separate ?? [])].filter((s) => wrote(s, r.file) ||
      (r.sha256 && s.publications?.some((p) => p.path === r.file && p.sha256 === r.sha256)));
    if (!who.length) {
      out.push(`sessions: no session wrote ${r.file}`);
      continue;
    }
    for (const s of who) {
      const label = `${r.file} written by ${s.agent ?? "orchestrator"} ${s.id}`;
      if (!s.child) out.push(`sessions: ${label}: the orchestrator wrote a review record`);
      if (timesPreserved && s.child && r.mtime > s.lastTime) out.push(`sessions: ${label}: the file changed after its session ended (${new Date(r.mtime).toISOString()} > ${new Date(s.lastTime).toISOString()}); something else edited the record`);
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

// Every SKILL.md a session opened through a `read` or a shell command: a `skill://` URL (omp's own discovery, which finds the operator's
// global copy) or a path. A command may name the directory through a shell variable it assigns first (`S=/x/.dist/skills; cat $S/a/SKILL.md`),
// so assignments in the same command are substituted; a variable left unresolved stays in the path and fails the check.
const skillRefs = (s) => s.calls.filter((c) => c.name === "read" || c.name === "bash").flatMap((c) => {
  let text = String(c.name === "read" ? c.args.path ?? "" : c.args.command ?? "");
  const vars = Object.fromEntries([...text.matchAll(/(?:^|[;&\n]\s*|\bexport\s+)([A-Za-z_]\w*)=("[^"]*"|'[^']*'|[^\s;&|]+)/g)].map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
  for (let i = 0; i < 3; i++) text = text.replace(/\$(?:\{(\w+)\}|(\w+))/g, (whole, a, b) => vars[a ?? b] ?? whole);
  return [...text.matchAll(/skill:\/\/([\w-]+)|([^\s"'`;&|]*?)\/([\w-]+)\/SKILL\.md/g)].map((m) => ({ name: m[1] ?? m[3], where: m[1] ? "skill://" : m[2] }));
});

// The copies of `names` a run loaded must be the ones under test: the run's `.dist/skills`, or the project's `.omp/skills` the installer wrote.
// omp runs with `--no-skills`, so a `skill://` URL or another path (the operator's `~/.omp/agent/skills`) means the session reached for a copy
// the run did not build. Some child session must have read each name.
export function skillLoadProblems({ sessions, names }) {
  const out = [];
  const underTest = (r) => r.where !== "skill://" && /(^|\/)(\.dist\/skills|\.omp\/skills)$/.test(r.where);
  for (const s of sessions) {
    for (const r of skillRefs(s).filter((x) => !underTest(x))) out.push(`skills: ${s.agent ?? "orchestrator"} ${s.id} loaded ${r.name} from ${r.where === "skill://" ? "skill://" : `${r.where}/${r.name}/SKILL.md`}, not from the run's .dist/skills or the project's .omp/skills`);
  }
  for (const name of names) if (!sessions.some((s) => s.child && skillRefs(s).some((r) => r.name === name && underTest(r)))) out.push(`skills: no child session read ${name}/SKILL.md from the run's .dist/skills or the project's .omp/skills`);
  return [...new Set(out)];
}
