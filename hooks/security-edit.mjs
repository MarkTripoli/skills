import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const incomplete = (name, reason) => ({ tool: name, coverage: 'incomplete', reason, findings: [] });
const safeFinding = (tool, file, line, rule, severity = 'UNKNOWN') => ({
  tool, path: file, line: Number.isSafeInteger(line) && line > 0 ? line : null,
  rule: typeof rule === 'string' && /^[A-Za-z0-9._:/-]{1,120}$/.test(rule) ? rule : 'unknown',
  severity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'INFO', 'WARNING', 'ERROR'].includes(String(severity).toUpperCase()) ? String(severity).toUpperCase() : 'UNKNOWN',
});
const localFile = value => typeof value === 'string' && path.isAbsolute(value) && fs.existsSync(value);

function changedFile(input, cwd) {
  const name = input?.path ?? input?.filePath ?? input?.file_path ?? input?.filename;
  if (typeof name !== 'string' || !name.trim()) return null;
  const file = path.resolve(cwd, name);
  const relative = path.relative(cwd, file);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  const body = [input.content, input.newText, input.new_text, input.newString].find(value => typeof value === 'string');
  if (body === undefined) return null;
  return { file, relative: relative.split(path.sep).join('/'), body };
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

export function inspectEditedFile(event, { cwd = process.cwd(), env = process.env, run = spawnSync } = {}) {
  if (event?.toolName !== 'write' && event?.toolName !== 'edit') return { supported: false, coverage: 'incomplete', lanes: [incomplete('dispatch', 'unsupported tool callback')] };
  const changed = changedFile(event.input, cwd);
  if (!changed) return { supported: true, coverage: 'incomplete', lanes: [incomplete('dispatch', 'changed file content unavailable')] };

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-security-hook-'));
  try {
    const staged = path.join(temp, path.basename(changed.file));
    fs.writeFileSync(staged, changed.body, { mode: 0o600 });
    const lanes = [];
    const lower = changed.file.toLowerCase();
    if (/(^|\/)dockerfile(?:\..*)?$/.test(lower)) {
      lanes.push(lane('hadolint', 'hadolint', ['--format', 'json'], staged, cwd, run, parseHadolint));
    }
    if (/\.github\/workflows\/[^/]+\.ya?ml$/i.test(changed.relative)) {
      lanes.push(lane('actionlint', 'actionlint', ['-format', '{{json .}}'], staged, cwd, run, parseActionlint));
    }
    const rules = env.SKILLS_SECURITY_SEMGREP_RULES;
    if (rules) {
      if (localFile(rules)) lanes.push(lane('semgrep', 'semgrep', ['scan', '--json', '--config', rules, '--metrics=off', '--disable-version-check'], staged, cwd, run, parseSemgrep));
      else lanes.push(incomplete('semgrep', 'configured local rules path unavailable'));
    } else lanes.push(incomplete('semgrep', 'local rules not configured; no registry fetch attempted'));

    const cache = env.TRIVY_CACHE_DIR || path.join(os.homedir(), '.cache', 'trivy');
    const db = path.join(cache, 'db', 'trivy.db');
    if (localFile(db)) {
      lanes.push(lane('trivy_fs', 'trivy', ['fs', '--format', 'json', '--scanners', 'vuln', '--skip-db-update', '--skip-java-db-update', '--skip-vex-repo-update', '--offline-scan', '--disable-telemetry', '--skip-version-check'], staged, cwd, run, stdout => {
        const report = JSON.parse(stdout);
        if (!Array.isArray(report.Results)) throw new Error('invalid output');
        return report.Results.flatMap(result => (result.Vulnerabilities || []).map(v => safeFinding('trivy_fs', changed.relative, v.LineNumber || null, v.VulnerabilityID, v.Severity)));
      }));
    } else lanes.push(incomplete('trivy_fs', 'local vulnerability database unavailable; no download attempted'));
    lanes.push(incomplete('trivy_config', 'local Trivy checks bundle not verified; scanner not run'));

    for (const item of lanes) for (const finding of item.findings) finding.path = changed.relative;
    return { supported: true, coverage: lanes.every(item => item.coverage === 'complete') ? 'complete' : 'incomplete', file: changed.relative, lanes };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

export default function securityEditHook(pi) {
  pi.on('tool_call', event => {
    let result;
    try { result = inspectEditedFile(event); }
    catch { result = { supported: false, coverage: 'incomplete', lanes: [incomplete('dispatch', 'advisory scan could not run')] }; }
    process.stderr.write(`[security advisory] ${JSON.stringify(result)}\n`);
  });
}
