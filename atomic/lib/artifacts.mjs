import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseDocument } from 'yaml';

export const digest = value => crypto.createHash('sha256').update(value).digest('hex');
export function frontmatter(text, file = 'artifact') {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const end = lines.indexOf('---', 1);
  if (lines[0] !== '---' || end < 2) throw new Error(`${file}: missing YAML frontmatter`);
  const doc = parseDocument(lines.slice(1, end).join('\n'), { uniqueKeys: true });
  if (doc.errors.length) throw new Error(`${file}: ${doc.errors[0].message}`);
  const metadata = doc.toJS();
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') throw new Error(`${file}: frontmatter must be a mapping`);
  return { metadata, body: lines.slice(end + 1).join('\n').trim() };
}

const statuses = {
  reproduction: ['reproduced', 'not-reproduced'], verification: ['passed', 'failed', 'blocked'],
  'code-review': ['clean', 'findings', 'blocked'], 'app-test': ['passed', 'failed', 'blocked'],
  'pr-review': ['approved', 'pending', 'blocked'],
};
export function section(text, title) {
  const lines = text.split('\n');
  const start = lines.findIndex(line => line.trim().toLowerCase() === `## ${title}`.toLowerCase());
  if (start < 0) return '';
  const end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}

export function readArtifact(file) {
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`${file}: artifact symlinks are not accepted`);
  const text = fs.readFileSync(file, 'utf8');
  if (path.basename(file) === 'pr-description.md') {
    if (!section(text, 'Purpose') || !section(text, 'Change outline')) throw new Error(`${file}: incomplete PR description`);
    return { file, type: 'pr-description', summary: section(text, 'Purpose'), status: null, text, hash: digest(text), metadata: {} };
  }
  const { metadata, body } = frontmatter(text, file);
  if (typeof metadata.type !== 'string' || typeof metadata.summary !== 'string' || !metadata.summary.trim() || !body) throw new Error(`${file}: type, summary and artifact body are required`);
  if (statuses[metadata.type] && !statuses[metadata.type].includes(metadata.status)) throw new Error(`${file}: invalid ${metadata.type} status ${metadata.status}`);
  if (metadata.type === 'reproduction' && metadata.status === 'reproduced' && (!section(body, 'Reproduction') || !section(body, 'Cause') || !section(body, 'Fix'))) throw new Error(`${file}: reproduced requires reproduction evidence, cause and fix`);
  if (metadata.type === 'code-review' && metadata.status === 'clean') {
    const findings = section(body, 'Critical and Required Findings');
    if (!findings || /^###\s+CR-/m.test(findings)) throw new Error(`${file}: clean review still contains required findings or lacks their section`);
  }
  if (['verification', 'app-test'].includes(metadata.type) && metadata.status === 'passed') {
    const heading = metadata.type === 'verification' ? 'Items' : 'Steps';
    const allowed = metadata.type === 'verification' ? new Set(['pass', 'fail', 'untested']) : new Set(['pass', 'fail', 'unreachable']);
    const rows = section(body, heading).split('\n').filter(line => line.trim().startsWith('|')).map(line => line.split('|').slice(1, -1).map(cell => cell.trim().toLowerCase()));
    const header = rows.shift();
    if (!header || !header.includes('verdict')) throw new Error(`${file}: passed evidence requires a ${heading} verdict table`);
    const index = header.indexOf('verdict');
    const actual = rows.filter(row => row.length && !row.every(cell => /^-+$/.test(cell)));
    if (!actual.length || actual.some(row => !row[index] || !allowed.has(row[index])) || actual.some(row => row[index] !== 'pass')) throw new Error(`${file}: passed status contradicts evidence verdicts`);
  }
  return { file, type: metadata.type, summary: metadata.summary, status: metadata.status ?? null, text, hash: digest(text), metadata };
}

export function observeArtifacts(taskDir) {
  const latest = {};
  const hashes = {};
  const files = fs.readdirSync(taskDir).filter(name => /^\d{2,}-[a-z0-9-]+\.md$/.test(name) || name === 'pr-description.md').sort((a, b) => Number.parseInt(a) - Number.parseInt(b) || a.localeCompare(b));
  for (const name of files) {
    const artifact = readArtifact(path.join(taskDir, name));
    hashes[artifact.file] = artifact.hash;
    latest[artifact.type] = artifact;
  }
  return { latest, hashes };
}

// Only implementation checklists count. Human-review boxes and fenced examples never do.
export function planProgress(text) {
  const phases = [];
  let fence = null;
  let phase = null;
  let excludedLevel = null;
  const summary = [];
  for (const line of text.split('\n')) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) { if (!fence) fence = marker[1][0]; else if (marker[1][0] === fence) fence = null; continue; }
    if (fence) continue;
    const heading = line.match(/^(#{2,6})\s+(.+)$/);
    if (heading) {
      const depth = heading[1].length;
      if (excludedLevel !== null && depth <= excludedLevel) excludedLevel = null;
      if (/^(Human Review|Deferred human evidence|Known limits|Open Questions)\b/i.test(heading[2])) { excludedLevel = depth; if (depth === 2) phase = null; }
      const match = heading[2].match(/^(?:Phase|Step)\s+(\d+)\b/i);
      if (match && depth <= 3) { phase = { number: Number(match[1]), total: 0, remaining: 0 }; phases.push(phase); }
      else if (depth === 2) phase = null;
      continue;
    }
    if (excludedLevel !== null) continue;
    const box = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (!box) continue;
    if (phase) { phase.total++; if (box[1] === ' ') phase.remaining++; }
    else if (/^(Phase|Step)\s+\d+\b/i.test(box[2])) summary.push(box[1] !== ' ');
  }
  if (!phases.length || phases.some(phase => !phase.total)) throw new Error('Implementation source must contain numbered phases with executable checklists');
  return { phases, complete: phases.every(phase => !phase.remaining) && summary.every(Boolean), remaining: phases.reduce((n, phase) => n + phase.remaining, 0) + summary.filter(done => !done).length };
}

export function requireFresh(before, after, type) {
  const artifact = after.latest[type];
  if (!artifact || before.hashes[artifact.file] === artifact.hash) throw new Error(`Stage did not create or revise its ${type} artifact; agent success is not evidence`);
  return artifact;
}

export function validateChildren(children) {
  if (!children.length) throw new Error('Epic delivery has no child tasks');
  const names = new Set(children.map(child => child.slug));
  if (names.size !== children.length) throw new Error('Duplicate epic child slug');
  for (const child of children) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(child.slug) || !['full', 'lean', 'prd', 'oneshot', 'bugfix'].includes(child.workflow)) throw new Error(`Invalid epic child ${child.slug}`);
    if (!Array.isArray(child.depends_on) || child.depends_on.some(dep => !names.has(dep) || dep === child.slug)) throw new Error(`Invalid dependencies for ${child.slug}`);
  }
  const seen = new Set();
  const active = new Set();
  function visit(name) {
    if (active.has(name)) throw new Error('Epic child dependency cycle');
    if (seen.has(name)) return;
    active.add(name);
    for (const dep of children.find(child => child.slug === name).depends_on) visit(dep);
    active.delete(name); seen.add(name);
  }
  for (const name of names) visit(name);
  return children;
}
