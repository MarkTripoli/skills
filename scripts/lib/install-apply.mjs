import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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

const SAFE_HOOK_REMOVE_SCRIPT = String.raw`import errno, json, os, stat, sys
if not hasattr(os, 'O_NOFOLLOW') or not hasattr(os, 'O_DIRECTORY'):
    raise SystemExit(1)
root_fd = os.dup(3)

def fail():
    raise RuntimeError('unsafe OMP hook destination or secure removal unavailable')

def path_parts(value):
    if not value or value.startswith('/'):
        fail()
    parts = value.split('/')
    if any(part in ('', '.', '..') for part in parts):
        fail()
    return parts

def open_parent(parts):
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

def check(parts, expected):
    parent = open_parent(parts)
    if parent is None:
        return
    try:
        try:
            info = os.stat(parts[-1], dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            return
        except OSError:
            fail()
        valid = stat.S_ISREG(info.st_mode) if expected == 'file' else stat.S_ISDIR(info.st_mode)
        if not valid:
            fail()
    finally:
        os.close(parent)

def remove_file(parts):
    parent = open_parent(parts)
    if parent is None:
        return
    try:
        check(parts, 'file')
        try:
            os.unlink(parts[-1], dir_fd=parent)
        except FileNotFoundError:
            pass
        except OSError:
            fail()
    finally:
        os.close(parent)

def remove_empty_dir(parts):
    parent = open_parent(parts)
    if parent is None:
        return
    try:
        check(parts, 'directory')
        try:
            os.rmdir(parts[-1], dir_fd=parent)
        except FileNotFoundError:
            pass
        except OSError as error:
            if error.errno not in (errno.ENOTEMPTY, errno.EEXIST):
                fail()
    finally:
        os.close(parent)

try:
    required = (os.open, os.stat, os.unlink, os.rmdir)
    if not hasattr(os, 'supports_dir_fd') or any(function not in os.supports_dir_fd for function in required):
        fail()
    request = json.loads(sys.stdin.buffer.read())
    files = [path_parts(value) for value in request['files']]
    directories = [path_parts(value) for value in request['directories']]
    for parts in files:
        check(parts, 'file')
    for parts in directories:
        check(parts, 'directory')
    for parts in files:
        remove_file(parts)
    for parts in directories:
        remove_empty_dir(parts)
except Exception:
    sys.stderr.write(json.dumps({'error': 'unsafe OMP hook destination or secure removal unavailable'}))
    sys.exit(1)
finally:
    os.close(root_fd)`;

