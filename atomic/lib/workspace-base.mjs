import { DEFAULT_TASK_ROOT, normalizeTaskRoot, parseTaskRootDirectives } from './task-storage.mjs';

const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md'];

export function taskRootAtBase(root, base, git) {
  git(root, ['rev-parse', '--verify', `${base}^{commit}`]);
  const declarations = [];
  for (const name of INSTRUCTION_FILES) {
    const entry = git(root, ['ls-tree', base, '--', name], true);
    if (!entry) continue;
    const match = /^(\d+)\s+(\w+)\s+[a-f0-9]+\t/.exec(entry);
    if (!match || match[1] === '120000' || match[2] !== 'blob') throw new Error(`Task-root instruction file ${name} must be a regular file in ${base}`);
    const values = parseTaskRootDirectives(git(root, ['show', `${base}:${name}`], false, true));
    if (values.length > 1) throw new Error(`Multiple task-root directives found in ${name} at ${base}`);
    if (values.length === 1) declarations.push({ source: name, value: normalizeTaskRoot(values[0], name) });
  }
  const relativeRoot = declarations[0]?.value ?? DEFAULT_TASK_ROOT;
  if (declarations.some(item => item.value !== relativeRoot)) throw new Error(`Task-root directives disagree at ${base}: ${declarations.map(item => `${item.source} (${item.value})`).join(', ')}`);
  return relativeRoot;
}
