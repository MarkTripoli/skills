import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const expandPath = (value, home = os.homedir()) => value === '~' ? home : value.startsWith('~/') ? path.join(home, value.slice(2)) : value;

export function resolveSkillsDir(explicit, worktree, home = os.homedir()) {
  if (explicit !== undefined && (typeof explicit !== 'string' || !explicit.trim())) throw new Error('skills_dir must be a non-empty path');
  if (explicit) return path.resolve(worktree, expandPath(explicit, home));
  const project = path.join(path.resolve(worktree), '.agents', 'skills');
  if (fs.existsSync(project)) {
    if (!fs.lstatSync(project).isDirectory()) throw new Error(`Project skill directory is not a directory: ${project}`);
    return project;
  }
  return path.join(home, '.agents', 'skills');
}
