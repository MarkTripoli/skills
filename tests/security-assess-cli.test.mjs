import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assessSecurity} from '../skills/delivery/security-check/scripts/assess.mjs';

const cli = fileURLToPath(new URL('../skills/delivery/security-check/scripts/assess.mjs', import.meta.url));
const git = (cwd, ...args) => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();

test('review prompts and assessment bind exact current repository and source lines', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'security-assess-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'remote', 'add', 'origin', 'https://example.test/owner/assessment.git');
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'handler.js'), 'function run(input) {\n  return eval(input);\n}\n');
  git(root, 'add', 'src/handler.js');
  git(root, 'commit', '-qm', 'fixture');
  const scan = {
    schema_version: 1, repository: 'https://example.test/owner/assessment', revision: git(root, 'rev-parse', 'HEAD'),
    scanner: 'semgrep', coverage: 'complete', secret_coverage: 'complete',
    tool: {name: 'semgrep', status: 'ok', version: '1.0'}, secret_tool: {name: 'gitleaks', status: 'ok', version: '8.0'},
    findings: [{schema_version: 1, finding_id: 'finding-1', repository: 'https://example.test/owner/assessment', revision: git(root, 'rev-parse', 'HEAD'), rule_id: 'js.eval', path: 'src/handler.js', line: 2, severity: 'ERROR', scanner: 'semgrep', message: 'Finding reported by Semgrep', evidence_ref: 'sha256:metadata'}],
  };
  const scanFile = path.join(root, 'scan.json');
  fs.writeFileSync(scanFile, JSON.stringify(scan));
  const prompts = spawnSync(process.execPath, [cli, '--scan', scanFile, '--root', root, '--prompts'], {encoding: 'utf8'});
  assert.equal(prompts.status, 0, prompts.stdout);
  assert.equal(JSON.parse(prompts.stdout).length, 1);
  const unreviewed = spawnSync(process.execPath, [cli, '--scan', scanFile, '--root', root], {encoding: 'utf8'});
  assert.equal(unreviewed.status, 0, unreviewed.stdout);
  assert.equal(JSON.parse(unreviewed.stdout).dispositions[0].reachability, 'uncertain');
  const reviewed = await assessSecurity(scan, {root, reviews: [{finding_id: 'finding-1', reachability: 'reachable', source_references: [{path: 'src/handler.js', start_line: 1, end_line: 2}], reachability_basis: 'User input reaches eval.'}]});
  assert.equal(reviewed.dispositions[0].reachability, 'reachable');
  assert.match(reviewed.report, new RegExp(scan.revision));
  assert.match(reviewed.report, /Active findings \(1\)/);
  const reviewsFile = path.join(root, 'reviews.json');
  fs.writeFileSync(reviewsFile, JSON.stringify([{finding_id: 'finding-1', reachability: 'reachable', source_references: [{path: '../outside.js', start_line: 1, end_line: 1}], reachability_basis: 'Untrusted citation.'}]));
  const rejected = spawnSync(process.execPath, [cli, '--scan', scanFile, '--root', root, '--reviews', reviewsFile], {encoding: 'utf8'});
  assert.equal(rejected.status, 0);
  assert.equal(JSON.parse(rejected.stdout).dispositions[0].reachability, 'uncertain');
  scan.revision = '0'.repeat(40);
  fs.writeFileSync(scanFile, JSON.stringify(scan));
  const stale = spawnSync(process.execPath, [cli, '--scan', scanFile, '--root', root], {encoding: 'utf8'});
  assert.equal(stale.status, 1);
  assert.equal(JSON.parse(stale.stdout).status, 'incomplete');
});
