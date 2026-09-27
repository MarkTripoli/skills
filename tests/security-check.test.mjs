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
  fs.writeFileSync(path.join(root, 'fixture.js'), 'export const fixture = true;\n');
  git('add', 'fixture.js');
  git('commit', '-qm', 'fixture');
  return {root, revision: git('rev-parse', 'HEAD')};
}

test('reports revision-bound findings without exposing origin credentials', () => {
  const {root, revision} = repository();
  try {
    const spawn = (_tool, args) => args[0] === '--version'
      ? {status: 0, stdout: '1.168.0'}
      : {status: 0, stdout: JSON.stringify({results: [{path: 'fixture.js', start: {line: 1}, check_id: 'javascript.example', extra: {severity: 'ERROR', message: 'Unsafe call'}}], errors: []})};
    const report = run({cwd: root, spawn});
    assert.equal(report.coverage, 'complete');
    assert.equal(report.tool.version, '1.168.0');
    assert.equal(report.repository, 'https://example.test/owner/project');
    assert.equal(report.revision, revision);
    assert.equal(report.findings.length, 1);
    assert.deepEqual(Object.keys(report.findings[0]), ['schema_version', 'finding_id', 'repository', 'revision', 'rule_id', 'path', 'line', 'severity', 'scanner', 'message', 'evidence_ref']);
    assert.equal(report.findings[0].path, 'fixture.js');
    assert.equal(report.findings[0].line, 1);
    assert.match(report.findings[0].evidence_ref, /^sha256:[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(report), /secret-token|account/);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('missing tools, failed scans and partial Semgrep reports never count as clean', () => {
  const {root} = repository();
  try {
    const missing = run({cwd: root, spawn: () => ({status: null, error: new Error('ENOENT')})});
    assert.equal(missing.coverage, 'incomplete');
    assert.equal(missing.tool.status, 'unavailable');
    for (const result of [
      {status: 2, stdout: JSON.stringify({results: []})},
      {status: 0, stdout: JSON.stringify({results: [], errors: [{type: 'PartialParsing'}]})},
      {status: 0, stdout: '{invalid json'},
    ]) {
      const report = run({cwd: root, spawn: (_tool, args) => args[0] === '--version' ? {status: 0, stdout: '1.168.0'} : result});
      assert.equal(report.coverage, 'incomplete');
      assert.equal(report.tool.status, 'failed');
      assert.match(report.error, /Semgrep/);
    }
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});
