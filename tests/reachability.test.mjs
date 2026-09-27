import assert from 'node:assert/strict';
import test from 'node:test';
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
