import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const incomplete = (tool, reason) => ({ tool, coverage: 'incomplete', reason, findings: [] });
const safeFinding = (tool, file, line, rule, severity = 'UNKNOWN') => ({
  tool, path: file, line: Number.isSafeInteger(line) && line > 0 ? line : null,
  rule: typeof rule === 'string' && /^[A-Za-z0-9._:/-]{1,120}$/.test(rule) ? rule : 'unknown',
  severity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'INFO', 'WARNING', 'ERROR'].includes(String(severity).toUpperCase()) ? String(severity).toUpperCase() : 'UNKNOWN',
});
const localPath = value => typeof value === 'string' && path.isAbsolute(value) && fs.existsSync(value);
const localFile = value => {
  try { return typeof value === 'string' && path.isAbsolute(value) && fs.statSync(value).isFile(); }
  catch { return false; }
};
const EDIT_TOOLS = new Set(['write', 'edit']);
const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;
const isEnvironmentFile = file => /(^|\/)\.env(?:\.|$)/i.test(file);
const SECURE_READ_SCRIPT = String.raw`import json, os, stat, sys
root_path = os.path.normpath(sys.argv[1])
relative = sys.argv[2]
aliases = json.loads(sys.argv[4])
maximum = int(sys.argv[3])
root_fd = os.dup(3)
fds = [root_fd]
resolved = []
work = relative.split('/')
links = 0
result_bytes = None
result_relative = None
environment_file = False

def is_environment(parts):
    return any(part.lower() == '.env' or part.lower().startswith('.env.') for part in parts)

def changed(reason='secure repository read failed'):
    raise RuntimeError(reason)

def read_file(fd):
    before = os.fstat(fd)
    if not stat.S_ISREG(before.st_mode):
        changed('changed path is not a regular file')
    if before.st_size > maximum:
        changed('changed file exceeds the 5 MiB scan snapshot limit')
    chunks = []
    remaining = before.st_size
    while remaining:
        chunk = os.read(fd, min(65536, remaining))
        if not chunk:
            changed()
        chunks.append(chunk)
        remaining -= len(chunk)
    if os.read(fd, 1):
        changed()
    after = os.fstat(fd)
    current = (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
    latest = (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)
    if current != latest:
        changed()
    return b''.join(chunks)

try:
    if relative.startswith('/') or not relative:
        changed()
    while work:
        component = work.pop(0)
        if component in ('', '.'):
            continue
        if component == '..':
            if len(fds) == 1:
                changed('changed file resolves outside the repository')
            os.close(fds.pop())
            resolved.pop()
            continue
        final = not work
        flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0)
        if final:
            flags |= getattr(os, 'O_NONBLOCK', 0)
        else:
            flags |= getattr(os, 'O_DIRECTORY', 0)
        try:
            child = os.open(component, flags, dir_fd=fds[-1])
        except OSError:
            try:
                target = os.readlink(component, dir_fd=fds[-1])
            except OSError:
                changed()
            links += 1
            if links > 40:
                changed()
            if target.startswith('/'):
                # Canonicalize spelling for containment only; reopen from root_fd below.
                target = os.path.realpath(os.path.normpath(target))
                relative_target = None
                for alias in aliases:
                    try:
                        if os.path.commonpath((alias, target)) == alias:
                            relative_target = os.path.relpath(target, alias)
                            break
                    except ValueError:
                        pass
                if relative_target is None:
                    changed('changed file resolves outside the repository')
                target = relative_target
                for descriptor in fds[1:]:
                    os.close(descriptor)
                fds = fds[:1]
                resolved = []
                work = ([] if target == '.' else target.split('/')) + work
            else:
                work = target.split('/') + work
            continue
        if final:
            actual = resolved + [component]
            result_relative = '/'.join(actual)
            if is_environment(actual):
                environment_file = True
                os.close(child)
            else:
                try:
                    result_bytes = read_file(child)
                finally:
                    os.close(child)
            break
        fds.append(child)
        resolved.append(component)
    if result_relative is None:
        changed()
    sys.stderr.write(json.dumps({'relative': result_relative, 'environment': environment_file}))
    if result_bytes is not None:
        sys.stdout.buffer.write(result_bytes)
except Exception as error:
    message = str(error) if isinstance(error, RuntimeError) else 'secure repository read failed'
    sys.stderr.write(json.dumps({'error': message}))
    sys.exit(1)
finally:
    for descriptor in fds:
        try:
            os.close(descriptor)
        except OSError:
            pass`;

