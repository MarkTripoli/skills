import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {reviewHighRisk, renderSecurityReport} from '../skills/delivery/security-check/scripts/reachability.mjs';

const high = (finding_id, severity = 'ERROR', extra = {}) => ({
  finding_id,
  severity,
  path: 'skills/delivery/security-check/fixtures/vulnerable.js',
  line: 4,
  rule_id: 'javascript.lang.security.audit.child-process-exec',
  message: 'Untrusted input reaches command execution.',
  ...extra,
});

const cited = (reachability, start_line = 3, end_line = 4) => ({
  reachability,
  source_references: [{path: 'skills/delivery/security-check/fixtures/vulnerable.js', start_line, end_line}],
  reachability_basis: 'run(input) passes input directly to child_process.exec.',
});

test('reviews only high-severity findings once and retains cited dispositions', async () => {
  const findings = [high('reachable'), high('low', 'WARNING'), high('critical', 'CRITICAL')];
  const calls = [];
  const dispositions = await reviewHighRisk(findings, {
    reviewer: async input => {
      calls.push(input);
      return cited(input.finding.finding_id === 'reachable' ? 'reachable' : 'uncertain');
    },
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(dispositions.map(item => item.finding_id), ['reachable', 'critical']);
  assert.equal(dispositions[0].reachability, 'reachable');
  assert.deepEqual(dispositions[0].source_references, cited('reachable').source_references);
  assert.match(calls[0].prompt, /do not infer reachability/);
});

test('review failures and unsupported conclusions become uncertain', async () => {
  const dispositions = await reviewHighRisk([high('throws'), high('uncited'), high('bad-ref')], {
    reviewer: async ({finding}) => {
      if (finding.finding_id === 'throws') throw new Error('worker unavailable');
      if (finding.finding_id === 'uncited') return {...cited('reachable'), source_references: []};
      return {...cited('unreachable'), source_references: [{path: '../outside.js', start_line: 1, end_line: 1}]};
    },
  });
  assert.deepEqual(dispositions.map(item => item.reachability), ['uncertain', 'uncertain', 'uncertain']);
  assert.ok(dispositions.every(item => item.finding_id && item.reachability_basis));
  assert.deepEqual(dispositions[0].source_references, [{path: 'skills/delivery/security-check/fixtures/vulnerable.js', start_line: 4, end_line: 4}]);
});

test('renders scanner coverage and separates active, accepted, unreachable, and uncertain findings', () => {
  const findings = [high('reachable'), high('unreachable'), high('accepted'), high('unknown'), high('warning', 'WARNING')];
  const report = renderSecurityReport({
    repository: 'https://example.test/owner/repo',
    revision: 'a'.repeat(40),
    scanner: 'semgrep',
    coverage: 'incomplete',
    tool: {name: 'semgrep', status: 'failed', version: '1.168.0'},
    findings,
  }, {coverage: 'complete', suppressed: [{finding_id: 'accepted', accepted_risk: {reason: 'Reviewed exception', expires: '2027-01-01'}}]}, [
    {finding_id: 'reachable', ...cited('reachable')},
    {finding_id: 'unreachable', ...cited('unreachable')},
    {finding_id: 'accepted', ...cited('reachable')},
    {finding_id: 'unknown', ...cited('uncertain')},
  ]);
  assert.match(report, /Scanner coverage: semgrep incomplete; tool status failed/);
  assert.match(report, /Repository: https:\/\/example\.test\/owner\/repo; revision: a{40}/);
  assert.match(report, /Active findings \(2\)/);
  assert.match(report, /Secret coverage: unknown/);
  assert.match(report, /Accepted-risk coverage: complete/);
  assert.match(report, /Suppressed findings \(2\)/);
  assert.match(report, /Uncertain findings \(1\)/);
  assert.match(report, /accepted: Untrusted input reaches command execution/);
  assert.match(report, /Reviewed exception; expires 2027-01-01/);
  assert.match(report, /vulnerable\.js:3-4/);
  assert.match(report, /not proof of runtime execution/);
});

test('bounds disposition evidence and report listing', async () => {
  const refs = Array.from({length: 9}, (_, index) => ({path: `src/${index}.js`, start_line: 1, end_line: 1}));
  const [disposition] = await reviewHighRisk([high('too-many')], {reviewer: async () => ({...cited('reachable'), source_references: refs})});
  assert.equal(disposition.reachability, 'uncertain');
  const report = renderSecurityReport({findings: Array.from({length: 102}, (_, index) => high(`finding-${index}`, 'WARNING'))}, {}, []);
  assert.match(report, /Active findings \(102\)/);
  assert.match(report, /2 additional findings omitted/);
});

test('source-root citations must name current in-repository lines', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reachability-source-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'live.js'), 'one\ntwo\nthree\n');
  const finding = high('current', 'HIGH', {path: 'src/live.js', line: 2});
  const valid = await reviewHighRisk([finding], {sourceRoot: root, reviewer: async () => ({
    reachability: 'reachable', source_references: [{path: 'src/live.js', start_line: 1, end_line: 2}], reachability_basis: 'input reaches sink',
  })});
  assert.equal(valid[0].reachability, 'reachable');
  const invalid = await reviewHighRisk([finding], {sourceRoot: root, reviewer: async () => ({
    reachability: 'reachable', source_references: [{path: 'src/live.js', start_line: 4, end_line: 8}], reachability_basis: 'invented lines',
  })});
  assert.equal(invalid[0].reachability, 'uncertain');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'reachability-outside-'));
  t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
  fs.writeFileSync(path.join(outside, 'outside.js'), 'outside source\n');
  fs.symlinkSync(path.join(outside, 'outside.js'), path.join(root, 'src', 'outside.js'));
  const escaped = await reviewHighRisk([finding], {sourceRoot: root, reviewer: async () => ({
    reachability: 'unreachable', source_references: [{path: 'src/outside.js', start_line: 1, end_line: 1}], reachability_basis: 'escaped source',
  })});
  assert.equal(escaped[0].reachability, 'uncertain');
});

