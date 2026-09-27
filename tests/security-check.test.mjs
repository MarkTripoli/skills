import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {run} from '../skills/delivery/security-check/scripts/security-check.mjs';

const syntheticToken = `ghp_${['A1b2C3d4E5f6G7h8', 'I9j0K1l2M3n4O5p6Q7r8'].join('').slice(0, 36)}`;

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'security-check-'));
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
  git('init', '-q');
  git('config', 'user.email', 'fixture@example.test');
  git('config', 'user.name', 'Fixture');
  git('remote', 'add', 'origin', 'https://account:secret-token@example.test/owner/project.git');
  fs.writeFileSync(path.join(root, 'seeded-secret.js'), `// Generated only inside an isolated temporary repository.\nconst apiKey = '${syntheticToken}';\n`);
  fs.writeFileSync(path.join(root, 'Dockerfile'), 'FROM scratch\n');
  git('add', 'seeded-secret.js', 'Dockerfile');
  git('commit', '-qm', 'fixture');
  return {root, revision: git('rev-parse', 'HEAD')};
}

function scanners({secret = syntheticToken, semgrep = {results: [], errors: []}, gitleaks = [{RuleID: 'github-pat', File: 'seeded-secret.js', StartLine: 2, Secret: secret, Match: `apiKey = '${secret}'`}]} = {}) {
  return (tool, args) => {
    if (args[0] === '--version' || (tool === 'gitleaks' && args[0] === 'version')) return {status: 0, stdout: tool === 'gitleaks' ? '8.24.0' : tool === 'semgrep' ? '1.168.0' : `${tool}-1.0`};
    if (tool === 'semgrep') return {status: 0, stdout: JSON.stringify(semgrep), stderr: secret};
    if (tool === 'gitleaks') return {status: 0, stdout: JSON.stringify(gitleaks), stderr: secret};
    if (tool === 'trivy') return {status: 0, stdout: JSON.stringify({Results: []})};
    if (tool === 'hadolint' || tool === 'actionlint') return {status: 0, stdout: '[]'};
    throw new Error(`unexpected scanner: ${tool}`);
  };
}

