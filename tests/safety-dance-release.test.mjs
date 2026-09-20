import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const root = path.resolve(new URL('..', import.meta.url).pathname);

test('release workflow is tag-only and covers native matrix', async () => {
  const workflow = await readFile(path.join(root, '.github/workflows/safety-dance-release.yml'), 'utf8');
  assert.match(workflow, /tags: \['safety-dance-v\*'\]/);
  for (const [os, goos, arch] of [['linux', 'linux', 'amd64'], ['linux', 'linux', 'arm64'], ['macos', 'darwin', 'amd64'], ['macos', 'darwin', 'arm64'], ['windows', 'windows', 'amd64']]) { assert.match(workflow, new RegExp(`os: ${os}[\\s\\S]*?goos: ${goos}[\\s\\S]*?arch: ${arch}`)); }
  assert.match(workflow, /GOOS:[\s\S]*?\[ "\$GOOS" = windows \] && suffix=\.exe/);
  assert.match(workflow, /package-release\.sh[\s\S]*?safety-dance\$suffix/);
  assert.match(workflow, /permissions:\s+contents: write/);
  assert.doesNotMatch(workflow, new RegExp('changesets/action'));
});

test('packager emits executable archive and checksum manifest for Windows', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'safety-dance-release-'));
  const binary = path.join(dir, 'binary.exe'); const out = path.join(dir, 'out');
  await writeFile(binary, 'fake executable');
  await run('sh', [path.join(root, 'tools/safety-dance/scripts/package-release.sh'), '--version', '1.2.3', '--os', 'windows', '--arch', 'amd64', '--binary', binary, '--out', out]);
  const files = await readdir(out);
  assert.ok(files.includes('safety-dance_1.2.3_windows_amd64.zip'));
  const archive = path.join(dir, 'archive'); await (await import('node:fs/promises')).mkdir(archive);
  await run('unzip', ['-q', path.join(out, 'safety-dance_1.2.3_windows_amd64.zip'), '-d', archive]);
  assert.equal(await readFile(path.join(archive, 'safety-dance.exe'), 'utf8'), 'fake executable');
  assert.ok((await readFile(path.join(archive, 'LICENSE'), 'utf8')).includes('MIT License'));
  assert.ok((await readFile(path.join(archive, 'THIRD_PARTY_NOTICES.md'), 'utf8')).length > 0);
  assert.match(await readFile(path.join(out, 'checksums.txt'), 'utf8'), /safety-dance_1\.2\.3_windows_amd64\.zip/);
  await rm(dir, { recursive: true, force: true });
});