const SAFE_PROJECT_MUTATION_SCRIPT = String.raw`import json, os, secrets, stat, sys
if not hasattr(os, 'O_NOFOLLOW') or not hasattr(os, 'O_DIRECTORY'):
    raise SystemExit(1)
root_fd = os.dup(3)

def fail():
    raise RuntimeError('unsafe project destination or secure mutation unavailable')

def path_parts(value):
    if not value or value.startswith('/'):
        fail()
    parts = value.split('/')
    if any(part in ('', '.', '..') for part in parts):
        fail()
    return parts

def open_parent(parts, create=False):
    fd = os.dup(root_fd)
    for component in parts[:-1]:
        if create:
            try:
                os.mkdir(component, 0o755, dir_fd=fd)
            except FileExistsError:
                pass
            except OSError:
                os.close(fd)
                fail()
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

def entry_info(parent, name):
    try:
        return os.stat(name, dir_fd=parent, follow_symlinks=False)
    except FileNotFoundError:
        return None
    except OSError:
        fail()

def remove_entry(parent, name, root=False):
    info = entry_info(parent, name)
    if info is None:
        return
    if stat.S_ISDIR(info.st_mode):
        child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
        try:
            for item in os.listdir(child):
                remove_entry(child, item)
        finally:
            os.close(child)
        os.rmdir(name, dir_fd=parent)
        return
    if root and stat.S_ISLNK(info.st_mode):
        fail()
    if not (stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode)):
        fail()
    os.unlink(name, dir_fd=parent)

def remove_path(parts, expected):
    parent = open_parent(parts)
    if parent is None:
        return
    try:
        info = entry_info(parent, parts[-1])
        if info is None:
            return
        if expected == 'file':
            if not stat.S_ISREG(info.st_mode):
                fail()
            os.unlink(parts[-1], dir_fd=parent)
        else:
            if stat.S_ISLNK(info.st_mode):
                fail()
            remove_entry(parent, parts[-1], root=True)
    except OSError:
        fail()
    finally:
        os.close(parent)

def write_file(parent, name, source_fd, mode):
    info = entry_info(parent, name)
    if info is not None and not stat.S_ISREG(info.st_mode):
        fail()
    temporary = '.skills-project-' + secrets.token_hex(12)
    output_fd = None
    try:
        output_fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
        while True:
            chunk = os.read(source_fd, 65536)
            if not chunk:
                break
            view = memoryview(chunk)
            while view:
                written = os.write(output_fd, view)
                if written <= 0:
                    fail()
                view = view[written:]
        os.fchmod(output_fd, mode & 0o777)
        os.fsync(output_fd)
        os.close(output_fd)
        output_fd = None
        os.replace(temporary, name, src_dir_fd=parent, dst_dir_fd=parent)
    except Exception:
        if output_fd is not None:
            os.close(output_fd)
        try:
            os.unlink(temporary, dir_fd=parent)
        except OSError:
            pass
        raise

def copy_file(source, parts):
    source_fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(source_fd)
        if not stat.S_ISREG(info.st_mode):
            fail()
        parent = open_parent(parts, create=True)
        if parent is None:
            fail()
        try:
            write_file(parent, parts[-1], source_fd, info.st_mode)
        finally:
            os.close(parent)
    finally:
        os.close(source_fd)

def copy_contents(source_fd, destination_fd):
    for name in os.listdir(source_fd):
        if name == '.DS_Store':
            continue
        info = os.stat(name, dir_fd=source_fd, follow_symlinks=False)
        if stat.S_ISDIR(info.st_mode):
            source_child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=source_fd)
            os.mkdir(name, 0o755, dir_fd=destination_fd)
            destination_child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=destination_fd)
            try:
                copy_contents(source_child, destination_child)
                os.fchmod(destination_child, info.st_mode & 0o777)
            finally:
                os.close(source_child)
                os.close(destination_child)
        elif stat.S_ISREG(info.st_mode):
            source_file = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=source_fd)
            try:
                source_info = os.fstat(source_file)
                if not stat.S_ISREG(source_info.st_mode):
                    fail()
                write_file(destination_fd, name, source_file, source_info.st_mode)
            finally:
                os.close(source_file)
        elif stat.S_ISLNK(info.st_mode):
            os.symlink(os.readlink(name, dir_fd=source_fd), name, dir_fd=destination_fd)
        else:
            fail()

def copy_tree(source, parts):
    source_fd = os.open(source, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        source_info = os.fstat(source_fd)
        parent = open_parent(parts, create=True)
        if parent is None:
            fail()
        try:
            info = entry_info(parent, parts[-1])
            if info is not None:
                if stat.S_ISLNK(info.st_mode) or not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
                    fail()
                remove_entry(parent, parts[-1], root=True)
            os.mkdir(parts[-1], 0o755, dir_fd=parent)
            destination_fd = os.open(parts[-1], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            try:
                copy_contents(source_fd, destination_fd)
                os.fchmod(destination_fd, source_info.st_mode & 0o777)
            finally:
                os.close(destination_fd)
        finally:
            os.close(parent)
    finally:
        os.close(source_fd)

try:
    required = (os.open, os.mkdir, os.stat, os.unlink, os.rmdir, os.symlink)
    if not hasattr(os, 'supports_dir_fd') or any(function not in os.supports_dir_fd for function in required):
        fail()
    operations = json.loads(sys.stdin.buffer.read())
    for operation in operations:
        parts = path_parts(operation['path'])
        if operation['kind'] == 'remove-tree':
            remove_path(parts, 'tree')
        elif operation['kind'] == 'remove-file':
            remove_path(parts, 'file')
        elif operation['kind'] == 'copy-file':
            copy_file(operation['source'], parts)
        elif operation['kind'] == 'copy-tree':
            copy_tree(operation['source'], parts)
        else:
            fail()
except Exception:
    sys.stderr.write(json.dumps({'error': 'unsafe project destination or secure mutation unavailable'}))
    sys.exit(1)
finally:
    os.close(root_fd)`;

