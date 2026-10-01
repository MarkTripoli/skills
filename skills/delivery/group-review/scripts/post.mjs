#!/usr/bin/env node
// Post only user-approved inline comments bound to a pinned head and revalidated diff.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {git, hostAdapter} from './host.mjs';
import {diffPaths, resolveAnchors} from './anchors.mjs';

export function pending(comments, posted, only) {
  const done = new Set(posted.map(entry => entry.id));
  return comments.filter(comment => !done.has(comment.id) && (!only || comment.id === only));
}
export function postAll({stack, comments, posted, only, dryRun, approved, host, checkAnchor, save, log}) {
  if (!dryRun && approved !== true) {
    log('posting requires explicit user approval; pass --approved only after the decisions and test-post gates');
    return 2;
  }
  const byNumber = new Map(stack.requests.map(request => [request.number, request]));
  const ids = comments.map(comment => comment.id);
  if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length || (only && !ids.includes(only))) {
    log('comment ids must be unique and --only must name an existing comment');
    return 1;
  }
  const todo = pending(comments, posted, only);
  for (const comment of todo) {
    const request = byNumber.get(comment.mr);
    if (!request || !comment.in_diff || comment.head_sha !== request.head_sha || comment.base_sha !== request.base_sha || typeof comment.body !== 'string' || !comment.body.trim() || !checkAnchor || !checkAnchor(request, comment)) {
      log(`${comment.id}: invalid or stale diff anchor; re-run anchors.mjs`);
      return 1;
    }
  }
  for (const comment of todo) {
    const request = byNumber.get(comment.mr);
    const current = host.headSha(request.number);
    if (current !== request.head_sha) {
      log(`${comment.id}: ${request.ref} head moved ${request.head_sha.slice(0, 9)} -> ${current.slice(0, 9)}; rediscover, re-anchor and obtain approval before posting`);
      return 3;
    }
    if (dryRun) { log(`${comment.id}: would post on ${request.ref} ${comment.path}:${comment.line}`); continue; }
    const result = host.post(request, comment);
    if (!result.inline) {
      log(`${comment.id}: ${request.ref} did not accept an inline position (${result.url}); stopped`);
      return 4;
    }
    posted.push({id: comment.id, mr: request.number, path: comment.path, line: comment.line, head_sha: request.head_sha, note_id: result.note_id, discussion_id: result.discussion_id, url: result.url, posted: new Date().toISOString()});
    save(posted);
    log(`${comment.id}: posted ${result.url}`);
  }
  return 0;
}
export function main(argv = process.argv.slice(2)) {
  const value = flag => argv[argv.indexOf(flag) + 1];
  const stackFile = argv.includes('--stack') && value('--stack');
  const commentsFile = argv.includes('--comments') && value('--comments');
  const postedFile = argv.includes('--posted') && value('--posted');
  if (!stackFile || !commentsFile || !postedFile) {
    console.error('usage: post.mjs --stack <stack.json> --comments <anchors.json> --posted <posted.json> [--only <id>] [--dry-run | --approved]');
    return 2;
  }
  const dryRun = argv.includes('--dry-run');
  const approved = argv.includes('--approved');
  if (!dryRun && !approved) { console.error('posting requires explicit user approval (--approved)'); return 2; }
  const stack = JSON.parse(fs.readFileSync(stackFile, 'utf8'));
  const comments = JSON.parse(fs.readFileSync(commentsFile, 'utf8'));
  const posted = fs.existsSync(postedFile) ? JSON.parse(fs.readFileSync(postedFile, 'utf8')) : [];
  return postAll({
    stack, comments, posted, dryRun, approved,
    only: argv.includes('--only') ? value('--only') : undefined,
    host: hostAdapter(stack.host, stack.context),
    checkAnchor: (request, comment) => {
      const [fresh] = resolveAnchors({requests: [request]}, [comment], {
        show: (sha, file) => git(['show', `${sha}:${file}`], undefined, true),
        paths: diffPaths,
        diff: (base, head, oldPath, newPath) => git(['diff', '-U0', '--find-renames', base, head, '--', `:(literal)${oldPath}`, `:(literal)${newPath}`]),
      });
      return fresh.in_diff && fresh.line === comment.line && fresh.text === comment.text && fresh.old_path === comment.old_path && fresh.new_path === comment.new_path;
    },
    save: entries => fs.writeFileSync(postedFile, `${JSON.stringify(entries, null, 2)}\n`),
    log: line => console.log(line),
  });
}
function isMain() {
  try { return process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]); } catch { return false; }
}
if (isMain()) process.exit(main());
