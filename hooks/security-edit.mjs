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
const EDIT_TOOLS = new Set(['write', 'edit', 'patch', 'apply_patch']);
const inside = (root, file) => file !== root && !path.relative(root, file).startsWith(`..${path.sep}`) && path.relative(root, file) !== '..' && !path.isAbsolute(path.relative(root, file));

function successfulResult(event) {
  const result = event?.result ?? event?.toolResult ?? event?.tool_result ?? event?.output;
  const flag = event?.isError ?? event?.is_error ?? result?.isError ?? result?.is_error;
  if (flag === false || event?.success === true || event?.status === 'success' || result?.status === 'success') return true;
  return false;
}

function fileNames(event) {
  const names = new Set();
  const input = event?.input ?? {};
  for (const name of event?.changedPaths ?? []) if (typeof name === 'string') names.add(name);
  if (EDIT_TOOLS.has(event?.toolName)) {
    for (const key of ['path', 'filePath', 'file_path', 'filename']) if (typeof input[key] === 'string') names.add(input[key]);
  }
  for (const value of [event?.result, event?.toolResult, event?.tool_result, event?.output]) {
    for (const key of ['path', 'filePath', 'file_path', 'filename']) if (typeof value?.[key] === 'string') names.add(value[key]);
  }
  for (const value of [input.files, input.paths, input.edits, input.operations, input.changes, event?.result?.files, event?.toolResult?.files, event?.tool_result?.files, event?.output?.files]) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const name = typeof item === 'string' ? item : item?.path ?? item?.filePath ?? item?.file_path;
      if (typeof name === 'string') names.add(name);
    }
  }
  const patches = [input.patch, input.diff, input.changes, event?.result?.patch, event?.toolResult?.patch, event?.tool_result?.patch, event?.output?.patch].filter(value => typeof value === 'string');
  for (const patch of patches) {
    let previousPath = null;
    for (const line of patch.split(/\r?\n/)) {
      const file = /^\*\*\* (Update|Add|Delete) File: (.+)$/.exec(line);
      if (file) {
        previousPath = file[1] === 'Update' ? file[2] : null;
        names.add(file[2]);
      }
      const moved = /^\*\*\* Move to: (.+)$/.exec(line);
      if (moved) {
        if (previousPath) names.delete(previousPath);
        names.add(moved[1]);
        previousPath = null;
      }
      const gitPath = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      if (gitPath) names.add(gitPath[2]);
      const added = /^\+\+\+ b\/(.+)$/.exec(line);
      if (added) names.add(added[1]);
    }
  }
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
  if (!successfulResult(event)) return { coverage: 'incomplete', results: [], lanes: [incomplete('dispatch', 'tool did not report successful completion')] };
  const root = fs.realpathSync(cwd);
  const paths = fileNames(event);
  if (!paths.length) return { coverage: 'incomplete', results: [], lanes: [incomplete('dispatch', 'completed tool result contained no changed file paths')] };
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
  const pending = new Map();
  const editable = EDIT_TOOLS;
  pi.on('tool_call', event => {
    if (!event?.toolCallId) return;
    const paths = fileNames(event);
    if (paths.length) pending.set(event.toolCallId, { toolName: event.toolName, paths });
  });
  pi.on('tool_execution_end', event => {
    const previous = pending.get(event?.toolCallId);
    pending.delete(event?.toolCallId);
    const completed = {
      ...event,
      toolName: event?.toolName ?? previous?.toolName,
      changedPaths: [...new Set([...(previous?.paths ?? []), ...fileNames(event)])],
    };
    if (!completed.changedPaths.length && !editable.has(completed.toolName)) return;
    let result;
    try { result = inspectEditedFile(completed, options); }
    catch { result = { coverage: 'incomplete', results: [], lanes: [incomplete('dispatch', 'post-edit advisory scan could not run')] }; }
    process.stderr.write(`[security advisory] ${JSON.stringify(result)}\n`);
  });
}
