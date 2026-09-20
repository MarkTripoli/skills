#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || process.cwd());
const allowLicense = path.normalize('tools/safety-dance/LICENSE');
// Keep the retired product spelling assembled: this file must not be a source of
// the identity it enforces, nor should a negative fixture be an accidental hit.
const retired = [
  ['no', '-', 'mistakes'], ['no', '_', 'mistakes'], ['no', '-', 'mistakes', '-', 'home'],
  ['no', ' ', 'mistakes'], ['no', '.', 'mistakes'],
];
const retiredPatterns = retired.map(parts => new RegExp(parts.join(''), 'gi'));
const skipped = new Set(['.git', 'node_modules', 'dist']);
const binaryExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.gz', '.exe', '.dll', '.bin']);
async function files(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await files(full));
    else out.push(full);
  }
  return out;
}

export async function scan(scanRoot = root) {
  const findings = [];
  for (const file of await files(scanRoot)) {
    const relative = path.relative(scanRoot, file).split(path.sep).join('/');
    if (relative === allowLicense || relative.startsWith('.agents/tasks/')) continue;
    if (binaryExtensions.has(path.extname(file).toLowerCase())) continue;
    let text;
    try { text = await fs.readFile(file, 'utf8'); } catch { continue; }
    if (text.includes('\0')) continue;
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of retiredPatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          findings.push(`${relative}:${index + 1}: retired Safety Dance identity`);
          break;
        }
      }
    });
  }
  // The imported notice is product-owned and may only occur in its license.
  const license = path.join(scanRoot, allowLicense);
  try {
    const notice = await fs.readFile(license, 'utf8');
    if (!notice.includes('MIT License') || !notice.includes(['Copyright', ' (c) 2026 Kun Chen'].join('')) || !notice.includes('Permission is hereby granted')) findings.push(`${allowLicense}: missing imported MIT notice`);
	const legalLines = notice.split(/\r?\n/).filter(line => line.startsWith('Copyright'));
	const permissionFragment = ['Permission is hereby', ' granted'].join('');
	const softwareFragment = ['THE SOFTWARE', ' IS PROVIDED'].join('');
	const legalFragments = legalLines.concat([permissionFragment, softwareFragment]);
	for (const file of await files(scanRoot)) {
		const relative = path.relative(scanRoot, file).split(path.sep).join('/');
		if (relative === allowLicense || relative === 'LICENSE' || relative === 'scripts/check-safety-dance-identity.mjs' || relative === 'tests/safety-dance-identity.test.mjs' || relative.startsWith('.agents/tasks/') || binaryExtensions.has(path.extname(file).toLowerCase())) continue;
		let text; try { text = await fs.readFile(file, 'utf8'); } catch { continue; }
		for (const line of legalFragments) if (line && text.includes(line)) findings.push(`${relative}: imported legal notice outside ${allowLicense}`);
	}
  } catch { findings.push(`${allowLicense}: missing imported MIT notice`); }
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const findings = await scan();
  if (findings.length) {
    process.stderr.write(findings.join('\n') + '\n');
    process.exitCode = 1;
  }
}
