#!/usr/bin/env node
// Validate, write and verify a model-candidate profile; restore the prior file on any failure.
// Usage: node write-profile.mjs --target <file> --profile <json-or-file> --scope project|env --skills-dir <dir> [--cwd <project>]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const fail = (message) => { process.stderr.write(`${message}\n`); process.exit(1); };

const target = option('target');
const scope = option('scope');
const skillsDir = option('skills-dir');
const cwd = path.resolve(option('cwd') ?? process.cwd());
const profileArg = option('profile');
if (!target || !profileArg || !skillsDir || !['project', 'env'].includes(scope)) fail('usage: write-profile.mjs --target <file> --profile <json-or-file> --scope project|env --skills-dir <dir> [--cwd <project>]');

const { normalizeCandidates, routeModel } = await import(pathToFileURL(path.resolve(skillsDir, 'route-model', 'route-model.mjs')).href);

let profile;
try { profile = JSON.parse(profileArg.trim().startsWith('{') ? profileArg : fs.readFileSync(profileArg, 'utf8')); } catch (error) { fail(`profile is not valid JSON: ${error.message}`); }
try {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('profile must be an object');
  if (profile.routing !== undefined && profile.routing !== 'auto' && profile.routing !== 'fixed') throw new Error(`routing must be auto or fixed, got ${JSON.stringify(profile.routing)}`);
  if (!Array.isArray(profile.candidates)) throw new Error('candidates must be an array');
  const candidates = normalizeCandidates(profile.candidates, profile.economy);
  profile = { economy: profile.economy, ...(profile.routing === undefined ? {} : { routing: profile.routing }), candidates };
} catch (error) { fail(`invalid profile: ${error.message}`); }

const models = profile.candidates.map(candidate => candidate.model);
const absolute = path.resolve(target);
const suffix = `${process.pid}-${Date.now()}`;
const temp = `${absolute}.tmp-${suffix}`;
const backup = `${absolute}.bak-${suffix}`;
const existed = fs.existsSync(absolute);
const lookup = (options) => routeModel(skillsDir, { phase: 'unknown-phase', ...options });
const same = (result, source) => result.model === profile.economy && result.profileSource === source && JSON.stringify(result.candidates) === JSON.stringify(models);

let renamed = false;
let failure = '';
let keepBackup = false;
try {
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(temp, `${JSON.stringify(profile, null, 2)}\n`);
  const saved = JSON.parse(fs.readFileSync(temp, 'utf8'));
  if (!same(await lookup({ candidates: saved.candidates, economy: saved.economy, routing: saved.routing }), 'explicit')) throw new Error('temporary profile did not verify through route-model');
  if (existed) fs.copyFileSync(absolute, backup);
  fs.renameSync(temp, absolute);
  renamed = true;
  const final = scope === 'project'
    ? await lookup({ cwd, projectOnly: true })
    : await lookup({ cwd, env: { ...process.env, SKILLS_MODEL_CANDIDATES_FILE: absolute } });
  if (!same(final, scope)) throw new Error(`final lookup did not return the saved profile (profileSource ${final.profileSource}); a project profile must be at <cwd>/.agents/model-candidates.json`);
  process.stdout.write(`${JSON.stringify({ ok: true, target: absolute, scope, economy: profile.economy, routing: profile.routing ?? 'auto', candidates: models, profileSource: scope, replaced: existed })}\n`);
} catch (error) {
  failure = error.message;
  try {
    if (renamed) { if (existed) fs.renameSync(backup, absolute); else fs.rmSync(absolute, { force: true }); }
  } catch (restoreError) { failure += `; restore failed, prior profile kept at ${backup}: ${restoreError.message}`; keepBackup = true; }
} finally {
  fs.rmSync(temp, { force: true });
  if (!keepBackup) fs.rmSync(backup, { force: true });
}
if (failure) fail(failure);
