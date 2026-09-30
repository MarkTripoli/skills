#!/usr/bin/env node
// Post approved inline comments. Stops on the first moved head, failed post, or non-inline result.
// Usage: node post.mjs --stack <stack.json> --comments <anchors.json> --posted <posted.json> [--only <id>] [--dry-run]
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {hostAdapter} from './host.mjs';

// Comments still to post, in file order: anchored in the diff, not yet recorded, and matching --only.
export function pending(comments, posted, only) {
  const done = new Set(posted.map(entry => entry.id));
  return comments.filter(comment => !done.has(comment.id) && (!only || comment.id === only));
}

export function postAll({stack, comments, posted, only, dryRun, host, save, log}) {
  const byNumber = new Map(stack.requests.map(request => [request.number, request]));
  const unanchored = comments.filter(comment => !comment.in_diff);
  if (unanchored.length) {
    log(`not anchored in the diff: ${unanchored.map(comment => comment.id).join(', ')}; re-run anchors.mjs`);
    return 1;
  }
  for (const comment of pending(comments, posted, only)) {
    const request = byNumber.get(comment.mr);
    const current = host.headSha(request.number);
    if (current !== request.head_sha) {
      log(`${comment.id}: ${request.ref} head moved ${request.head_sha.slice(0, 9)} -> ${current.slice(0, 9)}; re-anchor before posting`);
      return 3;
    }
    if (dryRun) {
      log(`${comment.id}: would post on ${request.ref} ${comment.path}:${comment.line}`);
      continue;
    }
    const result = host.post(request, comment);
    if (!result.inline) {
      log(`${comment.id}: ${request.ref} did not accept an inline position (${result.url}); stopped`);
      return 4;
    }
    posted.push({id: comment.id, mr: request.number, path: comment.path, line: comment.line, note_id: result.note_id, discussion_id: result.discussion_id, url: result.url, posted: new Date().toISOString()});
    save(posted);
    log(`${comment.id}: posted ${result.url}`);
  }
  return 0;
}

export function main(argv = process.argv.slice(2)) {
  const stackFile = valueOf(argv, '--stack');
  const commentsFile = valueOf(argv, '--comments');
  const postedFile = valueOf(argv, '--posted');
  if (!stackFile || !commentsFile || !postedFile) {
    console.error('usage: post.mjs --stack <stack.json> --comments <anchors.json> --posted <posted.json> [--only <id>] [--dry-run]');
    return 2;
  }
  const stack = JSON.parse(fs.readFileSync(stackFile, 'utf8'));
  const comments = JSON.parse(fs.readFileSync(commentsFile, 'utf8'));
  const posted = fs.existsSync(postedFile) ? JSON.parse(fs.readFileSync(postedFile, 'utf8')) : [];
  return postAll({
    stack,
    comments,
    posted,
    only: valueOf(argv, '--only'),
    dryRun: argv.includes('--dry-run'),
    host: hostAdapter(stack.host),
    save: entries => fs.writeFileSync(postedFile, `${JSON.stringify(entries, null, 2)}\n`),
    log: line => console.log(line),
  });
}

function valueOf(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function isMain() {
  try { return process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]); } catch { return false; }
}

if (isMain()) process.exit(main());
