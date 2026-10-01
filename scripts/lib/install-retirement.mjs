import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { destinations } from './install-plan.mjs';

export const RETIRED_SKILLS = ['agent-first-sergent', 'configure-workspaces', 'review-loop', 'run-task', 'setup-worktree', 'start-task'];
export const RETIRED_WORKERS = ['agent-first-sergent'];
export const MARK_BEGIN = '# >>> MarkTripoli/skills workers (managed by the installer; edits inside are overwritten)';
export const MARK_END = '# <<< MarkTripoli/skills workers';
// Packaged SHA-256 inventories from target history through sourceHead. Runtime cleanup never depends on Git.
const BASELINES = JSON.parse(fs.readFileSync(new URL('./retirement-baselines.json', import.meta.url), 'utf8'));
const ATOMIC_ENTRY = "export { default } from './skills-delivery/workflows/delivery.ts';\n";
const exists = file => fs.existsSync(file) || (() => { try { fs.lstatSync(file); return true; } catch { return false; } })();

export function managedRange(text) {
  const begin = text.indexOf(MARK_BEGIN);
  const end = text.indexOf(MARK_END, begin + MARK_BEGIN.length);
  return begin !== -1 && end > begin ? { begin, bodyStart: begin + MARK_BEGIN.length, bodyEnd: end, end: end + MARK_END.length } : null;
}
export function configBlocks(block) {
  const sections = new Map(); let name = null; let lines = [];
  const commit = () => { if (name) sections.set(name, lines.join('\n').trim()); };
  for (const line of block.trim().split('\n')) {
    const heading = /^\[agents\.([^\]]+)\]$/.exec(line);
    if (heading) { commit(); name = heading[1]; lines = [line]; } else if (name) lines.push(line);
  }
  commit(); return sections;
}

// Walk only under the selected scope boundary; OS aliases above it (e.g. /var on macOS) are not installed resources.
function safePath(file, boundary) {
  const relative = path.relative(boundary, file);
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
  let cursor = boundary;
  for (const part of ['', ...relative.split(path.sep).filter(Boolean)]) {
    if (part) cursor = path.join(cursor, part);
    if (!exists(cursor)) continue;
    if (fs.lstatSync(cursor).isSymbolicLink()) return false;
  }
  return true;
}
function plainFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const inner = plainFiles(file, base);
      if (!inner) return null;
      out.push(...inner);
    } else if (entry.isFile()) out.push(path.relative(base, file).split(path.sep));
    else return null;
  }
  return out;
}
function fingerprint(file) {
  const stat = fs.lstatSync(file);
  const hash = createHash('sha256');
  if (stat.isFile()) return hash.update(fs.readFileSync(file)).digest('hex');
  if (!stat.isDirectory()) return null;
  const files = plainFiles(file);
  if (!files) return null;
  // Include empty directories too, so additions between planning and apply cannot be silently erased.
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = path.join(dir, entry.name);
      hash.update(entry.isDirectory() ? 'dir\0' : 'file\0').update(path.relative(file, child)).update('\0');
      if (entry.isDirectory()) visit(child); else hash.update(fs.readFileSync(child)).update('\0');
    }
  };
  visit(file); return hash.digest('hex');
}
function matchesTree(dir, snapshots, { helperPrefix = null, yaml = false } = {}) {
  if (!fs.lstatSync(dir).isDirectory()) return false;
  const files = plainFiles(dir);
  if (!files) return false;
  const actual = new Map(files.map(parts => [parts.join('/'), fingerprint(path.join(dir, ...parts))]));
  const directories = new Set();
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) if (entry.isDirectory()) {
      const child = path.join(current, entry.name);
      directories.add(path.relative(dir, child).split(path.sep).join('/')); visit(child);
    }
  };
  visit(dir);
  const equals = (expected, digest) => Array.isArray(expected) ? expected.includes(digest) : expected === digest;
  return snapshots.some(snapshot => {
    const expected = new Map(Object.entries(snapshot.files));
    if (helperPrefix) for (const [name, digests] of Object.entries(BASELINES.helpers)) {
      const relative = `${helperPrefix}/${name}`;
      if (actual.has(relative)) expected.set(relative, digests);
    }
    if (snapshot.codexInterface && actual.has('agents/openai.yaml')) expected.set('agents/openai.yaml', snapshot.codexInterface);
    if (yaml && [...actual.keys()].some(name => name.startsWith('node_modules/'))) {
      for (const [name, digest] of Object.entries(BASELINES.yaml.files)) expected.set(`node_modules/yaml/${name}`, digest);
    }
    if (expected.size !== actual.size || [...expected].some(([name, digest]) => !equals(digest, actual.get(name)))) return false;
    const expectedDirectories = new Set();
    for (const file of expected.keys()) {
      const parts = file.split('/');
      for (let count = 1; count < parts.length; count += 1) expectedDirectories.add(parts.slice(0, count).join('/'));
    }
    return directories.size === expectedDirectories.size && [...directories].every(name => expectedDirectories.has(name));
  });
}
function matchesWorker(file) {
  try { return BASELINES.workers[path.basename(file)]?.includes(fingerprint(file)) === true; }
  catch { return false; }
}