function mutateProject(root, operations) {
  const lexicalRoot = path.resolve(root);
  const rootPath = fs.realpathSync(lexicalRoot);
  const prepared = operations.map(operation => {
    const relative = path.relative(lexicalRoot, path.resolve(operation.destination));
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`refusing project destination outside its root: ${operation.destination}`);
    }
    return {
      kind: operation.kind,
      path: relative.split(path.sep).join('/'),
      ...(operation.source ? { source: path.resolve(operation.source) } : {}),
    };
  });
  let rootFd;
  try {
    rootFd = fs.openSync(rootPath, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY || 0) | (fs.constants.O_NOFOLLOW || 0));
    const result = spawnSync('python3', ['-c', SAFE_PROJECT_MUTATION_SCRIPT], {
      input: JSON.stringify(prepared), encoding: null, timeout: 30_000, maxBuffer: 1024 * 1024,
      stdio: ['pipe', 'ignore', 'pipe', rootFd],
    });
    if (result.error?.code === 'ENOENT') throw new Error('Python 3 is required for safe project installation');
    if (result.error || result.status !== 0) throw new Error('refusing unsafe project destination or secure mutation unavailable');
  } finally {
    if (rootFd !== undefined) fs.closeSync(rootFd);
  }
}

function projectMutationOperations(planned, built, uninstall, stages) {
  const operations = [];
  const add = (kind, destination, source) => operations.push({ kind, destination, source });
  for (const step of planned.steps) {
    if (step.kind === 'skills') {
      for (const name of (uninstall ? (step.removeNames || step.names) : step.names)) {
        add(uninstall ? 'remove-tree' : 'copy-tree', path.join(step.to, name), uninstall ? null : path.join(built.get(step.target), 'skills', name));
      }
    } else if (step.kind === 'agents') {
      for (const name of step.names) {
        const destination = path.join(step.to, `${name}.${step.format}`);
        add(uninstall ? 'remove-file' : 'copy-file', destination, uninstall ? null : path.join(built.get(step.target), 'agents', `${name}.${step.format}`));
      }
    } else if (step.kind === 'workflow') {
      const entry = path.join(path.dirname(step.to), 'skills-delivery.mjs');
      if (uninstall) {
        add('remove-file', entry, null);
        add('remove-tree', step.to, null);
      } else {
        const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-project-workflow-'));
        stages.push(stage);
        const source = path.join(stage, 'skills-delivery');
        copyDir(path.join(repoRoot, 'atomic'), source);
        fs.mkdirSync(path.join(source, 'shared'), { recursive: true });
        for (const name of ['task-artifacts.mjs', 'task-root.mjs', 'publication-proof.mjs', 'publication-proof-policy.mjs']) {
          fs.copyFileSync(path.join(repoRoot, 'shared', name), path.join(source, 'shared', name));
        }
        const yamlRoot = path.dirname(fileURLToPath(import.meta.resolve('yaml/package.json')));
        copyDir(yamlRoot, path.join(source, 'node_modules', 'yaml'));
        const stagedEntry = path.join(stage, 'skills-delivery.mjs');
        fs.writeFileSync(stagedEntry, "export { default } from './skills-delivery/workflows/delivery.ts';\n");
        add('copy-tree', step.to, source);
        add('copy-file', entry, stagedEntry);
      }
    } else if (step.kind === 'config') {
      throw new Error('project-scoped configuration writes are unsupported by the descriptor-safe installer');
    }
  }
  return operations;
}

function hookSets(planned) {
  return planned.steps.flatMap(step => {
    if (step.kind === 'security-edit-hook') return [{ root: step.root, to: step.to, names: securityHookFiles, directories: ['hooks', ''] }];
    if (step.kind === 'publication-hook') return [{ root: step.root, to: step.to, names: publicationFiles, directories: ['hooks', 'shared', ''] }];
    return [];
  });
}

function removeHookFiles(sets) {
  const roots = new Set(sets.map(set => set.root));
  if (roots.size !== 1) throw new Error('OMP hooks must share one trusted installation root');
  const [root] = roots;
  const paths = values => values.map(value => path.relative(root, value).split(path.sep).join('/'));
  const files = paths(sets.flatMap(({ to, names }) => names.map(name => path.join(to, name))));
  const directories = paths(sets.flatMap(({ to, directories: names }) => names.map(name => path.join(to, name))));
  let rootFd;
  try {
    rootFd = fs.openSync(fs.realpathSync(root), fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY || 0) | (fs.constants.O_NOFOLLOW || 0));
    const result = spawnSync('python3', ['-c', SAFE_HOOK_REMOVE_SCRIPT], {
      input: JSON.stringify({ files, directories }), encoding: null, timeout: 30_000, maxBuffer: 1024 * 1024,
      stdio: ['pipe', 'ignore', 'pipe', rootFd],
    });
    if (result.error?.code === 'ENOENT') throw new Error('Python 3 is required for safe OMP hook removal');
    if (result.error || result.status !== 0) throw new Error('refusing unsafe OMP hook destination or secure removal unavailable');
  } finally {
    if (rootFd !== undefined) fs.closeSync(rootFd);
  }
}

