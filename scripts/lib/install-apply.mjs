import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRuntime, copyTaskArtifactHelper, repoRoot } from './build.mjs';
import { scanSkills } from './layout.mjs';
import { short } from './install-plan.mjs';

const MARK_BEGIN = '# >>> MarkTripoli/skills workers (managed by the installer; edits inside are overwritten)';
const MARK_END = '# <<< MarkTripoli/skills workers';
const noDsStore = src => path.basename(src) !== '.DS_Store';
const publicationFiles = ['hooks/omp-publication.mjs', 'shared/publication-command.mjs', 'shared/publication-proof.mjs', 'shared/publication-proof-policy.mjs', 'shared/task-artifacts.mjs', 'shared/task-root.mjs'];
const securityHookFiles = ['hooks/security-edit.mjs'];
const SAFE_HOOK_COPY_SCRIPT = String.raw`import json, os, secrets, stat, sys
if not hasattr(os, 'O_NOFOLLOW') or not hasattr(os, 'O_DIRECTORY'):
    raise SystemExit(1)
root_fd = os.dup(3)

def fail():
    raise RuntimeError('unsafe OMP hook destination or secure copy unavailable')

def path_parts(value):
    if not value or value.startswith('/'):
        fail()
    parts = value.split('/')
    if any(part in ('', '.', '..') for part in parts):
        fail()
    return parts

def open_existing_parent(parts):
    fd = os.dup(root_fd)
    for component in parts[:-1]:
        try:
            child = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
        except FileNotFoundError:
            os.close(fd)
            return None
        except OSError:
            os.close(fd)
            fail()
        os.close(fd)
        fd = child
    return fd

def check_destination(fd, name):
    try:
        info = os.stat(name, dir_fd=fd, follow_symlinks=False)
    except FileNotFoundError:
        return
    except OSError:
        fail()
    if not stat.S_ISREG(info.st_mode):
        fail()

def open_or_create_parent(parts):
    fd = os.dup(root_fd)
    for component in parts[:-1]:
        try:
            os.mkdir(component, 0o755, dir_fd=fd)
        except FileExistsError:
            pass
        except OSError:
            os.close(fd)
            fail()
        try:
            child = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
        except OSError:
            os.close(fd)
            fail()
        os.close(fd)
        fd = child
    return fd

try:
    if not hasattr(os, 'supports_dir_fd') or os.open not in os.supports_dir_fd or os.mkdir not in os.supports_dir_fd or os.stat not in os.supports_dir_fd:
        fail()
    header, payload = sys.stdin.buffer.read().split(b'\n', 1)
    entries = json.loads(header)
    offset = 0
    for entry in entries:
        size = int(entry['size'])
        entry['parts'] = path_parts(entry['path'])
        entry['bytes'] = payload[offset:offset + size]
        if len(entry['bytes']) != size:
            fail()
        offset += size
    if offset != len(payload):
        fail()
    for entry in entries:
        parent = open_existing_parent(entry['parts'])
        if parent is not None:
            try:
                check_destination(parent, entry['parts'][-1])
            finally:
                os.close(parent)
    for entry in entries:
        parent = open_or_create_parent(entry['parts'])
        temporary = '.skills-hook-' + secrets.token_hex(12)
        fd = None
        try:
            check_destination(parent, entry['parts'][-1])
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
            view = memoryview(entry['bytes'])
            while view:
                written = os.write(fd, view)
                if written <= 0:
                    fail()
                view = view[written:]
            os.fchmod(fd, int(entry['mode']) & 0o777)
            os.fsync(fd)
            os.close(fd)
            fd = None
            os.replace(temporary, entry['parts'][-1], src_dir_fd=parent, dst_dir_fd=parent)
        except Exception:
            if fd is not None:
                os.close(fd)
            try:
                os.unlink(temporary, dir_fd=parent)
            except OSError:
                pass
            raise
        finally:
            os.close(parent)
except Exception:
    sys.stderr.write(json.dumps({'error': 'unsafe OMP hook destination or secure copy unavailable'}))
    sys.exit(1)
finally:
    os.close(root_fd)`;

