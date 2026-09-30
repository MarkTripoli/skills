// Host adapters for GitLab (`glab`) and GitHub (`gh`), plus shared git helpers.
import {execFileSync} from 'node:child_process';

export function run(command, args, {input, cwd} = {}) {
  return execFileSync(command, args, {cwd, input, encoding: 'utf8', stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024}).trim();
}

export const git = (args, cwd) => run('git', args, {cwd});

export function detectHost(remoteUrl) {
  return /github\.com[:/]/i.test(remoteUrl) ? 'github' : 'gitlab';
}

// Numbers written as `!3330`, `#42`, or bare digits select one request; anything else is a search term.
export function parseTerm(term) {
  const match = /^[!#]?(\d+)$/.exec(term.trim());
  return match ? {number: Number(match[1])} : {search: term.trim()};
}

function json(command, args, options) {
  const text = run(command, args, options);
  return text ? JSON.parse(text) : null;
}

const gitlab = {
  name: 'gitlab',
  get(number) {
    const mr = json('glab', ['api', `projects/:id/merge_requests/${number}`]);
    return {
      number: mr.iid,
      ref: `!${mr.iid}`,
      title: mr.title,
      state: mr.state,
      draft: Boolean(mr.draft || mr.work_in_progress),
      author: mr.author?.username ?? null,
      url: mr.web_url,
      source: mr.source_branch,
      target: mr.target_branch,
      base_sha: mr.diff_refs?.base_sha ?? null,
      start_sha: mr.diff_refs?.start_sha ?? null,
      head_sha: mr.diff_refs?.head_sha ?? mr.sha,
      pipeline: mr.head_pipeline?.status ?? null,
      updated: mr.updated_at,
      description: mr.description ?? '',
    };
  },
  search(term) {
    const query = new URLSearchParams({search: term, state: 'all', per_page: '100'});
    return (json('glab', ['api', `projects/:id/merge_requests?${query}`]) ?? []).map(mr => mr.iid);
  },
  headSha(number) {
    return json('glab', ['api', `projects/:id/merge_requests/${number}`]).diff_refs.head_sha;
  },
  post(request, comment) {
    const payload = {body: comment.body, position: gitlabPosition(request, comment)};
    const discussion = json('glab', ['api', '-X', 'POST', `projects/:id/merge_requests/${request.number}/discussions`, '-H', 'Content-Type: application/json', '--input', '-'], {input: JSON.stringify(payload)});
    const note = discussion.notes?.[0];
    return {note_id: note?.id ?? null, discussion_id: discussion.id, inline: note?.type === 'DiffNote', url: note ? `${request.url}#note_${note.id}` : request.url};
  },
};

let githubRepo;
function repoName() {
  githubRepo ??= run('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
  return githubRepo;
}

const github = {
  name: 'github',
  get(number) {
    const pr = json('gh', ['api', `repos/${repoName()}/pulls/${number}`]);
    return {
      number: pr.number,
      ref: `#${pr.number}`,
      title: pr.title,
      state: pr.merged_at ? 'merged' : pr.state,
      draft: Boolean(pr.draft),
      author: pr.user?.login ?? null,
      url: pr.html_url,
      source: pr.head.ref,
      target: pr.base.ref,
      base_sha: null,
      start_sha: pr.base.sha,
      head_sha: pr.head.sha,
      pipeline: null,
      updated: pr.updated_at,
      description: pr.body ?? '',
    };
  },
  search(term) {
    const found = json('gh', ['pr', 'list', '--state', 'all', '--limit', '100', '--search', term, '--json', 'number']) ?? [];
    return found.map(pr => pr.number);
  },
  headSha(number) {
    return json('gh', ['api', `repos/${repoName()}/pulls/${number}`]).head.sha;
  },
  post(request, comment) {
    const payload = {body: comment.body, commit_id: request.head_sha, path: comment.path, line: comment.line, side: 'RIGHT'};
    const created = json('gh', ['api', '-X', 'POST', `repos/${repoName()}/pulls/${request.number}/comments`, '--input', '-'], {input: JSON.stringify(payload)});
    return {note_id: created.id, discussion_id: null, inline: Boolean(created.path), url: created.html_url};
  },
};

export function hostAdapter(name) {
  return name === 'github' ? github : gitlab;
}

export function gitlabPosition(request, comment) {
  return {
    position_type: 'text',
    base_sha: request.base_sha,
    start_sha: request.start_sha,
    head_sha: request.head_sha,
    old_path: comment.path,
    new_path: comment.path,
    new_line: comment.line,
  };
}