test('reports independent offline lanes, findings, unavailable tools, and malformed output', () => {
  const {root} = repository();
  try {
    const spawn = (tool, args, options) => {
      if (tool === 'actionlint') return {status: null, error: Object.assign(new Error('ENOENT'), {code: 'ENOENT'})};
      if (tool === 'hadolint' && args[0] !== '--version') return {status: 0, stdout: '{broken'};
      if (tool === 'trivy' && args[0] === 'config') return {status: 0, stdout: JSON.stringify({Results:[{Target:'Dockerfile',Misconfigurations:[{ID:'AVD-DS-0001',Severity:'HIGH',CauseMetadata:{StartLine:1}}]}]})};
      return scanners({gitleaks:[]})(tool,args,options);
    };
    const report = run({cwd:root,spawn});
    assert.equal(report.coverage,'incomplete');
    assert.equal(report.lanes.trivy_config.coverage,'complete');
    assert.equal(report.lanes.trivy_fs.coverage,'complete');
    assert.equal(report.lanes.actionlint.tool.status,'unavailable');
    assert.equal(report.lanes.hadolint.tool.status,'failed');
    assert.equal(report.lanes.semgrep.coverage,'complete');
    assert.equal(report.findings.find(x=>x.rule_id==='AVD-DS-0001').path,'Dockerfile');
    assert.equal(report.findings.find(x=>x.rule_id==='AVD-DS-0001').line,1);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('out-of-range Trivy locations stay visible without an invented HEAD citation', () => {
  const {root} = repository();
  try {
    const report = run({cwd: root, spawn: (tool, args, options) => {
      if (tool === 'trivy' && args[0] === 'config') {
        return {status: 0, stdout: JSON.stringify({Results: [{Target: 'Dockerfile',
          Misconfigurations: [{ID: 'AVD-BAD-LINE', Severity: 'HIGH', CauseMetadata: {StartLine: 4}}]}]})};
      }
      return scanners({gitleaks: []})(tool, args, options);
    }});
    assert.equal(report.lanes.trivy_config.coverage, 'incomplete');
    assert.equal(report.file_findings[0].rule_id, 'AVD-BAD-LINE');
    assert.ok(!report.findings.some(finding => finding.rule_id === 'AVD-BAD-LINE'));
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('a valid actionlint finding is coverage, not a scanner failure', () => {
  const {root} = repository();
  try {
    fs.mkdirSync(path.join(root, '.github/workflows'), {recursive: true});
    fs.writeFileSync(path.join(root, '.github/workflows/check.yml'), 'on: push\njobs:\n  build:\n    steps:\n      - run: echo hello\n');
    execFileSync('git', ['add', '.github/workflows/check.yml'], {cwd: root});
    execFileSync('git', ['commit', '-qm', 'workflow fixture'], {cwd: root});
    const scan = (status, stdout) => (tool, args, options) =>
      tool === 'actionlint' && args[0] !== '--version'
        ? {status, stdout}
        : scanners({gitleaks: []})(tool, args, options);
    const finding = {kind: 'syntax-check', filepath: '.github/workflows/check.yml', line: 3};
    const report = run({cwd: root, spawn: scan(1, JSON.stringify([finding]))});
    assert.equal(report.lanes.actionlint.coverage, 'complete');
    assert.equal(report.coverage, 'complete');
    assert.equal(report.findings.find(item => item.scanner === 'actionlint').line, 3);
    assert.equal(run({cwd: root, spawn: scan(1, '[]')}).lanes.actionlint.coverage, 'incomplete');
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('offline scanner flags and file-only vulnerabilities preserve honest location coverage', () => {
  const {root} = repository();
  const calls = [];
  try {
    const spawn = (tool, args, options) => {
      calls.push({tool, args});
      if (tool === 'trivy' && args[0] === 'fs') {
        return {status: 0, stdout: JSON.stringify({Results: [{Target: 'Dockerfile', Vulnerabilities: [{VulnerabilityID: 'CVE-2026-1234', Severity: 'HIGH'}]}]})};
      }
      if (tool === 'hadolint' && args[0] !== '--version') {
        return {status: 0, stdout: JSON.stringify([{code: 'DL3007', file: 'Dockerfile', line: 1, level: 'warning'}])};
      }
      return scanners({gitleaks: []})(tool, args, options);
    };
    const report = run({cwd: root, spawn});
    assert.equal(report.lanes.trivy_fs.coverage, 'incomplete');
    assert.equal(report.lanes.trivy_fs.tool.status, 'ok');
    assert.equal(report.file_findings[0].rule_id, 'CVE-2026-1234');
    assert.equal(report.file_findings[0].path, 'Dockerfile');
    assert.ok(!report.findings.some(item => item.rule_id === 'CVE-2026-1234'));
    assert.equal(report.lanes.hadolint.coverage, 'complete');
    assert.equal(report.findings.find(item => item.rule_id === 'DL3007').line, 1);
    assert.ok(calls.find(call => call.tool === 'hadolint' && call.args[0] === '--format').args.includes('--no-fail'));
    assert.ok(!calls.find(call => call.tool === 'trivy' && call.args[0] === 'config').args.includes('--offline-scan'));
    assert.ok(calls.find(call => call.tool === 'trivy' && call.args[0] === 'fs').args.includes('--scanners'));
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('quoted Git paths still route non-ASCII Dockerfiles through Hadolint', () => {
  const {root} = repository();
  try {
    const relative = 'café/Dockerfile';
    fs.mkdirSync(path.join(root, 'café'));
    fs.writeFileSync(path.join(root, relative), 'FROM scratch\n');
    execFileSync('git', ['add', relative], {cwd: root});
    execFileSync('git', ['commit', '-qm', 'unicode Dockerfile fixture'], {cwd: root});
    let args;
    const report = run({cwd: root, spawn: (tool, argv, options) => {
      if (tool === 'hadolint' && argv[0] !== '--version') args = argv;
      return scanners({gitleaks: []})(tool, argv, options);
    }});
    assert.equal(report.lanes.hadolint.coverage, 'complete');
    assert.ok(args.includes(`./${relative}`));
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('Hadolint receives tracked files ending in .Dockerfile', () => {
  const {root} = repository();
  try {
    const file='api.Dockerfile';
    fs.writeFileSync(path.join(root,file),'FROM scratch\n');
    execFileSync('git',['add',file],{cwd:root});
    execFileSync('git',['commit','-qm','Dockerfile suffix fixture'],{cwd:root});
    let invocation;
    const report=run({cwd:root,spawn:(tool,args,options)=>{
      if (tool==='hadolint' && args[0]!=='--version') {
        invocation={args,contents:fs.readFileSync(path.join(options.cwd,file),'utf8')};
      }
      return scanners({gitleaks:[]})(tool,args,options);
    }});
    assert.equal(report.lanes.hadolint.coverage,'complete');
    assert.ok(invocation.args.includes(`./${file}`));
    assert.equal(invocation.contents,'FROM scratch\n');
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('Hadolint passes option-like tracked Dockerfiles as path arguments', () => {
  const {root} = repository();
  try {
    const file='--trusted-registry=evil.Dockerfile';
    fs.writeFileSync(path.join(root,file),'FROM scratch\n');
    execFileSync('git',['add','--',file],{cwd:root});
    execFileSync('git',['commit','-qm','option-like Dockerfile fixture'],{cwd:root});
    let invocation;
    const report=run({cwd:root,spawn:(tool,args,options)=>{
      if (tool==='hadolint' && args[0]!=='--version') {
        invocation={args,contents:fs.readFileSync(path.join(options.cwd,file),'utf8')};
      }
      return scanners({gitleaks:[]})(tool,args,options);
    }});
    assert.equal(report.lanes.hadolint.coverage,'complete');
    assert.ok(invocation.args.includes(`./${file}`));
    assert.equal(invocation.contents,'FROM scratch\n');
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('committed HEAD snapshot excludes ignored workflows and refuses remote Trivy targets', () => {
  const {root} = repository();
  try {
    fs.writeFileSync(path.join(root, '.gitignore'), '.github/workflows/\n');
    execFileSync('git', ['add', '.gitignore'], {cwd: root});
    execFileSync('git', ['commit', '-qm', 'ignore workflows'], {cwd: root});
    fs.mkdirSync(path.join(root, '.github/workflows'), {recursive: true});
    fs.writeFileSync(path.join(root, '.github/workflows/ignored.yml'), 'invalid: [\n');
    let actionlintScans = 0;
    const report = run({cwd: root, spawn: (tool, args, options) => {
      if (tool !== 'gitleaks') assert.equal(fs.existsSync(path.join(options.cwd, '.github/workflows/ignored.yml')), false);
      if (tool === 'actionlint' && args[0] !== '--version') actionlintScans++;
      if (tool === 'trivy' && args[0] === 'config') {
        return {status: 0, stdout: JSON.stringify({Results: [{Target: 'git::https:/example.test/module/main.tf',
          Misconfigurations: [{ID: 'AVD-REMOTE', Severity: 'HIGH', CauseMetadata: {StartLine: 8}}]}]})};
      }
      return scanners({gitleaks: []})(tool, args, options);
    }});
    assert.equal(actionlintScans, 0);
    assert.equal(report.lanes.actionlint.coverage, 'complete');
    assert.equal(report.lanes.trivy_config.coverage, 'incomplete');
    assert.ok(!report.findings.some(finding => finding.rule_id === 'AVD-REMOTE'));
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('tracked symlinks fail closed before any filesystem scanner can follow them', () => {
  const {root} = repository();
  try {
    fs.symlinkSync('/tmp/outside-scan-target', path.join(root, 'Dockerfile.link'));
    execFileSync('git', ['add', 'Dockerfile.link'], {cwd: root});
    execFileSync('git', ['commit', '-qm', 'tracked symlink'], {cwd: root});
    const report = run({cwd: root, spawn: () => assert.fail('scanners must not read through tracked symlinks')});
    assert.equal(report.coverage, 'incomplete');
    assert.match(report.error, /unsafe tracked entries/);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('reports repository-bound secret findings without exposing secret data', () => {
  const {root, revision} = repository();
  const secret = syntheticToken;
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
    assert.ok(!JSON.stringify(report).includes(secret));
    assert.doesNotMatch(JSON.stringify(report), /secret-token|account/);
    const gitleaksInvocation = [];
    const observedHeads = [];
    run({cwd: root, spawn: (tool, args, options) => {
      gitleaksInvocation.push({tool, args, options});
      if (tool === 'gitleaks' && args[0] === 'git') {
        assert.equal(options.cwd, root);
        observedHeads.push(execFileSync('git', ['rev-parse', 'HEAD'], {cwd: options.cwd, encoding: 'utf8'}).trim());
      }
      return spawn(tool, args, options);
    }});
    const scan = gitleaksInvocation.find(call => call.tool === 'gitleaks' && call.args[0] === 'git');
    assert.ok(scan.args.includes('--redact=100'));
    assert.ok(scan.args.includes('--report-format') && scan.args.includes('json'));
    assert.ok(scan.args.includes('--log-opts') && scan.args.includes(revision));
    assert.deepEqual(observedHeads, [revision]);
    assert.equal(fs.existsSync(scan.options.cwd), true);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('missing or failed Gitleaks marks secret coverage incomplete without raw diagnostics', () => {
  const {root} = repository();
  const secret = syntheticToken;
  try {
    const missing = run({cwd: root, spawn: (tool, args) => {
      if (tool === 'gitleaks') return {status: null, error: Object.assign(new Error(`ENOENT ${secret}`), {code: 'ENOENT'}), stderr: secret};
      return scanners({gitleaks: []})(tool, args);
    }});
    assert.equal(missing.secret_coverage, 'incomplete');
    assert.equal(missing.secret_tool.status, 'unavailable');
    assert.ok(!JSON.stringify(missing).includes(secret));
    const failed = run({cwd: root, spawn: (tool, args) => {
      if (tool === 'gitleaks' && args[0] === 'git') return {status: 2, stdout: `[{"Secret":"${secret}"}]`, stderr: secret};
      return scanners({gitleaks: []})(tool, args);
    }});
    assert.equal(failed.secret_coverage, 'incomplete');
    assert.equal(failed.secret_tool.status, 'failed');
    assert.ok(!JSON.stringify(failed).includes(secret));
    const semgrepFailure = run({cwd: root, spawn: (tool, args) => {
      if (tool === 'semgrep' && args[0] !== '--version') return {status: 2, stdout: JSON.stringify({results: []}), stderr: secret};
      return scanners({gitleaks: []})(tool, args);
    }});
    assert.equal(semgrepFailure.coverage, 'incomplete');
    assert.equal(semgrepFailure.secret_coverage, 'complete');
    const semgrepMissing = run({cwd: root, spawn: (tool, args) => {
      if (tool === 'semgrep') return {status: null, error: Object.assign(new Error('ENOENT'), {code: 'ENOENT'})};
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
      assert.ok(!JSON.stringify(report).includes(secret));
    }
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('uncommitted tracked, staged and untracked source cannot enter HEAD-bound scans', () => {
  for (const change of ['modified', 'staged', 'untracked']) {
    const {root, revision} = repository();
    const committed = fs.readFileSync(path.join(root, 'seeded-secret.js'), 'utf8');
    try {
      const source = change === 'untracked' ? 'new-secret.js' : 'seeded-secret.js';
      fs.writeFileSync(path.join(root, source), 'const changed = true;\n');
      if (change === 'staged') execFileSync('git', ['add', source], {cwd: root});
      const report = run({cwd: root, spawn: (tool, args, options) => {
        if (tool !== 'gitleaks') {
          assert.equal(fs.readFileSync(path.join(options.cwd, 'seeded-secret.js'), 'utf8'), committed);
          assert.equal(fs.existsSync(path.join(options.cwd, 'new-secret.js')), false);
        }
        return scanners({gitleaks: []})(tool, args, options);
      }});
      assert.equal(report.repository, 'https://example.test/owner/project');
      assert.equal(report.revision, revision);
      assert.equal(report.coverage, 'complete');
      assert.deepEqual(report.findings, []);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  }
});

test('Git archive attributes cannot omit or rewrite committed scanner source', () => {
  for (const [attribute, content] of [['export-ignore', 'plain\n'], ['export-subst', '$Format:%H$\n']]) {
    const {root} = repository();
    try {
      fs.writeFileSync(path.join(root, '.gitattributes'), `attribute.txt ${attribute}\n`);
      fs.writeFileSync(path.join(root, 'attribute.txt'), content);
      execFileSync('git', ['add', '.gitattributes', 'attribute.txt'], {cwd: root});
      execFileSync('git', ['commit', '-qm', 'archive attribute fixture'], {cwd: root});
      const report = run({cwd: root, spawn: (tool, args, options) => {
        if (tool !== 'gitleaks') assert.equal(fs.readFileSync(path.join(options.cwd, 'attribute.txt'), 'utf8'), content);
        return scanners({gitleaks: []})(tool,args,options);
      }});
      assert.equal(report.coverage, 'complete');
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  }
});

test('replacement refs cannot change scanned HEAD and Gitleaks cannot fetch history', () => {
  const {root,revision}=repository();
  try {
    const original=fs.readFileSync(path.join(root,'seeded-secret.js'),'utf8');
    fs.writeFileSync(path.join(root,'seeded-secret.js'),'const replacementTree = true;\n');
    execFileSync('git',['add','seeded-secret.js'],{cwd:root});
    execFileSync('git',['commit','-qm','replacement tree'],{cwd:root});
    const replacement=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
    execFileSync('git',['reset','--hard',revision],{cwd:root});
    execFileSync('git',['replace',revision,replacement],{cwd:root});
    const gitleaksEnvironments=[];
    const report=run({cwd:root,spawn:(tool,args,options)=>{
      if (tool==='gitleaks') gitleaksEnvironments.push(options.env);
      else assert.equal(fs.readFileSync(path.join(options.cwd,'seeded-secret.js'),'utf8'),original);
      return scanners({gitleaks:[]})(tool,args,options);
    }});
    assert.equal(report.revision,revision);
    assert.equal(report.coverage,'complete');
    assert.equal(gitleaksEnvironments.length,2);
    for (const env of gitleaksEnvironments) {
      assert.equal(env.GIT_NO_LAZY_FETCH,'1');
      assert.equal(env.GIT_NO_REPLACE_OBJECTS,'1');
      assert.equal(env.GIT_TERMINAL_PROMPT,'0');
    }
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});
