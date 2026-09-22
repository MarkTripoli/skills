import path from 'node:path';
import { digest, section } from './artifacts.mjs';
import { parseArtifactText, validateArtifactIndex } from './artifact-index.mjs';

function committed(cwd, relative, git) {
  return git(cwd, ['show', `HEAD:${relative}`], true, true);
}

function committedBlob(cwd, relative, git, label) {
  const entry = git(cwd, ['ls-tree', 'HEAD', '--', relative], true);
  if (entry === null || entry === '') return null;
  const tab = entry.indexOf('\t');
  const [mode, type] = entry.slice(0, tab).split(' ');
  if (!['100644', '100755'].includes(mode) || type !== 'blob') throw new Error(`${label} is not a committed regular file`);
  return committed(cwd, relative, git);
}

export function committedChildCompletion(cwd, child, git) {
  const childRelative = path.relative(cwd, child.taskDir).split(path.sep).join('/');
  if (!childRelative || childRelative === '..' || childRelative.startsWith('../')) {
    throw new Error(`Child task ${child.slug} is outside its repository`);
  }
  const indexText = committedBlob(cwd, `${childRelative}/index.json`, git, `Committed child index for ${child.slug}`);
  if (indexText === null) {
    const legacy = committed(cwd, `${childRelative}/pr-description.md`, git);
    return Boolean(legacy && section(legacy, 'Purpose') && section(legacy, 'Change outline'));
  }

  let value;
  try { value = JSON.parse(indexText); }
  catch (error) { throw new Error(`Committed child index for ${child.slug} is invalid JSON`, { cause: error }); }
  const index = validateArtifactIndex(value, child.slug);
  for (const series of Object.values(index.artifactSeries)) for (const record of series.iterations) {
    const relative = `${childRelative}/${record.path}`;
    const artifact = committedBlob(cwd, relative, git, `Committed indexed artifact ${record.id}`);
    if (artifact === null) throw new Error(`Committed indexed artifact ${record.id} is missing ${record.path}`);
    if (digest(artifact) !== record.sha256) throw new Error(`Committed indexed artifact ${record.id} has a SHA-256 digest mismatch`);
    const metadata = parseArtifactText(artifact, record.type, `Committed indexed artifact ${record.id}`);
    if (metadata.type !== record.type || metadata.status !== record.status || metadata.summary !== record.summary) throw new Error(`Committed indexed artifact ${record.id} has mismatched type, status, or summary`);
  }
  const series = index.artifactSeries['pull-request.description'];
  if (!series) return false;
  const record = series.iterations.find(iteration => iteration.id === series.current);
  if (!record || record.type !== 'pr-description') throw new Error(`Committed indexed PR evidence for ${child.slug} has an invalid current record`);
  const artifact = committedBlob(cwd, `${childRelative}/${record.path}`, git, `Committed indexed PR evidence for ${child.slug}`);
  if (!section(artifact, 'Purpose') || !section(artifact, 'Change outline')) throw new Error(`Committed indexed PR evidence for ${child.slug} is incomplete`);
  return true;
}
