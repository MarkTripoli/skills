// The three read-only codebase workers, one fresh session each on the same fixture, run as terminal phases: locator, then
// analyzer, then pattern-finder. Each reply is the worker's report, graded for its required headings and for citations that
// resolve in the repository. Across all three: no file changed (no write or edit call in the session, a clean worktree and the
// fixture commit in a live run) and no artifact was saved in the task directory. The analyzer's `Existing Patterns` heading is not
// required, since the pattern-finder owns that job.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, failures, pointers } from "../lib.mjs";
import { readSessions } from "../sessions.mjs";

const git = (cwd, ...argv) => execFileSync("git", argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const heading = (label, text, name) => expect.matches(`${label}: heading "${name}"`, text, new RegExp(String.raw`^#{2,4}\s+${name}`, "m"));

// Nothing changed: the recorded session made no write or edit call, no artifact was saved, and (live) the repository is clean at the fixture commit.
function readOnlyProblems(label, ctx) {
  const sessions = ctx.sessionDir ? readSessions(ctx.sessionDir) : [];
  const writes = sessions.flatMap((s) => s.calls.filter((c) => /^(?:write|edit|notebook_edit|ast_edit)$/.test(c.name)).map((c) => c.name));
  const out = failures(
    ctx.sessionDir && !sessions.length ? `${label}: no recorded omp session` : null,
    writes.length ? `${label}: the session called ${[...new Set(writes)].join(", ")}; a read-only worker changes nothing` : null,
    ctx.artifacts.length ? `${label}: saved ${ctx.artifacts.map((a) => a.file).join(", ")} in the task directory; a worker's final message is the deliverable` : null,
  );
  if (ctx.live) {
    const dirty = git(ctx.repo, "status", "--porcelain");
    if (dirty) out.push(`${label}: repository left dirty:\n${dirty}`);
    if (git(ctx.repo, "rev-parse", "HEAD") !== ctx.fixtureSha) out.push(`${label}: HEAD moved; a worker committed`);
    const task = ctx.before.find((f) => f.file === "task.md")?.text;
    const now = fs.readFileSync(path.join(ctx.taskDir, "task.md"), "utf8");
    if (task !== undefined && task !== now) out.push(`${label}: task.md was modified`);
  }
  return out;
}

const repoPaths = (text) => [...text.matchAll(/`((?:src|tests)\/[^`\s:]+\.mjs|README\.md|notifyctl\.config\.json|package\.json)(?::\d+(?:-\d+)?)?`/g)].map((m) => m[1]);

// Lines inside fenced blocks (a wrapping markdown fence is transparent).
function excerptLines(answer) {
  const out = [];
  let inside = false;
  for (const line of answer.split("\n")) {
    const fence = /^\s*`{3,}(\w*)\s*$/.exec(line);
    if (fence) {
      if (!inside && /^(?:markdown|md)$/.test(fence[1])) continue;
      if (inside) inside = false;
      else inside = true;
      continue;
    }
    if (inside) out.push(line.trim());
  }
  return out;
}

const sourceText = (root) => ["src", "tests"].flatMap((dir) => {
  const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [fs.readFileSync(path.join(root, d, e.name), "utf8")]));
  return walk(dir);
}).join("\n");

export default {
  slug: "notifyctl-workers",
  title: "Document how notifyctl sends a notification",
  workflow: "full",
  request: "Document how notifyctl sends a notification and records the result.",
  phases: [
    {
      skill: "agent-codebase-locator",
      terminal: true,
      request: "Assignment: find where notifyctl's channel code, its configuration, and its tests live. Report locations only.",
      check: (ctx) => {
        const text = ctx.answer;
        const impl = repoPaths(text);
        const missing = [...new Set(impl)].filter((p) => !fs.existsSync(path.join(ctx.codeRoot, p)));
        return failures(
          readOnlyProblems("agent-codebase-locator", ctx),
          heading("agent-codebase-locator", text, "File Locations for"),
          heading("agent-codebase-locator", text, "Search Terms Used"),
          heading("agent-codebase-locator", text, "Implementation Files"),
          heading("agent-codebase-locator", text, "Test Files"),
          expect.includes("agent-codebase-locator: the channel registry is located", text, "src/channels/index.mjs"),
          expect.includes("agent-codebase-locator: the channel tests are located", text, "tests/channels.test.mjs"),
          missing.map((p) => `agent-codebase-locator: reported a path that does not exist: ${p}`),
        );
      },
    },
    {
      skill: "agent-codebase-analyzer",
      terminal: true,
      request: "Assignment: explain how `notifyctl send` resolves a channel and delivers a message, and where the result is recorded. Cite files and lines.",
      check: (ctx) => {
        const text = ctx.answer;
        const cites = pointers(text, ctx.codeRoot);
        return failures(
          readOnlyProblems("agent-codebase-analyzer", ctx),
          heading("agent-codebase-analyzer", text, "Analysis:"),
          ["Overview", "Entry Points", "Core Implementation", "Data Flow", "Contracts and State", "Error Handling", "Testing Patterns"].map((h) => heading("agent-codebase-analyzer", text, h)),
          expect.atLeast("agent-codebase-analyzer: citations with a line", cites.length, 4),
          cites.filter((c) => !c.valid).slice(0, 3).map((c) => `agent-codebase-analyzer: citation does not resolve: ${c.pointer}`),
          expect.matches("agent-codebase-analyzer: the flow reaches the log", text, /appendLog|log\.json|store\.mjs/),
        );
      },
    },
    {
      skill: "agent-codebase-pattern-finder",
      terminal: true,
      request: "Assignment: find how this repository structures a channel module and how it tests one. Show the existing examples.",
      check: (ctx) => {
        const text = ctx.answer;
        const source = sourceText(ctx.codeRoot);
        const lines = excerptLines(text).filter((l) => l.length >= 25);
        const real = lines.filter((l) => source.includes(l));
        const cites = pointers(text, ctx.codeRoot);
        return failures(
          readOnlyProblems("agent-codebase-pattern-finder", ctx),
          heading("agent-codebase-pattern-finder", text, "Pattern Examples:"),
          heading("agent-codebase-pattern-finder", text, "Pattern 1:"),
          heading("agent-codebase-pattern-finder", text, "Testing Patterns"),
          expect.matches("agent-codebase-pattern-finder: Found in line", text, /\*\*Found in\*\*:/),
          expect.matches("agent-codebase-pattern-finder: Used for line", text, /\*\*Used for\*\*:/),
          expect.atLeast("agent-codebase-pattern-finder: excerpt lines copied from the repository", real.length, 2),
          lines.length && real.length / lines.length < 0.7 ? `agent-codebase-pattern-finder: ${lines.length - real.length} of ${lines.length} excerpt lines are not in the repository (pseudocode or paraphrase)` : null,
          cites.filter((c) => !c.valid).slice(0, 3).map((c) => `agent-codebase-pattern-finder: citation does not resolve: ${c.pointer}`),
        );
      },
    },
  ],
};