function successfulResult(event) {
  return event?.isError === false;
}

function addPatchPaths(text, names) {
  if (typeof text !== 'string') return;
  let currentPath = null;
  for (const line of text.split(/\r?\n/)) {
    const hashline = /^\[([^\]]+)\]$/.exec(line.trim());
    if (hashline) {
      const taggedPath = /^(.+)#[A-Za-z0-9_-]+$/.exec(hashline[1]);
      currentPath = taggedPath ? taggedPath[1] : hashline[1];
      names.add(currentPath);
    }
    const moved = /^\s*MV\s+(.+?)\s*$/.exec(line);
    if (moved) {
      if (currentPath) names.delete(currentPath);
      currentPath = moved[1];
      names.add(currentPath);
    }
    const file = /^\*\*\* (?:Update|Add|Delete) File: (.+)$/.exec(line);
    if (file) { currentPath = file[1]; names.add(currentPath); }
    const gitPath = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (gitPath) { currentPath = gitPath[2]; names.add(currentPath); }
    const added = /^\+\+\+ b\/(.+)$/.exec(line);
    if (added) { currentPath = added[1]; names.add(currentPath); }
    const outputPath = /^(?:created|wrote|updated|edited|patched)(?:\s+file)?(?:\s+at)?\s*[:=-]\s*(.+)$/i.exec(line.trim());
    if (outputPath) names.add(outputPath[1].replace(/^['\"`]|['\"`]$/g, ''));
  }
}

function addStructuredPaths(value, names, depth = 0) {
  if (depth > 5 || value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) addStructuredPaths(item, names, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (['path', 'filePath', 'file_path', 'filename', 'file'].includes(key) && typeof item === 'string') names.add(item);
    else if (['files', 'paths', 'changedFiles', 'changedPaths', 'modifiedFiles', 'affectedFiles', 'edits', 'operations', 'changes', 'patch', 'diff', 'text', 'content', 'details', 'items', 'results', 'file'].includes(key)) {
      if (typeof item === 'string') addPatchPaths(item, names);
      else addStructuredPaths(item, names, depth + 1);
    }
  }
}

function fileNames(event) {
  const names = new Set();
  const input = event?.input ?? {};
  if (EDIT_TOOLS.has(event?.toolName)) {
    for (const key of ['path', 'filePath', 'file_path', 'filename']) if (typeof input[key] === 'string') names.add(input[key]);
    for (const key of ['patch', 'diff', 'changes']) addPatchPaths(input[key], names);
    for (const key of ['files', 'paths', 'edits', 'operations']) addStructuredPaths(input[key], names);
  }
  for (const value of [event?.details, event?.content]) {
    if (typeof value === 'string') addPatchPaths(value, names);
    else addStructuredPaths(value, names);
  }
  addStructuredPaths(event?.details?.files, names);
  return [...names].filter(name => name && name !== '/dev/null');
}

function authorizedRelative(root, lexical) {
  let ancestor = path.dirname(lexical);
  let authorized = null;
  while (true) {
    try {
      if (fs.realpathSync(ancestor) === root) authorized = {
        relative: path.relative(ancestor, lexical).split(path.sep).join('/'),
        aliasRoot: ancestor,
      };
    } catch {}
    const parent = path.dirname(ancestor);
    if (parent === ancestor) return authorized;
    ancestor = parent;
  }
}

function secureRead(root, rootFd, relative, aliases) {
  const result = spawnSync('python3', ['-I', '-c', SECURE_READ_SCRIPT, root, relative, String(MAX_SNAPSHOT_BYTES), JSON.stringify(aliases)], {
    encoding: null,
    timeout: 30_000,
    maxBuffer: MAX_SNAPSHOT_BYTES + 4096,
    stdio: ['ignore', 'pipe', 'pipe', rootFd],
  });
  if (result.error?.code === 'ENOENT') return { reason: 'Python 3 is required for secure saved-file snapshots' };
  let metadata;
  try { metadata = JSON.parse(result.stderr.toString('utf8')); }
  catch { return { reason: 'secure repository file snapshot metadata was invalid' }; }
  if (result.error || result.status !== 0) {
    return { reason: `secure repository file snapshot failed: ${metadata.error || 'secure repository read failed'}` };
  }
  if (metadata.environment || isEnvironmentFile(metadata.relative)) return { reason: 'environment files are not scanned' };
  if (typeof metadata.relative !== 'string' || !Buffer.isBuffer(result.stdout) || result.stdout.length > MAX_SNAPSHOT_BYTES) {
    return { reason: 'secure repository file snapshot was invalid' };
  }
  return { bytes: result.stdout };
}

function savedFile(root, rootFd, name) {
  const lexical = path.resolve(root, name);
  const authorized = authorizedRelative(root, lexical);
  if (!authorized || !authorized.relative) return { reason: 'changed path is outside the repository' };
  const { relative } = authorized;
  if (isEnvironmentFile(relative)) return { path: relative, relative, reason: 'environment files are not scanned' };
  const snapshot = secureRead(root, rootFd, relative, [...new Set([root, authorized.aliasRoot])]);
  if (snapshot.reason) return { path: relative, relative, reason: snapshot.reason };
  return { path: relative, relative, bytes: snapshot.bytes };
}

function invoke(run, bin, args, cwd) {
  try {
    const result = run(bin, args, { cwd, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    return result && !result.error && typeof result.stdout === 'string' ? result : { error: true, status: null, stdout: '' };
  } catch { return { error: true, status: null, stdout: '' }; }
}

function lane(name, bin, args, file, cwd, run, parse) {
  const version = invoke(run, bin, ['--version'], cwd);
  if (version.error || version.status !== 0) return incomplete(name, 'tool unavailable');
  const result = invoke(run, bin, [...args, file], cwd);
  if (result.error) return incomplete(name, 'tool execution failed');
  let findings;
  try { findings = parse(result.stdout, file); }
  catch { return incomplete(name, 'tool output invalid'); }
  return { tool: name, coverage: result.status === 0 || findings.length ? 'complete' : 'incomplete', findings };
}

function parseHadolint(stdout, file) {
  const rows = JSON.parse(stdout);
  if (!Array.isArray(rows)) throw new Error('invalid output');
  return rows.map(row => safeFinding('hadolint', file, row.line, row.code, row.level));
}
function parseActionlint(stdout, file) {
  if (!stdout.trim()) return [];
  return stdout.trim().split('\n').map(line => {
    const row = JSON.parse(line);
    return safeFinding('actionlint', file, row.line, row.kind, row.severity);
  });
}
function parseSemgrep(stdout, file) {
  const report = JSON.parse(stdout);
  if (!Array.isArray(report.results) || (report.errors !== undefined && (!Array.isArray(report.errors) || report.errors.length > 0))) throw new Error('invalid output');
  return report.results.map(row => safeFinding('semgrep', file, row.start?.line, row.check_id, row.extra?.severity));
}

function scanFile(file, { cwd, env, run }) {
  let snapshotDirectory;
  let snapshot;
  try {
    snapshotDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-security-snapshot-'));
    snapshot = path.join(snapshotDirectory, path.basename(file.relative));
    fs.writeFileSync(snapshot, file.bytes, { flag: 'wx', mode: 0o400 });
  } catch {
    if (snapshotDirectory) fs.rmSync(snapshotDirectory, { recursive: true, force: true });
    return { file: file.relative, coverage: 'incomplete', lanes: [incomplete('dispatch', 'validated file snapshot unavailable')] };
  }
  try {
    const lanes = [];
    if (/(^|\/)dockerfile(?:\..*)?$/i.test(file.relative)) {
      lanes.push(lane('hadolint', 'hadolint', ['--format', 'json'], snapshot, cwd, run, parseHadolint));
    }
    if (/^\.github\/workflows\/[^/]+\.ya?ml$/i.test(file.relative)) {
      lanes.push(lane('actionlint', 'actionlint', ['-format', '{{json .}}'], snapshot, cwd, run, parseActionlint));
    }
    const rules = env.SKILLS_SECURITY_SEMGREP_RULES;
    if (rules && localPath(rules)) {
      lanes.push(lane('semgrep', 'semgrep', ['scan', '--json', '--config', rules, '--metrics=off', '--disable-version-check'], snapshot, cwd, run, parseSemgrep));
    } else {
      lanes.push(incomplete('semgrep', rules ? 'configured local rules path unavailable' : 'local rules not configured; no registry fetch attempted'));
    }
    const cache = env.TRIVY_CACHE_DIR || path.join(os.homedir(), '.cache', 'trivy');
    const db = path.join(path.resolve(cache), 'db', 'trivy.db');
    if (localFile(db)) {
      lanes.push(lane('trivy_fs', 'trivy', ['fs', '--format', 'json', '--scanners', 'vuln', '--skip-db-update', '--skip-java-db-update', '--skip-vex-repo-update', '--offline-scan', '--disable-telemetry', '--skip-version-check'], snapshot, cwd, run, stdout => {
        const report = JSON.parse(stdout);
        if (!Array.isArray(report.Results)) throw new Error('invalid output');
        return report.Results.flatMap(result => (result.Vulnerabilities || []).map(v => safeFinding('trivy_fs', snapshot, v.LineNumber, v.VulnerabilityID, v.Severity)));
      }));
    } else lanes.push(incomplete('trivy_fs', 'local vulnerability database unavailable; no download attempted'));
    lanes.push(incomplete('trivy_config', 'local Trivy checks bundle not verified; scanner not run'));
    for (const item of lanes) for (const finding of item.findings) finding.path = file.relative;
    return { file: file.relative, coverage: lanes.every(item => item.coverage === 'complete') ? 'complete' : 'incomplete', lanes };
  } finally {
    fs.rmSync(snapshotDirectory, { recursive: true, force: true });
  }
}

export function inspectEditedFile(event, { cwd = process.cwd(), env = process.env, run = spawnSync } = {}) {
  if (!EDIT_TOOLS.has(event?.toolName)) return { coverage: 'incomplete', results: [], lanes: [incomplete('dispatch', 'unsupported edit tool')] };
  if (!successfulResult(event)) return { coverage: 'incomplete', results: [], lanes: [incomplete('dispatch', 'tool_result did not report successful completion')] };
  let root;
  let rootFd;
  try {
    root = fs.realpathSync(cwd);
    rootFd = fs.openSync(root, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY || 0) | (fs.constants.O_NOFOLLOW || 0));
  } catch {
    return { coverage: 'incomplete', results: [], lanes: [incomplete('dispatch', 'repository root descriptor is unavailable')] };
  }
  try {
    const paths = fileNames(event);
    if (!paths.length) return { coverage: 'incomplete', results: [], lanes: [incomplete('dispatch', 'successful tool_result contained no changed file paths')] };
    const results = [];
    const failed = [];
    for (const name of paths) {
      const file = savedFile(root, rootFd, name);
      if (!file.path) { failed.push(incomplete('dispatch', `${file.reason}: ${name}`)); continue; }
      if (file.reason) { failed.push(incomplete('dispatch', `${file.reason}: ${file.path}`)); continue; }
      results.push(scanFile(file, { cwd: root, env, run }));
    }
    const coverage = failed.length || results.some(item => item.coverage !== 'complete') ? 'incomplete' : 'complete';
    return { coverage, results, lanes: failed };
  } finally {
    fs.closeSync(rootFd);
  }
}
export default function securityEditHook(pi, options = {}) {
  pi.on('tool_result', event => {
    const paths = fileNames(event);
    if (!EDIT_TOOLS.has(event?.toolName) && !paths.length) return;
    let result;
    try { result = inspectEditedFile(event, options); }
    catch { result = { coverage: 'incomplete', results: [], lanes: [incomplete('dispatch', 'post-edit advisory scan could not run')] }; }
    process.stderr.write(`[security advisory] ${JSON.stringify(result)}\n`);
  });
}
