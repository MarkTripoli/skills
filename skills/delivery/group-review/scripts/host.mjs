// Read-only host discovery and explicitly invoked inline posting adapters.
import {execFileSync} from 'node:child_process';

export function run(command, args, {input, cwd, raw = false} = {}) {
  const text = execFileSync(command, args, {cwd, input, encoding: 'utf8', stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024});
  return raw ? text : text.trim();
}
export const git = (args, cwd, raw = false) => run('git', args, {cwd, raw});

// insteadOf rewrites affect Git transport, not the configured forge/repository identity.
export const configuredRemoteUrl = (remote = 'origin') => git(['config', '--get', `remote.${remote}.url`]);

export function remoteContext(remoteUrl, override) {
  const match = /^(?:[\w.-]+@)?([^/:]+):(.+)$/.exec(remoteUrl);
  const url = remoteUrl.includes('://') ? new URL(remoteUrl) : match ? new URL(`https://${match[1]}/${match[2]}`) : null;
  if (!url || !url.hostname || !['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol)) throw new Error('remote must identify a GitHub or GitLab repository');
  const repository = url.pathname.replace(/^\//, '').replace(/\.git\/?$/, '').replace(/\/$/, '');
  if (!repository || repository.split('/').length < 2) throw new Error('remote repository path is missing');
  const host = override ?? (/^github\.com$/i.test(url.hostname) ? 'github' : 'gitlab');
  if (!['github', 'gitlab'].includes(host)) throw new Error(`unknown host adapter: ${host}`);
  return {host, hostname: url.hostname, repository};
}
export function detectHost(remoteUrl) { return remoteContext(remoteUrl).host; }
export function parseTerm(term) {
  const match = /^[!#]?(\d+)$/.exec(term.trim());
  return match ? {number: Number(match[1])} : {search: term.trim()};
}

export function hostAdapter(name, context = remoteContext(configuredRemoteUrl(), name)) {
  if (!['github', 'gitlab'].includes(name) || context.host !== name) throw new Error(`unknown or mismatched host adapter: ${name}`);
  const github = name === 'github';
  const command = github ? 'gh' : 'glab';
  const prefix = github ? `repos/${context.repository}/pulls` : `projects/${encodeURIComponent(context.repository)}/merge_requests`;
  const api = (endpoint, args = [], input) => {
    const text = run(command, ['api', '--hostname', context.hostname, endpoint, ...args], {input});
    return text ? JSON.parse(text) : null;
  };
  return {
    name,
    get(number) {
      const request = api(`${prefix}/${number}`);
      return github ? {
        number: request.number, ref: `#${request.number}`, title: request.title,
        state: request.merged_at ? 'merged' : request.state, draft: Boolean(request.draft), author: request.user?.login ?? null,
        url: request.html_url, source: request.head.ref, target: request.base.ref,
        base_sha: null, start_sha: request.base.sha, head_sha: request.head.sha,
        pipeline: null, updated: request.updated_at, description: request.body ?? '',
      } : {
        number: request.iid, ref: `!${request.iid}`, title: request.title,
        state: request.state, draft: Boolean(request.draft || request.work_in_progress), author: request.author?.username ?? null,
        url: request.web_url, source: request.source_branch, target: request.target_branch,
        base_sha: request.diff_refs?.base_sha ?? null, start_sha: request.diff_refs?.start_sha ?? null,
        head_sha: request.diff_refs?.head_sha ?? request.sha, pipeline: request.head_pipeline?.status ?? null,
        updated: request.updated_at, description: request.description ?? '',
      };
    },
    search(term) {
      if (github) {
        const found = JSON.parse(run('gh', ['pr', 'list', '--repo', `${context.hostname}/${context.repository}`, '--state', 'all', '--limit', '100', '--search', term, '--json', 'number']));
        return found.map(request => request.number);
      }
      const query = new URLSearchParams({search: term, state: 'all', per_page: '100'});
      return (api(`${prefix}?${query}`) ?? []).map(request => request.iid);
    },
    headSha(number) {
      const request = api(`${prefix}/${number}`);
      return github ? request.head.sha : request.diff_refs.head_sha;
    },
    post(request, comment) {
      const payload = github
        ? {body: comment.body, commit_id: request.head_sha, path: comment.path, line: comment.line, side: 'RIGHT'}
        : {body: comment.body, position: gitlabPosition(request, comment)};
      const created = api(`${prefix}/${request.number}/${github ? 'comments' : 'discussions'}`, ['-X', 'POST', '--input', '-'], JSON.stringify(payload));
      if (github) return {note_id: created.id, discussion_id: null, inline: created.path === comment.path && created.line === comment.line && created.commit_id === request.head_sha, url: created.html_url};
      const note = created.notes?.[0];
      return {note_id: note?.id ?? null, discussion_id: created.id, inline: note?.type === 'DiffNote' && note?.position?.head_sha === request.head_sha && note?.position?.old_path === comment.old_path && note?.position?.new_path === comment.new_path && note?.position?.new_line === comment.line, url: note ? `${request.url}#note_${note.id}` : request.url};
    },
  };
}
export function gitlabPosition(request, comment) {
  return {position_type: 'text', base_sha: request.base_sha, start_sha: request.start_sha, head_sha: request.head_sha, old_path: comment.old_path, new_path: comment.new_path, new_line: comment.line};
}
