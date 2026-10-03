// Shared grading for immutable iterate-* successors seeded through the task ledger.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { failures, handoff, placeholders, section, frontmatter } from "./lib.mjs";
import { reserveArtifactIteration, recordArtifact, semanticSeries } from "../shared/task-artifacts.mjs";

// Explicit fixture inputs only: no discovery or mutation of owner task histories.
export const seed = (files) => ({ taskDir }) => {
  const seeded = {};
  for (const [name, text] of Object.entries(files)) {
    const type = frontmatter(text)?.type;
    if (!type) {
      fs.mkdirSync(path.dirname(path.join(taskDir, name)), { recursive: true });
      fs.writeFileSync(path.join(taskDir, name), text);
      continue;
    }
    const { kind, variant } = semanticSeries(type);
    const allocation = reserveArtifactIteration(taskDir, kind, variant);
    fs.writeFileSync(path.join(taskDir, allocation.writePath), text);
    const record = recordArtifact(taskDir, kind, variant, type, allocation.writePath);
    if (record.path !== name) throw new Error(`fixture seed ${name} must name its allocated path ${record.path}`);
    seeded[name] = record;
  }
  return { seeded };
};

export function currentArtifact(ctx, type) {
  return ctx.artifacts.find(artifact => artifact.fm.type === type && artifact.current !== false) ?? null;
}

const CHANGE_LOG_HEADING = /^#{1,6}\s+(?:change ?log|revisions?|what changed|edit history|updates?)\b/im;

export function revisionProblems(label, ctx, { file, type, seedText, next = null, also = [], named = true }) {
  const previous = ctx.artifacts.find(artifact => artifact.file === file);
  const artifact = currentArtifact(ctx, type);
  const successors = ctx.artifacts.filter(candidate => candidate.fm.type === type && candidate.file !== file);
  const h = handoff(ctx.answer);
  const accepted = [next, ...also].filter(Boolean);
  const out = failures(
    previous && previous.text === seedText ? null : `${label}: original ${file} was removed or rewritten`,
    artifact && artifact.file !== file ? null : `${label}: no immutable successor of ${file}`,
    successors.length === 1 ? null : `${label}: expected exactly one successor, observed ${successors.length}`,
    artifact && previous?.record && artifact.record?.supersedes !== previous.record.id ? `${label}: successor does not supersede the seeded artifact` : null,
    artifact && artifact.text === seedText ? `${label}: successor content is unchanged` : null,
    artifact && !artifact.fm.summary ? `${label}: frontmatter summary missing` : null,
    artifact && CHANGE_LOG_HEADING.test(artifact.text) ? `${label}: successor has a change-log style heading` : null,
    artifact && /^\s*(?:[-*]\s*)?(?:change ?log|update|revision)\s*:/im.test(artifact.text) ? `${label}: successor carries change-log text` : null,
    artifact ? placeholders(artifact.text, ctx.template).slice(0, 3).map(p => `${label}: template placeholder left: ${p}`) : null,
  );
  if (next) {
    if (!h) out.push(`${label}: reply has no command fence`);
    else {
      if (h.fences !== 1 || h.lang !== "text") out.push(`${label}: reply must have one text command fence`);
      if (h.skill !== next) out.push(`${label}: reply hands off to /${h.skill}, expected /${next}`);
      if (named && artifact && ![artifact.file, `${ctx.taskRel}/${artifact.file}`].includes(h.file)) out.push(`${label}: handoff must name the immutable successor ${artifact.file}`);
    }
  } else if (h && !accepted.includes(h.skill)) out.push(`${label}: unexpected handoff /${h.skill}`);
  if (ctx.live) {
    const dirty = git(ctx.repo, "status", "--porcelain");
    if (dirty) out.push(`git: repository left dirty:\n${dirty}`);
    const touched = git(ctx.repo, "diff", "--name-only", ctx.fixtureSha, "HEAD", "--", ".", ":!.agents").split("\n").filter(Boolean);
    if (touched.length) out.push(`git: files outside .agents/ changed since the fixture: ${touched.join(", ")}`);
  }
  return out;
}

const git = (cwd, ...argv) => execFileSync("git", argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

export function entries(text, heading) {
  return (section(text, heading) ?? "").split(/^#### /m).slice(1).map(chunk => ({ title: chunk.split("\n")[0].trim(), text: chunk }));
}

const NODE = String.raw`[A-Za-z0-9_]+(?:\["[^"\n]*"\])?`;
const ARROW = String.raw`(?:-->|-\.->)(?:\s*\|[^|\n]*\|)?`;
const CHAIN = new RegExp(String.raw`^${NODE}(?:\s*${ARROW}\s*${NODE})*$`);
export function dagProblems(label, text, names) {
  const body = section(text, "### Execution DAG");
  const fence = /^```mermaid\n([\s\S]*?)\n```[ \t]*$/m.exec(body ?? "")?.[1];
  if (fence === undefined) return [`${label}: Execution DAG has no mermaid fence`];
  const lines = fence.split("\n").map(line => line.trim()).filter(Boolean);
  return failures(
    /^(?:flowchart|graph)\s+(?:TD|TB|BT|LR|RL)$/.test(lines[0] ?? "") ? null : `${label}: Execution DAG header is not a flowchart direction: ${lines[0] ?? ""}`,
    lines.slice(1).filter(line => !CHAIN.test(line) || /\b(?:subgraph|style|classDef|class|linkStyle)\b/.test(line)).slice(0, 3).map(line => `${label}: Execution DAG line outside the template's form: ${line.slice(0, 80)}`),
    names.filter(re => !re.test(fence)).map(re => `${label}: Execution DAG does not name ${re}`),
  );
}