function preflightProjectDestinations(planned, uninstall) {
  if (!planned.projectRoot) return;
  const lexicalRoot = path.resolve(planned.projectRoot);
  const root = fs.realpathSync(lexicalRoot);
  const destinations = [];
  for (const step of planned.steps) {
    if (step.kind === 'skills') {
      const names = uninstall ? (step.removeNames || step.names) : step.names;
      destinations.push(...names.map(name => path.join(step.to, name)));
    } else if (step.kind === 'agents') {
      destinations.push(...step.names.map(name => path.join(step.to, `${name}.${step.format}`)));
    } else if (step.kind === 'config') destinations.push(step.to);
    else if (step.kind === 'security-edit-hook' || step.kind === 'publication-hook') {
      destinations.push(...step.kind === 'security-edit-hook'
        ? securityHookFiles.map(name => path.join(step.to, name))
        : publicationFiles.map(name => path.join(step.to, name)));
    } else if (step.kind === 'workflow') {
      destinations.push(step.to, path.join(path.dirname(step.to), 'skills-delivery.mjs'));
    }
  }
  for (const destination of destinations) {
    const relative = path.relative(lexicalRoot, path.resolve(destination));
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`refusing project destination outside its root: ${destination}`);
    }
    let current = root;
    for (const component of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, component);
      let info;
      try { info = fs.lstatSync(current); }
      catch (error) { if (error.code === 'ENOENT') break; throw error; }
      if (info.isSymbolicLink()) throw new Error(`refusing symlinked project destination: ${destination}`);
    }
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
  preflightProjectDestinations(planned, uninstall);
  if (planned.projectRoot) {
    const stages = [];
    try {
      const operations = projectMutationOperations(planned, built, uninstall, stages);
      if (operations.length > 0) mutateProject(planned.projectRoot, operations);
    } finally {
      for (const stage of stages) fs.rmSync(stage, { recursive: true, force: true });
    }
  }
  const hooks = hookSets(planned);
  if (uninstall && hooks.length > 0) removeHookFiles(hooks);
  else if (hooks.length > 0) copyHookFiles(hooks);
  for (const step of planned.steps) {
    const tree = built.get(step.target);
    switch (step.kind) {
      case 'skills':
        if (!planned.projectRoot) {
          for (const name of (uninstall ? (step.removeNames || step.names) : step.names)) {
            const to = path.join(step.to, name);
            if (uninstall) fs.rmSync(to, { recursive: true, force: true }); else copyDir(path.join(tree, 'skills', name), to);
          }
        }
        done.push(`${uninstall ? 'removed' : 'wrote'} ${(uninstall ? (step.removeNames || step.names) : step.names).length} skills under ${short(step.to, home)}`); break;
      case 'agents':
        if (!planned.projectRoot) {
          for (const name of step.names) {
            const to = path.join(step.to, `${name}.${step.format}`);
            if (uninstall) fs.rmSync(to, { force: true }); else { fs.mkdirSync(step.to, { recursive: true }); fs.copyFileSync(path.join(tree, 'agents', `${name}.${step.format}`), to); }
          }
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
        done.push(`${uninstall ? 'removed' : 'installed'} Oh My Pi edit-time security advisory ${short(path.join(step.to, 'hooks', 'security-edit.mjs'), home)}; register with omp --hook=<installed-path>`);
        break;
      }
      case 'publication-hook': {
        done.push(`${uninstall ? 'removed' : 'installed'} optional OMP Bash publication guard ${short(path.join(step.to, 'hooks', 'omp-publication.mjs'), home)}; ${uninstall ? 'registration was not changed' : 'launch with omp --hook=<installed-path> and SKILLS_PUBLICATION_TASK_DIR=<absolute-task-dir>; only intercepted Bash calls are guarded (not direct shell or Codex)'}`); break;
      }
      case 'workflow': {
        if (!planned.projectRoot) {
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
