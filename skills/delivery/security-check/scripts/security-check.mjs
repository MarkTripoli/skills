#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const hash = value => createHash('sha256').update(value).digest('hex');
function git(args, cwd) {
  return execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
}
export function canonicalRepository(remote) {
  const value = remote.trim().replace(/^git@([^:]+):/, 'ssh://git@$1/');
  const url = new URL(value);
  if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol) || !url.hostname) {
    throw new Error('unsupported origin repository URL');
  }
  const pathname = url.pathname.replace(/\/+$/, '').replace(/\.git$/, '');
  if (!pathname || pathname === '/') throw new Error('origin repository path is missing');
  return `https://${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ''}${pathname}`;
}
export function normalize({root, revision, repository, semgrepVersion, result}) {
  const findings = [];
  let valid = true;
  try {
    const report = JSON.parse(result.stdout);
    if (!Array.isArray(report.results)) throw new Error('Semgrep JSON has no results array');
    if (report.errors !== undefined && (!Array.isArray(report.errors) || report.errors.length > 0)) valid = false;
    for (const item of report.results) {
      const pathName = path.relative(root, path.resolve(root, item.path)).split(path.sep).join('/');
      const line = item.start?.line;
      const ruleId = item.check_id;
      if (!pathName || pathName === '..' || pathName.startsWith('../') || !Number.isSafeInteger(line) || line < 1 || typeof ruleId !== 'string') { valid = false; continue; }
      const message = String(item.extra?.message ?? '');
      const severity = String(item.extra?.severity ?? 'UNKNOWN').toUpperCase();
      const findingId = hash([repository, revision, 'semgrep', ruleId, pathName, line].join('\0'));
      findings.push({schema_version: 1, finding_id: findingId, repository, revision, rule_id: ruleId, path: pathName, line, severity, scanner: 'semgrep', message, evidence_ref: `sha256:${hash([ruleId, pathName, line, message].join('\0'))}`});
    }
  } catch { valid = false; }
  findings.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.rule_id.localeCompare(b.rule_id));
  const successful = result.status === 0 && valid;
  return {schema_version: 1, repository, revision, scanner: 'semgrep', tool: {name: 'semgrep', version: semgrepVersion ?? null, status: successful ? 'ok' : 'failed', exit_code: result.status ?? null}, coverage: successful ? 'complete' : 'incomplete', findings};
}
export function run({cwd = process.cwd(), spawn = spawnSync} = {}) {
  let repository, revision;
  try {
    revision = git(['rev-parse', 'HEAD'], cwd);
    const remote = git(['config', '--get', 'remote.origin.url'], cwd);
    repository = canonicalRepository(remote);
    if (!repository) throw new Error('empty origin repository URL');
  } catch (error) {
    return {schema_version: 1, repository: null, revision: null, scanner: 'semgrep', tool: {name: 'semgrep', version: null, status: 'unavailable', exit_code: null}, coverage: 'incomplete', findings: [], error: `repository identity unavailable: ${error.message}`};
  }
  const version = spawn('semgrep', ['--version'], {cwd, encoding: 'utf8', timeout: 15000});
  const semgrepVersion = version.status === 0 ? version.stdout.trim() : null;
  if (semgrepVersion === null) return {schema_version: 1, repository, revision, scanner: 'semgrep', tool: {name: 'semgrep', version: null, status: 'unavailable', exit_code: version.status ?? null}, coverage: 'incomplete', findings: [], error: version.error?.message ?? 'Semgrep unavailable'};
  const result = spawn('semgrep', ['scan', '--json', '--config', 'p/default', '--metrics=off', '--disable-version-check', '.'], {cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 300000});
  const report = normalize({root: cwd, revision, repository, semgrepVersion, result});
  if (result.error) report.error = result.error.message;
  else if (result.status !== 0) report.error = `Semgrep exited with status ${result.status}`;
  else if (report.coverage === 'incomplete') report.error = 'Semgrep returned an invalid or partial JSON report';
  return report;
}
function help() { console.log('Usage: node security-check.mjs [--root PATH]\nRun opt-in Semgrep scan; emits one JSON report to stdout. Exit 0 only when coverage is complete, 1 when incomplete, 2 for usage errors. Requires a git checkout with origin remote and Semgrep on PATH.'); }
const invoked = (() => {
  try { return process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]); }
  catch { return false; }
})();
if (invoked) {
  if (process.argv.includes('--help')) { help(); process.exit(0); }
  let cwd = process.cwd();
  if (process.argv.length > 2) {
    if (process.argv.length !== 4 || process.argv[2] !== '--root') { console.error('invalid arguments'); help(); process.exit(2); }
    cwd = path.resolve(process.argv[3]);
  }
  const report = run({cwd});
  console.log(JSON.stringify(report));
  process.exit(report.coverage === 'complete' ? 0 : 1);
}
