import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {analyze} from '../skills/delivery/repo-relationships/scripts/analyze.mjs';
import {fileURLToPath} from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-relationships-'));
  const create = (name, files) => {
    const root = path.join(base, name); fs.mkdirSync(root);
    const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: 'ignore'});
    git('init', '-q'); git('config', 'user.email', 'fixture@example.test'); git('config', 'user.name', 'Fixture');
    git('remote', 'add', 'origin', `https://user:token@example.test/owner/${name}.git`);
    for (const [file, content] of Object.entries(files)) { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, content); }
    git('add', '.'); git('commit', '-qm', 'fixture'); return root;
  };
  return {base, create};
}

test('matches literal cross-repository NATS subject and excludes unmatched subscription', () => {
  const {base, create} = fixture();
  try {
    const publisher = create('publisher', {
      '.gitignore': 'ignored.js\n',
      'src/events.js': "import { connect } from 'nats';\nconst client = await connect();\n// client.publish('comment.fake', payload);\nclient.publish('orders.created', payload);\nother.client.publish('orders.created', payload);\nif (enabled && /client.publish('orders.created', payload)/.test(text)) {}\nclient.publish('orders.deleted', payload);\nconst example = \"client.publish('string.fake', payload)\";\nother.publish('orders.created', payload);\n",
    });
    const subscriber = create('subscriber', {'src/handlers.js': "import { connect } from 'nats';\nconst client = await connect();\n// client.subscribe('comment.fake', handler);\nclient.subscribe('orders.created', handler);\nclient.subscribe('billing.paid', handler);\n"});
    const impostor = create('impostor', {'src/fake.js': "other.publish('orders.created', payload);\n"});
    const marker = path.join(base, 'fsmonitor-ran');
    execFileSync('git', ['config', 'core.fsmonitor', `!touch ${marker}`], {cwd: publisher, stdio: 'ignore'});
    const indexPath = path.join(publisher, '.git', 'index');
    const indexBefore = fs.readFileSync(indexPath);
    fs.writeFileSync(path.join(publisher, 'src/events.js'), "import { connect } from 'nats';\nconst client = await connect();\nclient.publish('orders.wrong-working-copy', payload);\n");
    fs.writeFileSync(path.join(publisher, 'ignored.js'), "import { connect } from 'nats';\nconst client = await connect();\nclient.publish('orders.created', payload);\n");
    const report = analyze([{name: 'publisher', root: publisher}, {name: 'subscriber', root: subscriber}, {name: 'impostor', root: impostor}]);
    assert.equal(report.coverage, 'complete');
    assert.equal(report.repositories.length, 3);
    assert.equal(report.relationships.filter(edge => edge.kind === 'nats-subject').length, 1);
    const edge = report.relationships.find(item => item.kind === 'nats-subject');
    assert.equal(edge.from.source.line, 4);
    assert.equal(edge.to.source.line, 4);
    assert.equal(report.evidence.filter(item => item.kind.startsWith('nats-')).length, 4);
    assert.equal(edge.classification, 'candidate');
    assert.deepEqual(fs.readFileSync(indexPath), indexBefore);
    assert.equal(fs.existsSync(marker), false);
    assert.equal(report.evidence.some(item => item.source.path === 'ignored.js'), false);
    assert.equal(report.repositories.some(repo => JSON.stringify(repo).includes('token')), false);
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
});
test('ignores regex literals and member-property NATS lookalikes', () => {
  const {base, create} = fixture();
  try {
    const publisher = create('publisher', {
      'src/events.js': "import { connect } from 'nats';\nconst nc = await connect();\nnc.publish('orders.created', payload);\nif (ready && /nc.publish(\"orders.created\")/.test(source)) {}\nasync function waitForPattern() { await /nc.publish(\"orders.created\", payload)/.test(source); }\nfunction* patterns() { yield /nc.publish(\"orders.created\", payload)/; }\nother.nc.publish('orders.created', payload);\n",
    });
    const subscriber = create('subscriber', {
      'src/events.js': "import { connect } from 'nats';\nconst nc = await connect();\nnc.subscribe('orders.created', handler);\n",
    });
    const report = analyze([{name: 'publisher', root: publisher}, {name: 'subscriber', root: subscriber}]);
    assert.equal(report.coverage, 'complete');
    assert.equal(report.evidence.filter(edge => edge.repo === 'publisher' && edge.kind === 'nats-publish').length, 1);
    assert.equal(report.relationships.filter(edge => edge.kind === 'nats-subject' && edge.subject === 'orders.created').length, 1);
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
});
test('fails closed on typed arrow parameters shadowing NATS clients', () => {
  const {base, create} = fixture();
  try {
    const publisher = create('publisher', {
      'src/events.ts': "import { connect } from 'nats';\nconst nc = await connect();\nnc.publish('orders.created', payload);\nconst forward = (nc: Fake) => { nc.publish('orders.created', payload); };\n",
    });
    const subscriber = create('subscriber', {
      'src/events.ts': "import { connect } from 'nats';\nconst nc = await connect();\nnc.subscribe('orders.created', handler);\n",
    });
    const report = analyze([{name: 'publisher', root: publisher}, {name: 'subscriber', root: subscriber}]);
    assert.equal(report.coverage, 'incomplete');
    assert.equal(report.evidence.some(edge => edge.repo === 'publisher' && edge.kind === 'nats-publish'), false);
    assert.equal(report.relationships.some(edge => edge.kind === 'nats-subject' && edge.subject === 'orders.created'), false);
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
});
test('CLI preserves analyzable HEAD snapshots for imported NATS sources', () => {
  const {base, create} = fixture();
  try {
    const publisher = create('publisher', {'src/events.js': "import { connect } from 'nats';\nconst nc = await connect();\nnc.publish('snapshot.ready', payload);\n"});
    const subscriber = create('subscriber', {'src/events.js': "import { connect } from 'nats';\nconst nc = await connect();\nnc.subscribe('snapshot.ready', handler);\n"});
    const result = spawnSync(process.execPath, [path.join(projectRoot, 'skills/delivery/repo-relationships/scripts/analyze.mjs'), '--repo', `publisher=${publisher}`, '--repo', `subscriber=${subscriber}`], {cwd: base, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.coverage, 'complete');
    assert.deepEqual(report.skipped_roots, []);
    assert.equal(report.relationships.filter(edge => edge.kind === 'nats-subject' && edge.subject === 'snapshot.ready').length, 1);
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
});
test('CLI fingerprints remote path without exposing secret-like segments', () => {
  const {base, create} = fixture();
  try {
    const publisher = create('publisher', {'src/events.js': 'export const publisher = true;\n'});
    const subscriber = create('subscriber', {'src/events.js': 'export const subscriber = true;\n'});
    execFileSync('git', ['remote', 'set-url', 'origin', 'https://host.invalid/fake-pat/private-repo.git'], {cwd: publisher, stdio: 'ignore'});
    execFileSync('git', ['remote', 'set-url', 'origin', 'https://host.invalid/other/private-repo.git'], {cwd: subscriber, stdio: 'ignore'});
    const result = spawnSync(process.execPath, [path.join(projectRoot, 'skills/delivery/repo-relationships/scripts/analyze.mjs'), '--repo', `publisher=${publisher}`, '--repo', `subscriber=${subscriber}`], {cwd: base, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes('fake-pat'), false);
    assert.equal(result.stderr.includes('fake-pat'), false);
    const report = JSON.parse(result.stdout);
    const publisherOrigin = report.repositories.find(repo => repo.name === 'publisher').origin;
    const subscriberOrigin = report.repositories.find(repo => repo.name === 'subscriber').origin;
    const fingerprint = pathname => createHash('sha256').update(pathname).digest('hex');
    assert.equal(publisherOrigin, `https://host.invalid#sha256=${fingerprint('/fake-pat/private-repo.git')}`);
    assert.equal(subscriberOrigin, `https://host.invalid#sha256=${fingerprint('/other/private-repo.git')}`);
    assert.notEqual(publisherOrigin, subscriberOrigin);
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
});

test('rejects ambiguous package citations, fake manifest names, and duplicate YAML keys', () => {
  const {base, create} = fixture();
  try {
    const app = create('app', {
      'package.json': '{\n  "name": "wrong",\n  "name": "ambiguous",\n  "dependencies": { "pkg": "1", "pkg": "2" }\n}\n',
      'fakepackage.json': '{\n  "name": "fake"\n}\n',
      'broken/duplicate.yaml': 'apiVersion: apps/v1\nkind: Deployment\nkind: Service\nmetadata:\n  name: duplicated\nspec:\n  selector:\n    app: duplicated\n',
    });
    const client = create('client', {'package.json': '{\n  "name": "client",\n  "dependencies": { "ambiguous": "1", "fake": "1" }\n}\n'});
    const report = analyze([{name: 'app', root: app}, {name: 'client', root: client}]);
    assert.equal(report.coverage, 'incomplete');
    assert.equal(report.evidence.some(edge => edge.kind === 'package-identity' && edge.repo === 'app'), false);
    assert.equal(report.evidence.some(edge => edge.kind === 'package-dependency' && edge.repo === 'app'), false);
    assert.equal(report.evidence.some(edge => edge.kind === 'kubernetes-declaration' && edge.repo === 'app'), false);
    assert.equal(report.relationships.some(edge => edge.kind === 'package-dependency-match'), false);
    assert.ok(report.skipped_roots.some(root => root.name === 'app'));
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
});

test('rejects subdirectory roots and duplicate Git common directories', () => {
  const {base, create} = fixture();
  try {
    const first = create('first', {'src/code.js': 'export const value = 1;\n'});
    const second = create('second', {'src/code.js': 'export const value = 2;\n'});
    const nested = analyze([{name: 'nested', root: path.join(first, 'src')}, {name: 'second', root: second}]);
    assert.ok(nested.skipped_roots.some(root => root.name === 'nested'));
    const linked = path.join(base, 'linked');
    execFileSync('git', ['worktree', 'add', '--detach', linked, 'HEAD'], {cwd: first, stdio: 'ignore'});
    const duplicate = analyze([{name: 'first', root: first}, {name: 'linked', root: linked}]);
    assert.deepEqual(duplicate.skipped_roots.map(root => root.reason), ['duplicate-git-common-dir', 'duplicate-git-common-dir']);
    assert.equal(duplicate.evidence.length, 0);
    execFileSync('git', ['worktree', 'remove', '--force', linked], {cwd: first, stdio: 'ignore'});
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
});

test('ignores Git replace refs when binding sources to reported HEAD', () => {
  const {base, create} = fixture();
  try {
    const publisher = create('publisher', {'src/events.js': "import { connect } from 'nats';\nconst nc = await connect();\nnc.publish('original.subject', value);\n"});
    const subscriber = create('subscriber', {'src/events.js': "import { connect } from 'nats';\nconst nc = await connect();\nnc.subscribe('original.subject', handler);\n"});
    const git = (...args) => execFileSync('git', args, {cwd: publisher, encoding: 'utf8'}).trim();
    const original = git('rev-parse', 'HEAD');
    fs.writeFileSync(path.join(publisher, 'src/events.js'), "import { connect } from 'nats';\nconst nc = await connect();\nnc.publish('replacement.subject', value);\n");
    git('add', 'src/events.js');
    const tree = git('write-tree');
    const replacement = git('commit-tree', tree, '-m', 'replacement tree');
    git('replace', original, replacement);
    const report = analyze([{name: 'publisher', root: publisher}, {name: 'subscriber', root: subscriber}]);
    assert.equal(report.repositories.find(repo => repo.name === 'publisher').head, original);
    assert.equal(report.relationships.some(edge => edge.kind === 'nats-subject' && edge.subject === 'original.subject'), true);
    assert.equal(report.relationships.some(edge => edge.kind === 'nats-subject' && edge.subject === 'replacement.subject'), false);
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
});
test('matches bounded NATS sources with deeply nested parentheses', () => {
  const {base, create} = fixture();
  try {
    const nested = "if (" + '('.repeat(40000) + 'true' + ')'.repeat(40000) + ") {\nnc.publish('deep.subject', payload);\n}\n";
    const publisher = create('publisher', {'src/events.js': "import { connect } from 'nats';\nconst nc = await connect();\n" + nested});
    const subscriber = create('subscriber', {'src/events.js': "import { connect } from 'nats';\nconst nc = await connect();\nnc.subscribe('deep.subject', handler);\n"});
    const report = analyze([{name: 'publisher', root: publisher}, {name: 'subscriber', root: subscriber}]);
    assert.equal(report.coverage, 'complete');
    assert.equal(report.relationships.filter(edge => edge.kind === 'nats-subject' && edge.subject === 'deep.subject').length, 1);
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
});

test('bounds relationship expansion and reports incomplete coverage', () => {
  const {base, create} = fixture();
  try {
    const publisherSource = "import { connect } from 'nats';\nconst nc = await connect();\n" +
      Array.from({length: 80}, () => "nc.publish('common.subject', value);\n").join('');
    const subscriberSource = "import { connect } from 'nats';\nconst nc = await connect();\n" +
      Array.from({length: 70}, () => "nc.subscribe('common.subject', handler);\n").join('');
    const publisher = create('publisher', {'src/pub.js': publisherSource});
    const subscriber = create('subscriber', {'src/sub.js': subscriberSource});
    const report = analyze([{name: 'publisher', root: publisher}, {name: 'subscriber', root: subscriber}]);
    assert.equal(report.relationships.length, 5000);
    assert.equal(report.coverage, 'incomplete');
    assert.ok(report.skipped_roots.every(root => root.reason === 'relationship-limit'));
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
});

test('caps collected evidence before cross-repository expansion', () => {
  const {base, create} = fixture();
  try {
    const publishes = "import { connect } from 'nats';\nconst nc = await connect();\n" +
      Array.from({length: 5001}, () => "nc.publish('bounded.subject', value);\n").join('');
    const subscribes = "import { connect } from 'nats';\nconst nc = await connect();\n" +
      Array.from({length: 5001}, () => "nc.subscribe('bounded.subject', handler);\n").join('');
    const publisher = create('publisher', {'src/pub.js': publishes});
    const subscriber = create('subscriber', {'src/sub.js': subscribes});
    const report = analyze([{name: 'publisher', root: publisher}, {name: 'subscriber', root: subscriber}]);
    assert.equal(report.evidence.length, 10000);
    const lastPublish = report.evidence.filter(edge => edge.repo === 'publisher' && edge.kind === 'nats-publish').at(-1);
    assert.equal(lastPublish.source.line, 5003);
    assert.equal(report.coverage, 'incomplete');
    assert.ok(report.skipped_roots.some(root => root.reason === 'evidence-limit'));
    assert.ok(report.relationships.length <= 5000);
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
});

test('retains valid package citations and marks multi-document and malformed YAML incomplete', () => {
  const {base, create} = fixture();
  try {
    const consumer = create('consumer', {
      'package.json': '{\n  "name": "consumer",\n  "scripts": {\n    "@scope/shared": "not a dependency"\n  },\n  "dependencies": {\n    "@scope/shared": "1.0.0"\n  }\n}\n',
      'deployments/workloads.yaml': '---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: first\nspec:\n  template:\n    metadata:\n      labels:\n        app: shared\n---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: second\nspec:\n  template:\n    metadata:\n      labels:\n        app: shared\n',
      'deployments/broken.yaml': 'kind: [\n',
    });
    const provider = create('provider', {'package.json': '{\n  "name": "@scope/shared",\n  "version": "1.0.0"\n}\n'});
    const report = analyze([{name: 'consumer', root: consumer}, {name: 'provider', root: provider}]);
    const packageEdge = report.relationships.find(edge => edge.kind === 'package-dependency-match');
    assert.ok(packageEdge);
    assert.equal(packageEdge.from.source.line, 7);
    assert.equal(packageEdge.to.source.line, 2);
    assert.equal(fs.readFileSync(path.join(consumer, packageEdge.from.source.path), 'utf8').split('\n')[6].trimStart(), '"@scope/shared": "1.0.0"');
    assert.equal(report.evidence.filter(edge => edge.kind === 'kubernetes-declaration' && edge.repo === 'consumer').length, 2);
    assert.equal(report.coverage, 'incomplete');
    assert.deepEqual(report.skipped_roots.map(root => root.name), ['consumer']);
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
});

test('installed skill parses YAML without resolving a parent node_modules', () => {
  const {base, create} = fixture();
  try {
    const skill = path.join(base, 'installed', 'repo-relationships');
    fs.cpSync(path.join(projectRoot, 'skills/delivery/repo-relationships'), skill, {recursive: true});
    const unsafeMarker = 'synthetic-yaml-credential-marker';
    const publisher = create('publisher', {
      'src/events.js': "import { connect } from 'nats';\nconst nc = await connect();\nnc.publish('install.ready', value);\n",
      'deploy/service.yaml': 'apiVersion: v1\nkind: Service\nmetadata:\n  name: consumer-service\n  annotations:\n    sample: |\n      import { connect } from "nats";\n      const fake = await connect();\n      fake.publish("install.ready", value);\nspec:\n  selector:\n    app: consumer\n',
      'deploy/complex.yaml': `apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: complex\n? [${unsafeMarker}, secondary]\n: hidden\n`,
    });
    const subscriber = create('subscriber', {
      'src/events.js': "import { connect } from 'nats';\nconst nc = await connect();\nnc.subscribe('install.ready', handler);\n",
      'deploy/workload.yaml': 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: consumer\nspec:\n  template:\n    metadata:\n      labels:\n        app: consumer\n',
      'deploy/key-collision.yaml': 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: numeric-collision\nspec:\n  template:\n    metadata:\n      labels:\n        1: numeric\n        "1": string\n',
    });
    assert.equal(fs.existsSync(path.join(base, 'node_modules')), false);
    const result = spawnSync(process.execPath, [path.join(skill, 'scripts/analyze.mjs'), '--repo', `publisher=${publisher}`, '--repo', `subscriber=${subscriber}`], {cwd: base, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout.includes(unsafeMarker), false);
    const report = JSON.parse(result.stdout);
    assert.equal(report.security.credentials_emitted, false);
    assert.equal(report.coverage, 'incomplete');
    assert.equal(report.relationships.filter(edge => edge.kind === 'nats-subject').length, 1);
    assert.ok(report.relationships.some(edge => edge.kind === 'nats-subject' && edge.from.source.path === 'src/events.js'));
    assert.equal(report.evidence.some(edge => edge.name === 'numeric-collision' || edge.name === 'complex'), false);
    assert.ok(report.skipped_roots.some(root => root.name === 'publisher' && root.coverage === 'incomplete'));
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
});
test('fails closed on controller metadata labels but accepts Pod labels', () => {
  const {base, create} = fixture();
  try {
    const service = create('service', {
      'deploy/service.yaml': 'apiVersion: v1\nkind: Service\nmetadata:\n  name: shared-service\nspec:\n  selector:\n    app: shared\n',
    });
    const workloads = create('workloads', {
      'deploy/controller.yaml': 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: controller\n  labels:\n    app: shared\nspec:\n  template:\n    metadata: {}\n',
      'deploy/pod.yaml': 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: labeled-pod\n  labels:\n    app: shared\nspec: {}\n',
    });
    const report = analyze([{name: 'service', root: service}, {name: 'workloads', root: workloads}]);
    const matches = report.relationships.filter(edge => edge.kind === 'kubernetes-selector-match');
    assert.equal(matches.length, 1);
    assert.equal(matches[0].to.name, 'labeled-pod');
    assert.equal(matches[0].from.namespace, 'default');
    assert.equal(matches[0].to.namespace, 'default');
    assert.equal(report.coverage, 'complete');
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
});
test('matches Kubernetes selectors only within the same namespace', () => {
  const {base, create} = fixture();
  try {
    const crossService = create('cross-service', {
      'deploy/service.yaml': 'apiVersion: v1\nkind: Service\nmetadata:\n  name: cross-service\n  namespace: alpha\nspec:\n  selector:\n    app: api\n',
    });
    const crossPod = create('cross-pod', {
      'deploy/pod.yaml': 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: cross-pod\n  namespace: beta\n  labels:\n    app: api\nspec: {}\n',
    });
    const sameService = create('same-service', {
      'deploy/service.yaml': 'apiVersion: v1\nkind: Service\nmetadata:\n  name: same-service\n  namespace: alpha\nspec:\n  selector:\n    app: same\n',
    });
    const samePod = create('same-pod', {
      'deploy/pod.yaml': 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: same-pod\n  namespace: alpha\n  labels:\n    app: same\nspec: {}\n',
    });
    const report = analyze([
      {name: 'cross-service', root: crossService},
      {name: 'cross-pod', root: crossPod},
      {name: 'same-service', root: sameService},
      {name: 'same-pod', root: samePod},
    ]);
    const matches = report.relationships.filter(edge => edge.kind === 'kubernetes-selector-match');
    assert.equal(matches.length, 1);
    assert.equal(matches[0].from.name, 'same-service');
    assert.equal(matches[0].to.name, 'same-pod');
    assert.equal(matches[0].from.namespace, 'alpha');
    assert.equal(matches[0].to.namespace, 'alpha');
    assert.equal(report.evidence.filter(edge => edge.kind === 'kubernetes-declaration').every(edge => typeof edge.namespace === 'string'), true);
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
});
test('rejects non-string Kubernetes selector values before matching', () => {
  const {base, create} = fixture();
  try {
    const service = create('service', {'deploy/service.yaml': 'apiVersion: v1\nkind: Service\nmetadata:\n  name: boolean-service\nspec:\n  selector:\n    app: true\n'});
    const pod = create('pod', {'deploy/pod.yaml': 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: boolean-pod\n  labels:\n    app: true\nspec: {}\n'});
    const report = analyze([{name: 'service', root: service}, {name: 'pod', root: pod}]);
    assert.equal(report.relationships.some(edge => edge.kind === 'kubernetes-selector-match'), false);
    assert.equal(report.evidence.some(edge => edge.kind === 'kubernetes-declaration'), false);
    assert.equal(report.coverage, 'incomplete');
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
});

test('rejects shadowed NATS symbols and ignores YAML block scalar code', () => {
  const {base, create} = fixture();
  try {
    const publisher = create('publisher', {'src/events.js': "import { connect } from 'nats';\nconst client = await connect();\nclient.publish('orders.created', payload);\n"});
    const subscriber = create('subscriber', {'src/events.js': "import { connect } from 'nats';\nconst client = await connect();\nclient.subscribe('orders.created', handler);\n"});
    const ambiguous = create('ambiguous', {
      'src/shadow.ts': "import { connect } from 'nats';\nconst nc = await connect();\nfunction send(nc: Fake): void { nc.publish('orders.created', payload); }\n",
      'src/shadow.js': "import { connect } from 'nats';\nconst client = await connect();\nfunction consume(client) { client.subscribe('orders.created', handler); }\nfunction fake() { const connect = () => ({}); const client = connect(); client.subscribe('orders.created', handler); }\n",
      'deploy/workload.yaml': 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: safe-workload\n  annotations:\n    sample: |\n      import { connect } from "nats";\n      const fake = await connect();\n      fake.subscribe("orders.created", handler);\nspec:\n  template:\n    metadata:\n      labels:\n        app: safe\n',
    });
    const uncertain = create('uncertain', {
      'src/regex.ts': "import { connect } from 'nats';\nconst nc = await connect();\nif (enabled && /unterminated nc.publish('orders.created', payload)\n",
    });
    const report = analyze([{name: 'publisher', root: publisher}, {name: 'subscriber', root: subscriber}, {name: 'ambiguous', root: ambiguous}, {name: 'uncertain', root: uncertain}]);
    assert.equal(report.relationships.filter(edge => edge.kind === 'nats-subject').length, 1);
    assert.equal(report.relationships.some(edge => edge.kind === 'nats-subject' && (edge.from.repo === 'ambiguous' || edge.to.repo === 'ambiguous' || edge.from.repo === 'uncertain' || edge.to.repo === 'uncertain')), false);
    assert.equal(report.evidence.some(edge => ['ambiguous', 'uncertain'].includes(edge.repo) && edge.kind.startsWith('nats-')), false);
    assert.ok(report.skipped_roots.some(root => root.name === 'ambiguous' && root.coverage === 'incomplete'));
    assert.ok(report.skipped_roots.some(root => root.name === 'uncertain' && root.coverage === 'incomplete'));
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
});
