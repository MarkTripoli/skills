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
const inside = (root, file) => file !== root && !path.relative(root, file).startsWith(`..${path.sep}`) && path.relative(root, file) !== '..' && !path.isAbsolute(path.relative(root, file));

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

function savedFile(root, name) {
  const lexical = path.resolve(root, name);
  if (!inside(root, lexical)) return { reason: 'changed path is outside the repository' };
  let real;
  try { real = fs.realpathSync(lexical); }
  catch { return { reason: 'changed file is missing after tool completion' }; }
  if (!inside(root, real)) return { reason: 'changed file resolves outside the repository' };
  try { if (!fs.statSync(real).isFile()) return { reason: 'changed path is not a regular file' }; }
  catch { return { reason: 'changed file is unavailable after tool completion' }; }
  const relative = path.relative(root, real).split(path.sep).join('/');
  if (/(^|\/)\.env(?:\.|$)/i.test(relative)) return { path: relative, reason: 'environment files are not scanned' };
  try { fs.readFileSync(real); }
  catch { return { path: relative, reason: 'changed file cannot be read' }; }
  return { path: real, relative };
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
  const lanes = [];
  if (/(^|\/)dockerfile(?:\..*)?$/i.test(file.relative)) {
    lanes.push(lane('hadolint', 'hadolint', ['--format', 'json'], file.path, cwd, run, parseHadolint));
  }
  if (/^\.github\/workflows\/[^/]+\.ya?ml$/i.test(file.relative)) {
    lanes.push(lane('actionlint', 'actionlint', ['-format', '{{json .}}'], file.path, cwd, run, parseActionlint));
  }
  const rules = env.SKILLS_SECURITY_SEMGREP_RULES;
  if (rules && localPath(rules)) {
    lanes.push(lane('semgrep', 'semgrep', ['scan', '--json', '--config', rules, '--metrics=off', '--disable-version-check'], file.path, cwd, run, parseSemgrep));
  } else {
    lanes.push(incomplete('semgrep', rules ? 'configured local rules path unavailable' : 'local rules not configured; no registry fetch attempted'));
  }
  const cache = env.TRIVY_CACHE_DIR || path.join(os.homedir(), '.cache', 'trivy');
  const db = path.join(path.resolve(cache), 'db', 'trivy.db');
  if (localFile(db)) {
    lanes.push(lane('trivy_fs', 'trivy', ['fs', '--format', 'json', '--scanners', 'vuln', '--skip-db-update', '--skip-java-db-update', '--skip-vex-repo-update', '--offline-scan', '--disable-telemetry', '--skip-version-check'], file.path, cwd, run, stdout => {
      const report = JSON.parse(stdout);
      if (!Array.isArray(report.Results)) throw new Error('invalid output');
      return report.Results.flatMap(result => (result.Vulnerabilities || []).map(v => safeFinding('trivy_fs', file.path, v.LineNumber, v.VulnerabilityID, v.Severity)));
    }));
  } else lanes.push(incomplete('trivy_fs', 'local vulnerability database unavailable; no download attempted'));
  lanes.push(incomplete('trivy_config', 'local Trivy checks bundle not verified; scanner not run'));
  for (const item of lanes) for (const finding of item.findings) finding.path = file.relative;
  return { file: file.relative, coverage: lanes.every(item => item.coverage === 'complete') ? 'complete' : 'incomplete', lanes };
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