function copyHookFiles(sets) {
  const roots = new Set(sets.map(set => set.root));
  if (roots.size !== 1) throw new Error('OMP hooks must share one trusted installation root');
  const [root] = roots;
  const rootPath = fs.realpathSync(root);
  const entries = sets.flatMap(({ to, names }) => names.map(name => {
    const source = path.join(repoRoot, name);
    return {
      path: path.relative(root, path.join(to, name)).split(path.sep).join('/'),
      mode: fs.statSync(source).mode & 0o777,
      bytes: fs.readFileSync(source),
    };
  }));
  const manifest = Buffer.from(`${JSON.stringify(entries.map(({ path: relative, mode, bytes }) => ({ path: relative, mode, size: bytes.length })))}\n`);
  const input = Buffer.concat([manifest, ...entries.map(entry => entry.bytes)]);
  let rootFd;
  try {
    rootFd = fs.openSync(rootPath, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY || 0) | (fs.constants.O_NOFOLLOW || 0));
    const result = spawnSync('python3', ['-c', SAFE_HOOK_COPY_SCRIPT], {
      input, encoding: null, timeout: 30_000, maxBuffer: 1024 * 1024,
      stdio: ['pipe', 'ignore', 'pipe', rootFd],
    });
    if (result.error?.code === 'ENOENT') throw new Error('Python 3 is required for safe OMP hook installation');
    if (result.error || result.status !== 0) throw new Error('refusing unsafe OMP hook destination or secure copy unavailable');
  } finally {
    if (rootFd !== undefined) fs.closeSync(rootFd);
  }
}

