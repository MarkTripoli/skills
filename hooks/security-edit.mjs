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
const inside = (root, file) => file !== root && !path.relative(root, file).startsWith(`..${path.sep}`) && path.relative(root, file) !== '..' && !path.isAbsolute(path.relative(root, file));
const isEnvironmentFile = file => /(^|\/)\.env(?:\.|$)/i.test(file);

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
  let relative = null;
  while (true) {
    try {
      if (fs.realpathSync(ancestor) === root) relative = path.relative(ancestor, lexical).split(path.sep).join('/');
    } catch {}
    const parent = path.dirname(ancestor);
    if (parent === ancestor) return relative;
    ancestor = parent;
  }
}
function savedFile(root, name) {
  const lexical = path.resolve(root, name);
  let real;
  try { real = fs.realpathSync(lexical); }
  catch {
    if (!inside(root, lexical)) return { reason: 'changed path is outside the repository' };
    return { reason: 'changed file is missing after tool completion' };
  }
  if (!inside(root, real)) return { reason: 'changed file resolves outside the repository' };
  let parent;
  try { parent = fs.realpathSync(path.dirname(lexical)); }
  catch { return { reason: 'changed file is unavailable after tool completion' }; }
  if (parent !== root && !inside(root, parent)) return { reason: 'changed path is outside the repository' };
  const relative = authorizedRelative(root, lexical);
  if (!relative) return { reason: 'changed path is outside the repository' };
  const targetRelative = path.relative(root, real).split(path.sep).join('/');
  if (isEnvironmentFile(relative) || isEnvironmentFile(targetRelative)) return { path: relative, relative, reason: 'environment files are not scanned' };
  let fd;
  try {
    fd = fs.openSync(real, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile()) return { relative, reason: 'changed path is not a regular file' };
    if (before.size > BigInt(MAX_SNAPSHOT_BYTES)) return { relative, reason: 'changed file exceeds the 5 MiB scan snapshot limit' };
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!count) break;
      offset += count;
    }
    const extra = Buffer.alloc(1);
    const after = fs.fstatSync(fd, { bigint: true });
    const currentPath = fs.realpathSync(real);
    if (!inside(root, currentPath)) return { relative, reason: 'changed file resolves outside the repository' };
    const current = fs.statSync(currentPath, { bigint: true });
    if (offset !== bytes.length || fs.readSync(fd, extra, 0, 1, bytes.length) !== 0
      || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || before.dev !== current.dev || before.ino !== current.ino) {
      return { relative, reason: 'changed file changed while preparing its scan snapshot' };
    }
    return { path: real, relative, bytes };
  } catch {
    return { relative, reason: 'changed file cannot be read' };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
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
  const root = fs.realpathSync(cwd);
  const paths = fileNames(event);
  if (!paths.length) return { coverage: 'incomplete', results: [], lanes: [incomplete('dispatch', 'successful tool_result contained no changed file paths')] };
  const results = [];
  const failed = [];
  for (const name of paths) {
    const file = savedFile(root, name);
    if (!file.path) { failed.push(incomplete('dispatch', `${file.reason}: ${name}`)); continue; }
    if (file.reason) { failed.push(incomplete('dispatch', `${file.reason}: ${file.path}`)); continue; }
    results.push(scanFile(file, { cwd: root, env, run }));
  }
  const coverage = failed.length || results.some(item => item.coverage !== 'complete') ? 'incomplete' : 'complete';
  return { coverage, results, lanes: failed };
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
