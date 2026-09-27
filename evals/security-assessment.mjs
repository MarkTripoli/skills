import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const key = finding => [finding.scanner, finding.rule_id, finding.path, finding.line].join('\0');
const high = finding => ['ERROR', 'HIGH', 'CRITICAL'].includes(String(finding.severity).toUpperCase());
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

/** Structural fixture grade; it is not a measured live recall or cost benchmark. */
export function gradeSecurityAssessment(fixture, assessment) {
  if (fixture?.fixture_version !== 1 || !Array.isArray(fixture.expected)) throw new Error('Unsupported security fixture');
  const scan = assessment?.scan ?? {};
  const risk = assessment?.accepted_risks ?? {};
  const dispositions = Array.isArray(assessment?.dispositions) ? assessment.dispositions : [];
  const report = typeof assessment?.report === 'string' ? assessment.report : '';
  const findings = Array.isArray(scan.findings) ? scan.findings : [];
  const expected = new Map(fixture.expected.map(item => [key(item), item]));
  const actual = new Map(findings.map(item => [key(item), item]));
  const truePositives = [...expected.keys()].filter(id => actual.has(id));
  const missed = [...expected.keys()].filter(id => !actual.has(id));
  const extra = [...actual.keys()].filter(id => !expected.has(id));
  const problems = [];
  const reportProblems = [];
  const reportIssue = message => { problems.push(message); reportProblems.push(message); };
  if (scan.schema_version !== 1 || scan.repository !== fixture.repository || scan.revision !== fixture.revision) problems.push('scanner schema or repository/revision provenance mismatch');
  if (scan.coverage !== 'complete' || scan.secret_coverage !== 'complete') problems.push('scanner or secret coverage incomplete');
  for (const tool of [scan.tool, scan.secret_tool]) {
    if (tool?.status !== 'ok' || typeof tool.version !== 'string' || !tool.version.trim()) reportIssue(`${tool?.name ?? 'unknown'} tool status/version missing`);
  }
  if (risk.coverage !== 'complete' || !Array.isArray(risk.active) || !Array.isArray(risk.suppressed)) reportIssue('accepted-risk coverage or audit groups incomplete');
  const active = new Set((Array.isArray(risk.active) ? risk.active : []).map(item => item.finding_id));
  const suppressed = new Map((Array.isArray(risk.suppressed) ? risk.suppressed : []).map(item => [item.finding_id, item]));
  const dispositionById = new Map(dispositions.map(item => [item.finding_id, item]));
  const groupCounts = {active: 0, suppressed: 0, uncertain: 0};
  for (const expectedFinding of fixture.expected) {
    groupCounts[expectedFinding.group] += 1;
    const finding = actual.get(key(expectedFinding));
    if (!finding) continue;
    if (finding.schema_version !== 1 || !finding.finding_id || finding.repository !== scan.repository || finding.revision !== scan.revision ||
        !Number.isSafeInteger(finding.line) || !/^sha256:[a-f0-9]{64}$/.test(finding.evidence_ref ?? '')) problems.push(`invalid normalized finding at ${expectedFinding.path}:${expectedFinding.line}`);
    const accepted = suppressed.get(finding.finding_id);
    const disposition = dispositionById.get(finding.finding_id);
    const actualGroup = accepted ? 'suppressed' : disposition?.reachability === 'unreachable' ? 'suppressed' :
      disposition?.reachability === 'uncertain' || (high(finding) && !disposition) ? 'uncertain' : 'active';
    if (actualGroup !== expectedFinding.group) reportIssue(`wrong ${expectedFinding.group} group at ${expectedFinding.path}:${expectedFinding.line}`);
    if (accepted && (active.has(finding.finding_id) || !accepted.accepted_risk?.reason || !accepted.accepted_risk?.expires)) reportIssue(`invalid accepted-risk audit at ${expectedFinding.path}:${expectedFinding.line}`);
    if (expectedFinding.accepted_risk && (!accepted || accepted.accepted_risk.reason !== expectedFinding.accepted_risk.reason ||
        accepted.accepted_risk.expires !== expectedFinding.accepted_risk.expires || Date.parse(accepted.accepted_risk.expires) <= Date.parse(fixture.now))) reportIssue(`missing current accepted risk at ${expectedFinding.path}:${expectedFinding.line}`);
    if (expectedFinding.expired_risk && (accepted || !active.has(finding.finding_id) || Date.parse(expectedFinding.expired_risk.expires) > Date.parse(fixture.now))) reportIssue(`expired risk suppressed at ${expectedFinding.path}:${expectedFinding.line}`);
    if (high(finding) && (!disposition || disposition.reachability !== expectedFinding.reachability ||
        typeof disposition.reachability_basis !== 'string' || !disposition.reachability_basis.trim() ||
        !Array.isArray(disposition.source_references) || (disposition.reachability !== 'uncertain' && !disposition.source_references.length))) reportIssue(`missing grounded reachability at ${expectedFinding.path}:${expectedFinding.line}`);
    if (finding.finding_id && !report.includes(`${finding.finding_id}:`)) reportIssue(`report omits finding at ${expectedFinding.path}:${expectedFinding.line}`);
    if (expectedFinding.accepted_risk && (!report.includes(expectedFinding.accepted_risk.reason) || !report.includes(expectedFinding.accepted_risk.expires))) reportIssue('report omits accepted-risk reason or expiry');
    if (disposition?.reachability === 'uncertain' && !report.includes(disposition.reachability_basis)) reportIssue('report omits uncertain disposition basis');
  }
  if (missed.length) problems.push(`${missed.length} seeded defect(s) missed`);
  if (extra.length) problems.push(`${extra.length} extra finding(s) emitted`);
  const reportFields = [
    `Repository: ${fixture.repository}; revision: ${fixture.revision}`,
    `Scanner coverage: ${scan.scanner} ${scan.coverage}; tool status ${scan.tool?.status}`,
    `Secret coverage: ${scan.secret_coverage}; tool status ${scan.secret_tool?.status}`,
    `Accepted-risk coverage: ${risk.coverage}`,
    ...Object.entries(groupCounts).map(([group, count]) => `${group[0].toUpperCase()}${group.slice(1)} findings (${count})`),
    'Limits:',
  ];
  if (reportFields.some(field => !report.includes(field)) || !report.includes(scan.tool?.version ?? '\u0000') || !report.includes(scan.secret_tool?.version ?? '\u0000')) reportIssue('operator report omits coverage, tool version, provenance, group, or limits');
  const forbidden = Array.isArray(fixture.secret_parts) ? fixture.secret_parts.join('') : '';
  const redactionPassed = Boolean(forbidden) && !JSON.stringify(assessment).includes(forbidden);
  if (!redactionPassed) reportIssue('secret value present in assessment or redaction fixture unavailable');
  return {
    schema_version: 1,
    status: problems.length ? 'failed' : 'passed',
    mode: 'deterministic-fixture',
    live_benchmark: false,
    provenance: {repository: scan.repository ?? null, revision: scan.revision ?? null, scanner: scan.tool ?? null, secret_scanner: scan.secret_tool ?? null, model: null, spend: null},
    detections: {true_positives: truePositives.length, false_negatives: missed.length, extra_findings: extra.length, missed, extra},
    report_complete: reportProblems.length === 0,
    redaction_passed: redactionPassed,
    problems,
  };
}

/** Preserve the safe normalized assessment and its SHA when grading from the CLI. */
export function recordSecurityAssessment(assessmentFile, fixtureFile, resultsRoot) {
  const raw = fs.readFileSync(assessmentFile);
  const fixture = fs.readFileSync(fixtureFile);
  const grade = gradeSecurityAssessment(JSON.parse(fixture), JSON.parse(raw));
  fs.mkdirSync(resultsRoot, {recursive: true});
  const dir = fs.mkdtempSync(path.join(resultsRoot, 'security-check-'));
  fs.copyFileSync(fixtureFile, path.join(dir, 'ground-truth.json'));
  if (grade.redaction_passed) fs.writeFileSync(path.join(dir, 'normalized-assessment.json'), raw);
  const output = {...grade, raw_assessment: grade.redaction_passed ? 'normalized-assessment.json' : null, source_path: path.resolve(assessmentFile), source_sha256: digest(raw)};
  fs.writeFileSync(path.join(dir, 'grade.json'), `${JSON.stringify(output, null, 2)}\n`);
  return {dir, grade: output};
}
