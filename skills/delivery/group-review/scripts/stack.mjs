#!/usr/bin/env node
// Resolve a set of related pull requests into an ordered stack with pinned SHAs.
// Usage: node stack.mjs --out <stack.json> [--remote origin] <term>...
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {configuredRemoteUrl, remoteContext, git, hostAdapter, parseTerm, run} from './host.mjs';

// Order requests so each one follows the request whose source branch it targets.
export function orderStack(requests) {
  const bySource = new Map(requests.map(request => [request.source, request]));
  const parent = request => bySource.get(request.target) ?? null;
  const depth = request => {
    let count = 0;
    for (let current = parent(request), seen = new Set(); current && !seen.has(current.number); current = parent(current)) {
      seen.add(current.number);
      count += 1;
    }
    return count;
  };
  return requests
    .map(request => ({...request, parent: parent(request)?.number ?? null, depth: depth(request)}))
    .sort((a, b) => a.depth - b.depth || a.number - b.number);
}

// Map patch-id -> request numbers, keeping only patches that appear in more than one request.
export function duplicatePatches(patchesByRequest) {
  const owners = new Map();
  for (const [number, patches] of Object.entries(patchesByRequest)) {
    for (const {patchId, commit} of patches) {
      if (!owners.has(patchId)) owners.set(patchId, []);
      owners.get(patchId).push({request: Number(number), commit});
    }
  }
  return [...owners.entries()]
    .filter(([, list]) => new Set(list.map(item => item.request)).size > 1)
    .map(([patch_id, list]) => ({patch_id, commits: list}));
}

function patchIds(range) {
  const commits = git(['rev-list', '--no-merges', range]).split('\n').filter(Boolean);
  return commits
    .map(commit => {
      const diff = git(['show', '--format=', commit]);
      const patchId = diff ? run('git', ['patch-id', '--stable'], {input: `${diff}\n`}).split(' ')[0] : '';
      return {commit: commit.slice(0, 12), patchId};
    })
    .filter(item => item.patchId);
}

export function main(argv = process.argv.slice(2)) {
  const out = valueOf(argv, '--out');
  const remote = valueOf(argv, '--remote') ?? 'origin';
  const terms = argv.filter((arg, index) => !arg.startsWith('--') && !['--out', '--remote', '--host'].includes(argv[index - 1]));
  if (!out || terms.length === 0) {
    console.error('usage: stack.mjs --out <stack.json> [--remote origin] [--host github|gitlab] <term>...');
    return 2;
  }
  const context = remoteContext(configuredRemoteUrl(remote), valueOf(argv, '--host'));
  const hostName = context.host;
  const host = hostAdapter(hostName, context);
  const numbers = new Set();
  for (const term of terms) {
    const parsed = parseTerm(term);
    if (parsed.number) numbers.add(parsed.number);
    else for (const number of host.search(parsed.search)) numbers.add(number);
  }
  const requests = [...numbers].map(number => host.get(number));
  const open = requests.filter(request => request.state === 'opened' || request.state === 'open');
  // Request refs also resolve fork heads whose source branches do not exist in origin.
  if (open.length) git(['fetch', '--quiet', remote, ...open.flatMap(request => [
    `+refs/${hostName === 'github' ? 'pull' : 'merge-requests'}/${request.number}/head:refs/group-review/${request.number}/head`,
    `+refs/heads/${request.target}:refs/remotes/${remote}/${request.target}`,
  ])]);
  const patchesByRequest = {};
  for (const request of open) {
    const fetchedHead = git(['rev-parse', `refs/group-review/${request.number}/head`]);
    if (fetchedHead !== request.head_sha) throw new Error(`${request.ref} moved while fetching; rediscover the stack`);
    request.start_sha ??= git(['rev-parse', `${remote}/${request.target}`]);
    // Verify pinned target objects exist; never substitute a moved branch's contents.
    git(['cat-file', '-e', `${request.start_sha}^{commit}`]);
    request.base_sha ??= git(['merge-base', request.start_sha, request.head_sha]);
    request.shortstat = git(['diff', '--shortstat', request.base_sha, request.head_sha]);
    request.files = git(['diff', '--name-status', request.base_sha, request.head_sha]).split('\n').filter(Boolean);
    patchesByRequest[request.number] = patchIds(`${request.start_sha}..${request.head_sha}`);
  }
  const stack = {
    host: hostName,
    context,
    remote,
    generated: new Date().toISOString(),
    requests: orderStack(open),
    excluded: requests.filter(request => !open.includes(request)).map(({number, ref, title, state}) => ({number, ref, title, state})),
    duplicates: duplicatePatches(patchesByRequest),
  };
  fs.mkdirSync(path.dirname(path.resolve(out)), {recursive: true});
  fs.writeFileSync(out, `${JSON.stringify(stack, null, 2)}\n`);
  for (const request of stack.requests) {
    console.log(`${'  '.repeat(request.depth)}${request.ref} ${request.title} (${request.source} -> ${request.target}) ${request.shortstat || 'no diff'} pipeline=${request.pipeline ?? 'n/a'}${request.draft ? ' draft' : ''}`);
  }
  for (const item of stack.excluded) console.log(`excluded ${item.ref} ${item.title} (${item.state})`);
  for (const item of stack.duplicates) console.log(`duplicate patch ${item.patch_id.slice(0, 12)} in ${item.commits.map(commit => `request ${commit.request} ${commit.commit}`).join(', ')}`);
  return 0;
}

function valueOf(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function isMain() {
  try { return process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]); } catch { return false; }
}

if (isMain()) process.exit(main());
