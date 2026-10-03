#!/usr/bin/env node
// Prints the review state of the one open GitLab PR for a branch as JSON.
// Usage: node pr-state.mjs [--branch <name>]   (default: the current branch)
// Exit 0 with a state object, 2 when the branch has not exactly one open PR, 1 on other failures.
// `blocked` lists reasons to treat approval or checks as blocked, never as passing.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

// Copied from group-review/scripts/host.mjs: skills install independently, so no cross-skill import.
function run(command, args, {input, cwd} = {}) {
  return execFileSync(command, args, {cwd, input, encoding: 'utf8', stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024}).trim();
}

// Current glab merges pages into one array; older versions print one array per page, back to back.
function glab(args) {
  const text = run('glab', ['api', ...args]);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(`[${text.split(/(?<=\])\s*(?=\[)/).map(page => page.trim().slice(1, -1)).filter(Boolean).join(',')}]`);
  }
}

export function prState(branch, api = glab) {
  const open = api(['--method', 'GET', 'projects/:id/merge_requests', '--raw-field', 'state=opened', '--raw-field', `source_branch=${branch}`, '--paginate']) ?? [];
  if (open.length !== 1) return {error: `expected exactly one open PR for branch ${branch}, found ${open.length}`};
  const {iid} = open[0];
  const base = `projects/:id/merge_requests/${iid}`;
  const pr = api([base]);
  const blocked = [];
  const attempt = (label, endpoint) => {
    try {
      return api([endpoint]);
    } catch (error) {
      // GitLab answers 401 when the license lacks external status checks (check_feature_enabled!) and 404 when none exist.
      // 403 means the user cannot read checks that may exist, so it blocks like any other error.
      if (label === 'status checks' && /\b(401|404)\b/.test(String(error.stderr ?? error.message))) return [];
      blocked.push(`${label} unavailable`);
      return null;
    }
  };
  const discussions = api([`${base}/discussions`, '--paginate']) ?? [];
  const approvals = attempt('approvals', `${base}/approvals`);
  const approvalState = attempt('approval state', `${base}/approval_state`);
  const statusChecks = attempt('status checks', `${base}/status_checks`);
  const pipeline = pr.head_pipeline;
  const head = pr.sha;
  for (const check of statusChecks ?? []) if (check.status !== 'passed') blocked.push(`status check ${check.name}: ${check.status}`);
  const unresolved = discussions
    .filter(d => d.notes?.some(n => n.resolvable && !n.resolved))
    .map(d => ({discussion_id: d.id, note_ids: d.notes.map(n => n.id), author: d.notes[0].author?.username ?? null, body: d.notes[0].body, position: d.notes[0].position ?? null}));
  // Read the head last: a push during the reads above invalidates every conclusion.
  if (api([base]).sha !== head) blocked.push('head_moved: the PR head changed while reading; run again');
  return {
    iid,
    web_url: pr.web_url,
    target_branch: pr.target_branch,
    base_sha: pr.diff_refs?.base_sha ?? null,
    head_sha: head,
    unresolved,
    approval: {
      state: approvals && approvalState ? (approvals.approved && approvals.approved_by?.length ? 'approved' : 'pending') : 'blocked',
      approved_by: (approvals?.approved_by ?? []).map(a => a.user?.username),
      rules: approvalState?.rules ?? null,
    },
    head_pipeline: pipeline ? {id: pipeline.id, status: pipeline.status, sha: pipeline.sha, matches_head: pipeline.sha === head} : null,
    status_checks: statusChecks,
    blocked,
  };
}

function isMain() {
  try { return process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]); } catch { return false; }
}

if (isMain()) {
  const flag = process.argv.indexOf('--branch');
  const branch = flag > 0 ? process.argv[flag + 1] : run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const state = prState(branch);
  if (state.error) {
    console.error(state.error);
    process.exit(2);
  }
  console.log(JSON.stringify(state, null, 2));
}
