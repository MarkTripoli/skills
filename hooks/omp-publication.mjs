import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classifyPublicationCommand } from '../shared/publication-command.mjs';
import { readArtifactIndex } from '../shared/task-artifacts.mjs';

const proofCli = fileURLToPath(new URL('../shared/publication-proof.mjs', import.meta.url));
const deny = reason => ({ block: true, reason: `Publication guard: ${reason}` });

function execute(run, binary, args, cwd) {
  const result = run(binary, args, { cwd, encoding: 'utf8', timeout: 90_000, maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') throw new Error('inspection command failed');
  return result.stdout.trim();
}

export function guardPublicationCall(event, { env = process.env, cwd = process.cwd(), run = spawnSync } = {}) {
  if (!env.SKILLS_PUBLICATION_TASK_DIR || event?.toolName !== 'bash') return;
  const command = event.input?.command;
  if (typeof command !== 'string' || !command.trim()) return deny('malformed Bash command in an opted-in task session');

  let publication;
  try { publication = classifyPublicationCommand(command); }
  catch { return deny('publication command cannot be classified'); }
  if (!publication) return;

  const taskDir = env.SKILLS_PUBLICATION_TASK_DIR;
  if (!path.isAbsolute(taskDir)) return deny('configured task directory must be absolute');
  try {
    if (!fs.statSync(path.join(taskDir, 'task.md')).isFile()) throw new Error('missing task');
    readArtifactIndex(taskDir);
  } catch { return deny('configured task or artifact index is missing or invalid'); }
  let workdir, repo;
  try {
    workdir = event.input.cwd ? path.resolve(cwd, event.input.cwd) : cwd;
    repo = execute(run, 'git', ['rev-parse', '--show-toplevel'], workdir);
    const taskRepo = execute(run, 'git', ['rev-parse', '--show-toplevel'], taskDir);
    if (!path.isAbsolute(repo) || fs.realpathSync(repo) !== fs.realpathSync(taskRepo)) return;
  } catch { return deny('configured task repository scope could not be verified'); }
  if (publication.action === 'unsupported-pr-command') return deny('unsupported PR command syntax; inspect and publish manually after proof');
  if (!['draft-create', 'ready-create', 'ready-existing'].includes(publication.action)) return deny('unrecognized publication action');
  if (publication.action === 'ready-create') return deny('create a draft first to host the capture; ready creation has no hosted proof');
  if (publication.action === 'draft-create') return; // Hosting only; never evidence of a passed ready check.

  try {
    const viewed = JSON.parse(execute(run, 'gh', publication.number
      ? ['pr', 'view', String(publication.number), '--json', 'number,isDraft']
      : ['pr', 'view', '--json', 'number,isDraft'], workdir));
    const number = viewed.number;
    if (!/^[1-9]\d*$/.test(String(number ?? '')) || (publication.number && String(number) !== String(publication.number)) || viewed.isDraft !== true) {
      throw new Error('no matching draft pull request');
    }
    const result = JSON.parse(execute(run, process.execPath, [proofCli, taskDir, repo, String(number)], repo));
    if (result?.ready === true && result.allowed === true && result.status === 'pass') return;
    return deny(`ready publication lacks current proof (${result?.status ?? 'incomplete'}): ${result?.reason ?? 'inspection incomplete'}`);
  } catch {
    return deny('ready publication proof could not be inspected');
  }
}

export default function publicationGuard(pi) {
  pi.on('tool_call', event => guardPublicationCall(event));
}
