#!/usr/bin/env node
// Enforces the Conventional Commits subject rule from shared/CONVENTIONS.md.
// Usage: node scripts/check-commits.mjs --message-file <path>          (commit-msg hook)
//        node scripts/check-commits.mjs <base>..<head> [--title <text>] (CI: every non-merge commit in the range, plus the PR title)
//        node scripts/check-commits.mjs --title <text>                  (describe-pr: the title alone, before the PR is opened)
// Exit 1 with one line per failing subject.

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const TYPES = ["feat", "fix", "refactor", "perf", "test", "docs", "build", "ci", "chore", "style", "revert"];
export const SUBJECT_PATTERN = /^(feat|fix|refactor|perf|test|docs|build|ci|chore|style|revert)(\([a-z0-9][a-z0-9-]*\))?!?: [a-z0-9][^\n]*[^.\n]$/;
export const MAX_SUBJECT_LENGTH = 72;

// Git writes these itself; rebase removes fixup!/squash!/amend! before they reach a shared branch.
const EXEMPT = /^(?:Merge |fixup! |squash! |amend! )/;

// Problems with one subject line; empty when it satisfies the rule.
export function subjectProblems(subject) {
  if (!subject) return ["empty subject"];
  if (EXEMPT.test(subject)) return [];
  const problems = [];
  if (subject.length > MAX_SUBJECT_LENGTH) problems.push(`${subject.length} characters; the limit is ${MAX_SUBJECT_LENGTH}`);
  if (!SUBJECT_PATTERN.test(subject)) {
    problems.push(`does not match <type>(<scope>)!: <description> with a lower-case description and no trailing period; types: ${TYPES.join(", ")}`);
  }
  return problems;
}

// First line of a commit message file after git's `#` comment lines and leading blank lines.
export function messageSubject(text) {
  return text.split("\n").find((line) => line.trim() !== "" && !line.startsWith("#"))?.trimEnd() ?? "";
}

function commitsIn(range) {
  const output = execFileSync("git", ["log", "--no-merges", "--format=%H%x00%s", range], { encoding: "utf8" }).trimEnd();
  if (!output) return [];
  return output.split("\n").map((line) => {
    const separator = line.indexOf("\0");
    return { label: `commit ${line.slice(0, 12)}`, subject: line.slice(separator + 1) };
  });
}

function parseArgs(argv) {
  const options = { messageFile: null, range: null, title: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--message-file") options.messageFile = argv[++i];
    else if (arg === "--title") options.title = argv[++i];
    else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else options.range = arg;
  }
  if (!options.messageFile && !options.range && options.title === null) throw new Error("expected --message-file <path>, a <base>..<head> range, or --title <text>");
  return options;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const subjects = [];
  if (options.messageFile) subjects.push({ label: "commit message", subject: messageSubject(fs.readFileSync(options.messageFile, "utf8")) });
  if (options.range) subjects.push(...commitsIn(options.range));
  if (options.title !== null) subjects.push({ label: "pull request title", subject: options.title });

  const failures = subjects.flatMap(({ label, subject }) => subjectProblems(subject).map((problem) => `${label}: ${JSON.stringify(subject)}: ${problem}`));
  if (failures.length) {
    for (const failure of failures) console.error(failure);
    console.error("\nExamples: feat(cli): add --verbose flag, fix(parser): keep trailing slash, refactor!: replace callback api");
    return 1;
  }
  console.log(`ok: ${subjects.length} subject${subjects.length === 1 ? "" : "s"}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