test('reviewer-quoted credentials never enter dispositions or reports', async () => {
  const secret = 'SYNTHETIC_CREDENTIAL_DO_NOT_REPORT_42';
  const finding = high('quoted-secret');
  const reply = {...cited('reachable'), reachability_basis: `The credential is ${secret} in the cited source.`};
  const [disposition] = await reviewHighRisk([finding], {reviewer: async () => reply});
  assert.equal(disposition.reachability, 'reachable');
  assert.deepEqual(disposition.source_references, reply.source_references);
  assert.doesNotMatch(JSON.stringify(disposition), /SYNTHETIC_CREDENTIAL_DO_NOT_REPORT_42/);
  const scan = {findings: [finding]};
  const report = renderSecurityReport(scan, {}, [disposition]);
  const externalReport = renderSecurityReport(scan, {}, [{finding_id: finding.finding_id, ...reply}]);
  assert.match(report, /Active findings \(1\)/);
  assert.match(externalReport, /Active findings \(1\)/);
  assert.match(externalReport, /vulnerable\.js:3-4/);
  assert.doesNotMatch(report, /SYNTHETIC_CREDENTIAL_DO_NOT_REPORT_42/);
  assert.doesNotMatch(externalReport, /SYNTHETIC_CREDENTIAL_DO_NOT_REPORT_42/);
});

test('current replacement cannot suppress a historical Gitleaks secret without accepted risk', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reachability-history-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'src'));
  const file = path.join(root, 'src', 'replaced.js');
  const secret = 'SYNTHETIC_HISTORICAL_SECRET_DO_NOT_REPORT_42';
  fs.writeFileSync(file, `export const credential = "${secret}";\n`);
  fs.writeFileSync(file, 'export const status = "credential removed";\n');
  const finding = high('historical', 'HIGH', {
    scanner: 'gitleaks', path: 'src/replaced.js', line: 1, message: 'Secret detected by Gitleaks',
  });
  const [disposition] = await reviewHighRisk([finding], {sourceRoot: root, reviewer: async () => ({
    reachability: 'unreachable',
    source_references: [{path: 'src/replaced.js', start_line: 1, end_line: 1}],
    reachability_basis: `Current file no longer contains ${secret}.`,
  })});
  assert.equal(disposition.reachability, 'unreachable');
  assert.deepEqual(disposition.source_references, [{path: 'src/replaced.js', start_line: 1, end_line: 1}]);
  const scan = {findings: [finding]};
  const report = renderSecurityReport(scan, {}, [disposition]);
  assert.match(report, /Suppressed findings \(0\)/);
  assert.match(report, /Uncertain findings \(1\)/);
  assert.match(report, /replaced\.js:1/);
  assert.doesNotMatch(JSON.stringify({disposition, report}), /SYNTHETIC_HISTORICAL_SECRET_DO_NOT_REPORT_42/);
  const accepted = renderSecurityReport(scan, {suppressed: [{
    finding_id: 'historical', accepted_risk: {reason: 'Reviewed historical exposure', expires: '2027-01-01'},
  }]}, [disposition]);
  assert.match(accepted, /Suppressed findings \(1\)/);
  assert.match(accepted, /Uncertain findings \(0\)/);
  assert.doesNotMatch(accepted, /SYNTHETIC_HISTORICAL_SECRET_DO_NOT_REPORT_42/);
});
