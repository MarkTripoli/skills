import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_TASK_ROOT = '.agents/tasks';

const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md'];
const RESERVED_ROOTS = ['.git', '.agents/skills', '.atomic-delivery'];
const DIRECTIVE = /<!-- skills:task-root=([^\r\n]*?) -->/g;

function lstatIfPresent(file) {
  try { return fs.lstatSync(file); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

export function parseTaskRootDirectives(contents) {
  return [...String(contents).matchAll(DIRECTIVE)].map(match => match[1]);
}

export function normalizeTaskRoot(value, source = 'task-root directive') {
  if (typeof value !== 'string' || !value) throw new Error(`${source} task root is empty`);
  if (value.includes('\0')) throw new Error(`${source} task root contains NUL`);
  if (value.includes('\\')) throw new Error(`${source} task root contains a backslash`);
  if (path.posix.isAbsolute(value) || /^[A-Za-z]:\//.test(value)) throw new Error(`${source} task root must be relative, not absolute`);
  if (value.includes('~')) throw new Error(`${source} task root cannot use home expansion (~)`);
  if (/\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[^}]*\})|%[A-Za-z_][A-Za-z0-9_]*%/.test(value)) throw new Error(`${source} task root cannot use environment syntax`);
  if (/%[0-9A-Fa-f]{2}/.test(value)) throw new Error(`${source} task root cannot use escaped path bytes`);
  const segments = value.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) throw new Error(`${source} task root contains an empty, dot, or parent segment`);
  if (segments.some(segment => !/^[a-z0-9._-]+$/.test(segment))) throw new Error(`${source} task root must use lowercase portable path segments containing only [a-z0-9._-]`);
  const normalized = segments.join('/');
  if (RESERVED_ROOTS.some(root => normalized === root || normalized.startsWith(`${root}/`))) throw new Error(`${source} task root uses reserved root ${normalized}`);
  return normalized;
}

export function resolveTaskRoot(repositoryRoot) {
  const root = path.resolve(repositoryRoot);
  const declarations = [];
  for (const name of INSTRUCTION_FILES) {
    const file = path.join(root, name);
    const stat = lstatIfPresent(file);
    if (stat === null) continue;
    if (stat.isSymbolicLink()) throw new Error(`Task-root instruction file ${name} must not be a symlink`);
    if (!stat.isFile()) throw new Error(`Task-root instruction file ${name} must be a regular file`);
    const values = parseTaskRootDirectives(fs.readFileSync(file, 'utf8'));
    if (values.length > 1) throw new Error(`Multiple task-root directives found in ${name}`);
    if (values.length === 1) declarations.push({ source: name, value: normalizeTaskRoot(values[0], name) });
  }
  const relativeRoot = declarations[0]?.value ?? DEFAULT_TASK_ROOT;
  if (declarations.some(item => item.value !== relativeRoot)) throw new Error(`Task-root directives disagree: ${declarations.map(item => `${item.source} (${item.value})`).join(', ')}`);
  let current = root;
  for (const segment of relativeRoot.split('/')) {
    current = path.join(current, segment);
    const stat = lstatIfPresent(current);
    if (stat?.isSymbolicLink()) throw new Error(`Task root component ${segment} is a symlink`);
  }
  return { absoluteRoot: path.resolve(root, ...relativeRoot.split('/')), relativeRoot };
}