// Sweep all runtimes at the selected scope, including directories older installers populated implicitly.
export function retiredSweep({ project, cwd, home, env }) {
  const remove = []; const keep = []; const seen = new Set();
  const consider = (file, label, boundary, recognize) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!exists(file)) return;
    try {
      if (!safePath(file, boundary)) throw new Error('a path component is symlinked');
      const digest = fingerprint(file);
      if (!digest) throw new Error('it contains a symlink or non-plain file');
      const recognized = recognize();
      if (!recognized) throw new Error('it does not exactly match a recorded shipped inventory; edited, extra or unknown contents are not ours to remove');
      remove.push({ path: file, label, digest, ...(typeof recognized === 'object' ? recognized : {}) });
    } catch (error) { keep.push(`kept ${label} ${file}: ${error.message}`); }
  };
  for (const runtime of ['claude-code', 'codex', 'oh-my-pi', 'pi', 'portable']) {
    const dest = destinations(runtime, { project, cwd, home, env });
    const boundary = project ? cwd : runtime === 'claude-code' && env.CLAUDE_CONFIG_DIR ? path.resolve(env.CLAUDE_CONFIG_DIR) : runtime === 'codex' && env.CODEX_HOME ? path.resolve(env.CODEX_HOME) : home;
    const protectedWorkers = new Set();
    if (dest.skills) for (const name of RETIRED_SKILLS) {
      const skillBoundary = !project && runtime === 'codex' ? home : boundary;
      consider(path.join(dest.skills, name), `retired skill ${name}`, skillBoundary, () => matchesTree(path.join(dest.skills, name), BASELINES.skills[name], { helperPrefix: 'references' }));
    }
    if (dest.config && exists(dest.config)) {
      // An unmarked config is unrelated and produces no cleanup note.
      let text = null;
      try { if (safePath(dest.config, boundary) && fs.lstatSync(dest.config).isFile()) text = fs.readFileSync(dest.config, 'utf8'); } catch { /* retain unreadable configuration and its worker */ }
      if (text !== null) {
        const range = managedRange(text);
        const blocks = range ? configBlocks(text.slice(range.bodyStart, range.bodyEnd)) : new Map();
        for (const heading of text.matchAll(/^\[agents\.([^\]\n]+)\]$/gm)) {
          if (RETIRED_WORKERS.includes(heading[1]) && (!range || heading.index < range.bodyStart || heading.index >= range.bodyEnd)) protectedWorkers.add(heading[1]);
        }
        const present = RETIRED_WORKERS.filter(name => blocks.has(name));
        const removable = present.filter(name => {
          const expected = `[agents.${name}]\nconfig_file = "./agents/${name}.toml"`;
          const worker = path.join(path.dirname(dest.config), 'agents', `${name}.toml`);
          const headings = [...text.matchAll(/^\[agents\.([^\]\n]+)\]$/gm)].filter(heading => heading[1] === name);
          return headings.length === 1 && !protectedWorkers.has(name) && blocks.get(name) === expected && (!exists(worker) || (safePath(worker, boundary) && matchesWorker(worker)));
        });
        for (const name of present.filter(name => !removable.includes(name))) {
          protectedWorkers.add(name);
          keep.push(`kept retired worker entry ${name} in ${dest.config}: its section or worker is edited or unknown`);
        }
        if (removable.length) consider(dest.config, `retired worker entry ${removable.join(', ')} in`, boundary, () => ({ config: removable }));
      } else {
        for (const name of RETIRED_WORKERS) protectedWorkers.add(name);
        keep.push(`kept config ${dest.config}: it is symlinked, unreadable or not a plain file`);
      }
    }
    if (dest.agents) for (const name of RETIRED_WORKERS) for (const ext of ['md', 'toml']) {
      const file = path.join(dest.agents, `${name}.${ext}`);
      consider(file, `retired worker ${name}`, boundary, () => {
        if (ext === 'toml' && protectedWorkers.has(name)) throw new Error('an edited or unmanaged configuration still references this worker');
        return matchesWorker(file);
      });
    }
  }
  const agentDirs = project ? [] : [...new Set([env.ATOMIC_CODING_AGENT_DIR, path.join(home, '.atomic', 'agent')].filter(Boolean).map(dir => path.resolve(dir)))];
  const workflows = project ? [[path.join(cwd, '.atomic', 'workflows'), cwd]] : agentDirs.map(dir => [path.join(dir, 'workflows'), dir.startsWith(home + path.sep) ? home : dir]);
  for (const [dir, boundary] of workflows) {
    const tree = path.join(dir, 'skills-delivery'); const entry = path.join(dir, 'skills-delivery.mjs');
    let entryText = null;
    try { if (exists(entry) && safePath(entry, boundary) && fs.lstatSync(entry).isFile()) entryText = fs.readFileSync(entry, 'utf8'); } catch { /* guarded below */ }
    const entryExact = entryText === ATOMIC_ENTRY;
    const entryImports = exists(entry) && !entryExact && (entryText === null || entryText.includes('./skills-delivery/'));
    let treeExact = false;
    try { treeExact = exists(tree) && safePath(tree, boundary) && matchesTree(tree, BASELINES.atomic, { helperPrefix: 'shared', yaml: true }); } catch { /* guarded below */ }
    consider(tree, 'retired Atomic delivery workflow', boundary, () => {
      if (!fs.existsSync(path.join(tree, 'workflows', 'delivery.ts'))) throw new Error('it has no workflows/delivery.ts');
      if (entryImports) throw new Error(`the edited entry ${entry} still imports it or cannot be read safely`);
      return treeExact;
    });
    consider(entry, 'retired Atomic delivery entry', boundary, () => {
      if (!entryExact) throw new Error('it is not the one-line re-export the old --atomic install wrote');
      if (exists(tree) && !treeExact) throw new Error('its workflow tree contains edited, extra or unknown contents and still needs this entry');
      return true;
    });
  }
  const root = project ? cwd : home;
  for (const pack of ['delivery', 'delivery-omp']) {
    const dir = path.join(root, '.archon', 'workflows', pack);
    consider(dir, `retired Archon pack ${pack}`, root, () => {
      return matchesTree(dir, BASELINES.packs[pack]);
    });
  }
  for (const runtime of ['omp', 'pi']) {
    const dir = path.join(root, `.${runtime}`, ...(project ? [] : ['agent']), 'extensions', 'run-task');
    consider(dir, 'retired run-task extension', root, () => {
      return matchesTree(dir, BASELINES.extensions[runtime]);
    });
  }
  return { remove, keep };
}

export function currentRetiredItems(step) {
  // Re-recognize both ownership and contents at apply time, protecting edits and changed imports after a dry plan.
  const current = new Map(retiredSweep(step.scope).remove.map(item => [item.path, item]));
  return step.items.filter(item => current.get(item.path)?.digest === item.digest);
}
