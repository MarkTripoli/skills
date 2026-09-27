import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {applyAcceptedRisks} from '../skills/delivery/security-check/scripts/accepted-risks.mjs';
import {reviewHighRisk, renderSecurityReport} from '../skills/delivery/security-check/scripts/reachability.mjs';
import {gradeSecurityAssessment, recordSecurityAssessment} from '../evals/security-assessment.mjs';

const fixtureFile = fileURLToPath(new URL('../evals/fixtures/security-check/ground-truth.json', import.meta.url));
const fixture = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');

async function assessment() {
  const findings = fixture.expected.map((item, index) => ({
    schema_version: 1,
    finding_id: hash(`seeded-finding-${index}`),
    repository: fixture.repository,
    revision: fixture.revision,
    scanner: item.scanner,
    rule_id: item.rule_id,
    path: item.path,
    line: item.line,
    severity: item.scanner === 'gitleaks' ? 'HIGH' : 'ERROR',
    message: item.scanner === 'gitleaks' ? 'Secret detected by Gitleaks' : 'Finding reported by Semgrep',
    evidence_ref: `sha256:${hash(`seeded-evidence-${index}`)}`,
  }));
  const scan = {
    schema_version: 1, repository: fixture.repository, revision: fixture.revision,
    scanner: 'semgrep', coverage: 'complete', secret_coverage: 'complete',
    tool: {name: 'semgrep', status: 'ok', version: '1.168.0', exit_code: 0},
    secret_tool: {name: 'gitleaks', status: 'ok', version: '8.30.0', exit_code: 0},
    findings,
  };
  const accepted = applyAcceptedRisks(findings, fixture.expected.flatMap(item => {
    const risk = item.accepted_risk ?? item.expired_risk;
    return risk ? [{repository: fixture.repository, rule_id: item.rule_id, path: item.path, reason: risk.reason ?? 'Expired exception', expires: risk.expires}] : [];
  }), {repository: fixture.repository, now: fixture.now});
  const dispositions = await reviewHighRisk(findings, {reviewer: async ({finding}) => ({
    reachability: finding.scanner === 'gitleaks' ? 'uncertain' : 'reachable',
    source_references: [{path: finding.path, start_line: finding.line, end_line: finding.line}],
    reachability_basis: finding.scanner === 'gitleaks' ? 'Historical occurrence cannot establish current-code reachability.' : 'Seeded source path is reachable.',
  })});
  return {scan, accepted_risks: accepted, dispositions, report: renderSecurityReport(scan, accepted, dispositions)};
}

test('grades seeded detections, expiry, uncertainty and complete provenance', async () => {
  const observed = await assessment();
  const grade = gradeSecurityAssessment(fixture, observed);
  assert.equal(grade.status, 'passed', grade.problems.join('; '));
  assert.deepEqual(grade.detections, {true_positives: 4, false_negatives: 0, extra_findings: 0, missed: [], extra: []});
  assert.equal(grade.report_complete, true);
  assert.equal(grade.redaction_passed, true);
  assert.equal(grade.live_benchmark, false);
  assert.equal(grade.provenance.revision, fixture.revision);
  assert.equal(grade.provenance.secret_scanner.version, '8.30.0');
});

test('grades six independent scanner lanes and rejects missing coverage despite aggregate claim', async () => {
  const observed = await assessment();
  observed.scan.lanes = Object.fromEntries([
    ['semgrep', '1.168.0'], ['gitleaks', '8.30.0'], ['trivy_config', '0.64.0'],
    ['trivy_fs', '0.64.0'], ['hadolint', '2.12.0'], ['actionlint', '1.7.7'],
  ].map(([name, version]) => [name, {coverage: 'complete', tool: {name, status: 'ok', version}, findings: []}]));
  observed.report = renderSecurityReport(observed.scan, observed.accepted_risks, observed.dispositions);
  assert.equal(gradeSecurityAssessment(fixture, observed).status, 'passed');

  observed.scan.lanes.actionlint.coverage = 'incomplete';
  observed.scan.lanes.actionlint.tool.status = 'unavailable';
  observed.report = renderSecurityReport(observed.scan, observed.accepted_risks, observed.dispositions);
  const failed = gradeSecurityAssessment(fixture, observed);
  assert.equal(failed.status, 'failed');
  assert.match(failed.problems.join('; '), /actionlint scanner lane coverage/);
});

test('separates missed seeded defects from extra emissions', async () => {
  const observed = await assessment();
  observed.scan.findings.shift();
  observed.scan.findings.push({...observed.scan.findings[0], finding_id: hash('extra'), rule_id: 'js.unexpected', path: 'src/unexpected.js'});
  const grade = gradeSecurityAssessment(fixture, observed);
  assert.equal(grade.status, 'failed');
  assert.equal(grade.detections.true_positives, 3);
  assert.equal(grade.detections.false_negatives, 1);
  assert.equal(grade.detections.extra_findings, 1);
});

test('fails incomplete tools, expired suppression, missing uncertainty and leaked secret independently', async () => {
  const original = await assessment();
  const check = (change, problem) => {
    const copy = structuredClone(original);
    change(copy);
    const grade = gradeSecurityAssessment(fixture, copy);
    assert.match(grade.problems.join('; '), problem);
    assert.equal(grade.report_complete, false);
  };
  check(copy => { copy.scan.secret_coverage = 'incomplete'; copy.scan.secret_tool.status = 'unavailable'; copy.report = copy.report.replace('Secret coverage:', 'Secrets:'); }, /coverage incomplete|report omits/);
  check(copy => { const expired = copy.scan.findings.find(item => item.rule_id === 'js.expired-risk'); copy.accepted_risks.active = copy.accepted_risks.active.filter(item => item.finding_id !== expired.finding_id); copy.accepted_risks.suppressed.push({...expired, accepted_risk: {reason: 'Expired exception', expires: '2020-01-01'}}); }, /expired risk suppressed/);
  check(copy => { copy.dispositions = copy.dispositions.filter(item => item.reachability !== 'uncertain'); }, /missing grounded reachability/);
  check(copy => { copy.scan.findings[0].message = fixture.secret_parts.join(''); }, /secret value present/);
});

test('records safe normalized output with checksum and never copies an unredacted failure', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'security-grade-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const input = path.join(root, 'assessment.json');
  fs.writeFileSync(input, JSON.stringify(await assessment()));
  const passed = recordSecurityAssessment(input, fixtureFile, path.join(root, 'results'));
  assert.equal(passed.grade.status, 'passed');
  assert.equal(fs.existsSync(path.join(passed.dir, passed.grade.raw_assessment)), true);
  assert.match(passed.grade.source_sha256, /^[a-f0-9]{64}$/);
  const leaking = JSON.parse(fs.readFileSync(input, 'utf8'));
  leaking.report += fixture.secret_parts.join('');
  fs.writeFileSync(input, JSON.stringify(leaking));
  const failed = recordSecurityAssessment(input, fixtureFile, path.join(root, 'results'));
  assert.equal(failed.grade.status, 'failed');
  assert.equal(failed.grade.raw_assessment, null);
  assert.equal(fs.existsSync(path.join(failed.dir, 'normalized-assessment.json')), false);
  assert.ok(!fs.readFileSync(path.join(failed.dir, 'grade.json'), 'utf8').includes(fixture.secret_parts.join('')));
});
