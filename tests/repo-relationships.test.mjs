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
