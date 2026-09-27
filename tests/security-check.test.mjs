import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {run} from '../skills/delivery/security-check/scripts/security-check.mjs';

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'security-check-'));
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
  git('init', '-q');
  git('config', 'user.email', 'fixture@example.test');
  git('config', 'user.name', 'Fixture');
  git('remote', 'add', 'origin', 'https://account:secret-token@example.test/owner/project.git');
  fs.copyFileSync(new URL('./fixtures/security-check/seeded-secret.js', import.meta.url), path.join(root, 'seeded-secret.js'));
  git('add', 'seeded-secret.js');
  git('commit', '-qm', 'fixture');
  return {root, revision: git('rev-parse', 'HEAD')};
}

function scanners({secret = 'fixture-not-a-real-credential-83d19c', semgrep = {results: [], errors: []}, gitleaks = [{RuleID: 'generic-api-key', File: 'seeded-secret.js', StartLine: 2, Secret: secret, Match: `apiKey = '${secret}'`}]} = {}) {
  return (tool, args) => {
    if (tool === 'semgrep') return args[0] === '--version'
      ? {status: 0, stdout: '1.168.0'}
      : {status: 0, stdout: JSON.stringify(semgrep), stderr: secret};
    if (tool === 'gitleaks') return args[0] === 'version'
      ? {status: 0, stdout: '8.24.0'}
      : {status: 0, stdout: JSON.stringify(gitleaks), stderr: secret};
    throw new Error(`unexpected scanner: ${tool}`);
  };
}

test('reports repository-bound secret findings without exposing secret data', () => {
  const {root, revision} = repository();
  const secret = 'fixture-not-a-real-credential-83d19c';
  try {
    const spawn = scanners({
      secret,
      semgrep: {results: [{path: 'seeded-secret.js', start: {line: 2}, check_id: 'javascript.example', extra: {severity: 'ERROR', message: `Found ${secret}`} }], errors: []},
    });
    const report = run({cwd: root, spawn});
    assert.equal(report.coverage, 'complete');
    assert.equal(report.secret_coverage, 'complete');
    assert.equal(report.secret_tool.version, '8.24.0');
    assert.equal(report.repository, 'https://example.test/owner/project');
    assert.equal(report.revision, revision);
    assert.equal(report.findings.length, 2);
    const secretFinding = report.findings.find(finding => finding.scanner === 'gitleaks');
    assert.deepEqual(Object.keys(secretFinding), ['schema_version', 'finding_id', 'repository', 'revision', 'rule_id', 'path', 'line', 'severity', 'scanner', 'message', 'evidence_ref']);
    assert.equal(secretFinding.repository, report.repository);
    assert.equal(secretFinding.revision, revision);
    assert.equal(secretFinding.path, 'seeded-secret.js');
    assert.equal(secretFinding.line, 2);
    assert.equal(secretFinding.message, 'Secret detected by Gitleaks');
    assert.match(secretFinding.evidence_ref, /^sha256:[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(report), /fixture-not-a-real-credential|secret-token|account/);
    const gitleaksInvocation = [];
    run({cwd: root, spawn: (tool, args, options) => {
      gitleaksInvocation.push({tool, args, options});
      return spawn(tool, args, options);
    }});
    const scan = gitleaksInvocation.find(call => call.tool === 'gitleaks' && call.args[0] === 'git');
    assert.ok(scan.args.includes('--redact=100'));
    assert.ok(scan.args.includes('--report-format') && scan.args.includes('json'));
    assert.equal(scan.options.cwd, root);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('missing or failed Gitleaks marks secret coverage incomplete without raw diagnostics', () => {
  const {root} = repository();
  const secret = 'fixture-not-a-real-credential-83d19c';
  try {
    const missing = run({cwd: root, spawn: (tool, args) => {
      if (tool === 'gitleaks') return {status: null, error: new Error(`ENOENT ${secret}`), stderr: secret};
      return scanners({gitleaks: []})(tool, args);
    }});
    assert.equal(missing.secret_coverage, 'incomplete');
    assert.equal(missing.secret_tool.status, 'unavailable');
    assert.doesNotMatch(JSON.stringify(missing), /fixture-not-a-real-credential/);
    const failed = run({cwd: root, spawn: (tool, args) => {
      if (tool === 'gitleaks' && args[0] === 'git') return {status: 2, stdout: `[{"Secret":"${secret}"}]`, stderr: secret};
      return scanners({gitleaks: []})(tool, args);
    }});
    assert.equal(failed.secret_coverage, 'incomplete');
    assert.equal(failed.secret_tool.status, 'failed');
    assert.doesNotMatch(JSON.stringify(failed), /fixture-not-a-real-credential/);
    const semgrepFailure = run({cwd: root, spawn: (tool, args) => {
      if (tool === 'semgrep' && args[0] !== '--version') return {status: 2, stdout: JSON.stringify({results: []}), stderr: secret};
      return scanners({gitleaks: []})(tool, args);
    }});
    assert.equal(semgrepFailure.coverage, 'incomplete');
    assert.equal(semgrepFailure.secret_coverage, 'complete');
    const semgrepMissing = run({cwd: root, spawn: (tool, args) => {
      if (tool === 'semgrep') return {status: null, error: new Error('ENOENT')};
      return scanners({gitleaks: []})(tool, args);
    }});
    assert.equal(semgrepMissing.coverage, 'incomplete');
    assert.equal(semgrepMissing.tool.status, 'unavailable');
    for (const result of [
      {status: 2, stdout: JSON.stringify({results: []}), stderr: secret},
      {status: 0, stdout: JSON.stringify({results: [], errors: [{type: 'PartialParsing'}]})},
      {status: 0, stdout: '{invalid json'},
    ]) {
      const report = run({cwd: root, spawn: (tool, args) => {
        if (tool === 'semgrep' && args[0] !== '--version') return result;
        return scanners({gitleaks: []})(tool, args);
      }});
      assert.equal(report.coverage, 'incomplete');
      assert.equal(report.tool.status, 'failed');
      assert.match(report.error, /Semgrep/);
      assert.doesNotMatch(JSON.stringify(report), /fixture-not-a-real-credential/);
    }
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});
