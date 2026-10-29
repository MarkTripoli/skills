import fs from "node:fs";
import path from "node:path";
import { expect, failures } from "../lib.mjs";

// A first-time operator needs the startup order, configuration locations, retry outcome,
// and connection diagnostic without promotional prose. The edit must preserve exact technical
// strings and source uncertainty. No tier names, sentence quotas, punctuation bans, or
// change-table format are part of the graded outcome.
const prose = (text) => text.replace(/`[^`]*`/g, "");

function check({ live, repo, answer }) {
  const file = path.join(repo, "README.md");
  if (!live) return [];
  if (!fs.existsSync(file)) return ["technical-writing: README.md is missing"];
  const text = fs.readFileSync(file, "utf8");
  const body = prose(text);
  return failures(
    expect.excludes("technical-writing: marketing adjectives", body, /\b(robust|seamless)\b/i),
    expect.excludes("technical-writing: British spelling in prose", body, /\b(optimis|organisation|behaviour|colour)/i),
    expect.excludes("technical-writing: filler", body, /\b(in order to|it is important to note)\b/i),
    expect.matches("technical-writing: unspecified adoption claim survives", body, /\b(several|multiple) teams\b/i),
    expect.matches("technical-writing: missing adoption count is flagged", answer, /\b(count|number|unspecified|unquantified|several teams)\b/i),
    expect.matches("technical-writing: database precedes worker startup", body, /\bPostgres\b[\s\S]*\bworker\b/i),
    expect.matches("technical-writing: the hedge survives", body, /may have failed/),
    expect.matches("technical-writing: the error string survives", text, /`Error: connect ECONNREFUSED 127\.0\.0\.1:5432`/),
    expect.matches("technical-writing: the literal flag survives", text, /`--no-colour`/),
    expect.matches("technical-writing: the numbers survive", body, /\b3\b[\s\S]*\b503\b[\s\S]*\b54\b|\bthree\b[\s\S]*\b503\b[\s\S]*\b54\b/),
    expect.matches("technical-writing: the title survives", text, /^# notifyctl/),
    expect.matches("technical-writing: configuration location survives", text, /`notifyctl\.toml`/),
    expect.matches("technical-writing: channel inventory location survives", text, /`channels\.md`/),
  );
}

export default {
  slug: "readme-style-pass",
  title: "Tighten the notifyctl README",
  workflow: "oneshot",
  fixtures: ["technical-writing"],
  request: "Tighten README.md for a first-time operator using US English. Preserve every fact, number, uncertainty, and literal string. Report factual gaps without inventing missing information.",
  phases: [
    {
      skill: "technical-writing",
      terminal: true,
      request: "Tighten README.md in place for a first-time operator using US English. Preserve every fact, number, uncertainty, and literal string. Keep the startup order clear. Reply with a short change summary and any unresolved source facts, without imposing a table format.",
      check,
    },
  ],
};
