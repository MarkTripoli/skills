import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {analyze} from '../skills/delivery/repo-relationships/scripts/analyze.mjs';

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
    const publisher = create('publisher', {'src/events.js': "client.publish('orders.created', payload);\nclient.publish('orders.deleted', payload);\n"});
    const subscriber = create('subscriber', {'src/handlers.js': "client.subscribe('orders.created', handler);\nclient.subscribe('billing.paid', handler);\n"});
    const report = analyze([{name: 'publisher', root: publisher}, {name: 'subscriber', root: subscriber}]);
    assert.equal(report.coverage, 'complete');
    assert.equal(report.repositories.length, 2);
    assert.equal(report.relationships.filter(edge => edge.kind === 'nats-subject').length, 1);
    const edge = report.relationships.find(item => item.kind === 'nats-subject');
    assert.equal(edge.subject, 'orders.created');
    assert.equal(edge.from.source.line, 1);
    assert.equal(edge.to.source.line, 1);
    assert.equal(report.repositories.some(repo => JSON.stringify(repo).includes('token')), false);
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