function copyDir(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, filter: noDsStore });
}
export function updateConfigBlock(text, block) {
  const begin = text.indexOf(MARK_BEGIN); const end = text.indexOf(MARK_END);
  let before = text; let after = '';
  if (begin !== -1 && end !== -1 && end > begin) { before = text.slice(0, begin); after = text.slice(end + MARK_END.length).replace(/^\n/, ''); }
  if (block === null) return `${before.replace(/\n+$/, '\n')}${after}`.replace(/^\n$/, '');
  const body = `${MARK_BEGIN}\n${block.trim()}\n${MARK_END}\n`;
  const separator = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  return `${before}${separator}${body}${after}`;
}
function configBlocks(block) {
  const sections = new Map(); let name = null; let lines = [];
  const commit = () => { if (name) sections.set(name, lines.join('\n').trim()); };
  for (const line of block.trim().split('\n')) {
    const heading = /^\[agents\.([^\]]+)\]$/.exec(line);
    if (heading) { commit(); name = heading[1]; lines = [line]; } else if (name) lines.push(line);
  }
  commit(); return sections;
}
function selectedConfigBlock(text, block, names, uninstall) {
  const begin = text.indexOf(MARK_BEGIN); const end = text.indexOf(MARK_END);
  const managed = begin !== -1 && end > begin ? text.slice(begin + MARK_BEGIN.length, end) : '';
  const merged = configBlocks(managed); const incoming = configBlocks(block);
  for (const name of names) { if (uninstall) merged.delete(name); else if (incoming.has(name)) merged.set(name, incoming.get(name)); }
  return updateConfigBlock(text, [...merged.values()].join('\n\n') || null);
}
export function apply(planned, { built, uninstall, home }) {
  const done = [];
  if (!uninstall) {
    const hookSets = planned.steps.flatMap(step => {
      if (step.kind === 'security-edit-hook') return [{ root: step.root, to: step.to, names: securityHookFiles }];
      if (step.kind === 'publication-hook') return [{ root: step.root, to: step.to, names: publicationFiles }];
      return [];
    });
    if (hookSets.length > 0) copyHookFiles(hookSets);
  }
  for (const step of planned.steps) {
    const tree = built.get(step.target);
    switch (step.kind) {
      case 'skills':
        for (const name of (uninstall ? (step.removeNames || step.names) : step.names)) {
          const to = path.join(step.to, name);
          if (uninstall) fs.rmSync(to, { recursive: true, force: true }); else copyDir(path.join(tree, 'skills', name), to);
        }
        done.push(`${uninstall ? 'removed' : 'wrote'} ${(uninstall ? (step.removeNames || step.names) : step.names).length} skills under ${short(step.to, home)}`); break;
      case 'agents':
        for (const name of step.names) {
          const to = path.join(step.to, `${name}.${step.format}`);
          if (uninstall) fs.rmSync(to, { force: true }); else { fs.mkdirSync(step.to, { recursive: true }); fs.copyFileSync(path.join(tree, 'agents', `${name}.${step.format}`), to); }
        }
        done.push(`${uninstall ? 'removed' : 'wrote'} ${step.names.length} worker definitions under ${short(step.to, home)}`); break;
      case 'config': {
        if (uninstall && !fs.existsSync(step.to)) break;
        const existing = fs.existsSync(step.to) ? fs.readFileSync(step.to, 'utf8') : '';
        const block = uninstall ? '' : fs.readFileSync(path.join(tree, 'config.snippet.toml'), 'utf8');
        const updated = step.complete !== false ? updateConfigBlock(existing, uninstall ? null : block) : selectedConfigBlock(existing, block, step.names, uninstall);
        if (uninstall && updated.trim() === '') fs.rmSync(step.to, { force: true }); else { fs.mkdirSync(path.dirname(step.to), { recursive: true }); fs.writeFileSync(step.to, updated); }
        done.push(`${uninstall ? 'updated selected workers in' : 'updated the workers block in'} ${short(step.to, home)}`); break;
      }
      case 'security-edit-hook': {
        if (uninstall) {
          for (const name of securityHookFiles) fs.rmSync(path.join(step.to, name), { force: true });
        }
        if (uninstall) {
          for (const dir of ['hooks', '']) {
            const target = path.join(step.to, dir);
            if (fs.existsSync(target) && fs.readdirSync(target).length === 0) fs.rmdirSync(target);
          }
        }
        done.push(`${uninstall ? 'removed' : 'installed'} Oh My Pi edit-time security advisory ${short(path.join(step.to, 'hooks', 'security-edit.mjs'), home)}; register with omp --hook=<installed-path>`);
        break;
      }
      case 'publication-hook': {
        if (uninstall) {
          for (const name of publicationFiles) fs.rmSync(path.join(step.to, name), { force: true });
        }
        if (uninstall) {
          for (const dir of ['hooks', 'shared', '']) {
            const target = path.join(step.to, dir);
            if (fs.existsSync(target) && fs.readdirSync(target).length === 0) fs.rmdirSync(target);
          }
        }
        done.push(`${uninstall ? 'removed' : 'installed'} optional OMP Bash publication guard ${short(path.join(step.to, 'hooks', 'omp-publication.mjs'), home)}; ${uninstall ? 'registration was not changed' : 'launch with omp --hook=<installed-path> and SKILLS_PUBLICATION_TASK_DIR=<absolute-task-dir>; only intercepted Bash calls are guarded (not direct shell or Codex)'}`); break;
      }
      case 'workflow': {
        const entry = path.join(path.dirname(step.to), 'skills-delivery.mjs');
        if (uninstall) { fs.rmSync(entry, { force: true }); fs.rmSync(step.to, { recursive: true, force: true }); }
        else {
          copyDir(path.join(repoRoot, 'atomic'), step.to);
          fs.mkdirSync(path.join(step.to, 'shared'), { recursive: true });
          for (const name of ['task-artifacts.mjs', 'task-root.mjs', 'publication-proof.mjs', 'publication-proof-policy.mjs']) fs.copyFileSync(path.join(repoRoot, 'shared', name), path.join(step.to, 'shared', name));
          const yamlRoot = path.dirname(fileURLToPath(import.meta.resolve('yaml/package.json')));
          copyDir(yamlRoot, path.join(step.to, 'node_modules', 'yaml'));
          fs.writeFileSync(entry, "export { default } from './skills-delivery/workflows/delivery.ts';\n");
        }
        done.push(`${uninstall ? 'removed' : 'wrote'} Atomic delivery workflow and entry under ${short(path.dirname(step.to), home)}`); break;
      }
      default: throw new Error(`unknown step ${step.kind}`);
    }
  }
  return done;
}
export function buildTrees(planned, work) {
  const built = new Map(); const selected = new Set(planned.names);
  for (const target of new Set(planned.steps.filter(step => step.kind !== 'workflow').map(step => step.target))) {
    const dest = path.join(work, target);
    if (target === 'portable') {
      fs.mkdirSync(path.join(dest, 'skills'), { recursive: true });
      for (const skill of scanSkills(path.join(repoRoot, 'skills')).skills) if (selected.has(skill.name)) {
        const skillTarget = path.join(dest, 'skills', skill.name);
        fs.cpSync(skill.dir, skillTarget, { recursive: true, filter: noDsStore }); copyTaskArtifactHelper(skillTarget);
      }
    } else buildRuntime(target, dest, { skillNames: planned.names });
    built.set(target, dest);
  }
  return built;
}
