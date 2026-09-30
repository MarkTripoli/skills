#!/usr/bin/env node
// Resolve each comment's anchor line at the pinned head and check that it sits inside the request diff.
// Usage: node anchors.mjs --stack <stack.json> --in <comments.json> --out <anchors.json>
// comments.json: [{id, mr, path, pattern, occurrence?, line?, body}]; an explicit `line` skips the pattern.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {git} from './host.mjs';

// New-side line numbers that a unified diff adds or changes (hunk headers of `git diff -U0`).
export function addedLines(diff) {
  const lines = new Set();
  for (const match of diff.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    for (let line = start; line < start + count; line += 1) lines.add(line);
  }
  return lines;
}

// 1-based line of the nth line containing `pattern`, or null.
export function findLine(text, pattern, occurrence = 1) {
  let seen = 0;
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes(pattern) && ++seen === occurrence) return index + 1;
  }
  return null;
}

export function resolveAnchors(stack, comments, {show, diff}) {
  const byNumber = new Map(stack.requests.map(request => [request.number, request]));
  return comments.map(comment => {
    const request = byNumber.get(Number(String(comment.mr).replace(/^[!#]/, '')));
    if (!request) return {...comment, line: null, in_diff: false, problem: `request ${comment.mr} is not in the stack`};
    const text = show(request.head_sha, comment.path);
    const line = comment.line ?? findLine(text, comment.pattern, comment.occurrence ?? 1);
    if (!line) return {...comment, line: null, in_diff: false, problem: `pattern not found at ${request.head_sha.slice(0, 9)}`};
    const inDiff = addedLines(diff(request.base_sha, request.head_sha, comment.path)).has(line);
    return {...comment, mr: request.number, line, text: text.split('\n')[line - 1].trim(), in_diff: inDiff, problem: inDiff ? null : 'line is outside the request diff'};
  });
}

export function main(argv = process.argv.slice(2)) {
  const stackFile = valueOf(argv, '--stack');
  const input = valueOf(argv, '--in');
  const out = valueOf(argv, '--out');
  if (!stackFile || !input || !out) {
    console.error('usage: anchors.mjs --stack <stack.json> --in <comments.json> --out <anchors.json>');
    return 2;
  }
  const stack = JSON.parse(fs.readFileSync(stackFile, 'utf8'));
  const comments = JSON.parse(fs.readFileSync(input, 'utf8'));
  const anchors = resolveAnchors(stack, comments, {
    show: (sha, file) => git(['show', `${sha}:${file}`]),
    diff: (base, head, file) => git(['diff', '-U0', base, head, '--', file]),
  });
  fs.writeFileSync(out, `${JSON.stringify(anchors, null, 2)}\n`);
  for (const anchor of anchors) {
    console.log(`${anchor.id} ${anchor.mr} ${anchor.path}:${anchor.line ?? '?'} ${anchor.in_diff ? 'in_diff' : `FAIL ${anchor.problem}`}`);
  }
  return anchors.every(anchor => anchor.in_diff) ? 0 : 1;
}

function valueOf(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function isMain() {
  try { return process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]); } catch { return false; }
}

if (isMain()) process.exit(main());
