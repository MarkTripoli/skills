import fs from 'node:fs';
import path from 'node:path';
import { ARTIFACT_SERIES } from '../../shared/task-artifacts.mjs';
import { TASK_ARTIFACT_DISTRIBUTION } from './build.mjs';

const CONVENTIONS_FILE = 'shared/CONVENTIONS.md';
const HELPER_NAMES = ['task-artifacts.mjs', 'task-root.mjs'];
const REQUIRED_CONVENTIONS = [
  {
    pattern: /<!-- skills:task-root=relative\/path -->/,
    message: 'must document the exact task-root directive `<!-- skills:task-root=relative/path -->`',
  },
  {
    pattern: /An explicit existing `task_dir` is authoritative\. Its parent directory is the task root and no directive is consulted\./,
    message: 'must document explicit task_dir precedence over task-root directives',
  },
  {
    pattern: /A conflict between files, more than one directive in one file, an invalid value, or a symlinked instruction file fails closed/,
    message: 'must document fail-closed invalid task-root directives',
  },
  {
    pattern: /When `index\.json` is present it is authoritative:[\s\S]*?fails closed rather than falling back to a directory scan\./,
    message: 'must document the authoritative index and fail-closed invalid-index behavior',
  },
  {
    pattern: /legacy behavior[\s\S]*?applies only to a legacy task where `index\.json` is genuinely absent\./,
    message: 'must document genuine-absence-only legacy behavior',
  },
];
const STALE_PROSE = [
  { pattern: /newest artifact of type/i, label: 'newest artifact of type' },
  { pattern: /task directory listing/i, label: 'task directory listing' },
  { pattern: /highest(?:-|\s+|\s+`|-`)?NN\b/i, label: 'highest-NN selection' },
  { pattern: /root-level\s+`?pr-description\.md`?/i, label: 'root-level pr-description.md' },
  { pattern: /\bNN-(?:<type>|[a-z][a-z-]*)(?:-[^\s`]+)?\.md\b/i, label: 'NN- artifact pattern' },
  { pattern: /\brevis(?:e|es|ed|ing)\b[^.\n]*\bin place\b/i, label: 'in-place revision', legacyInPlace: true },
  { pattern: /\bupdat(?:e|es|ed|ing)\b[^.\n]*\bin place\b/i, label: 'in-place update', legacyInPlace: true },
  { pattern: /\bsav(?:e|es|ed|ing)\b[^.\n]*\bfile\b[^.\n]*\bin place\b/i, label: 'in-place save', legacyInPlace: true },
  { pattern: /same artifact path/i, label: 'same artifact path', legacyInPlace: true },
];

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

function listMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return listMarkdown(file);
    return entry.isFile() && entry.name.endsWith('.md') ? [file] : [];
  });
}

function documentedSeries(content) {
  const heading = 'The canonical series for each artifact type, exactly as `ARTIFACT_SERIES` in `shared/task-artifacts.mjs`:';
  const start = content.indexOf(heading);
  if (start === -1) return null;
  const table = content.slice(start + heading.length).trimStart().split(/\n\s*\n/, 2)[0];
  const entries = [...table.matchAll(/^\| `([^`]+)` \| `([^`]+)` \|$/gm)].map((match) => [match[1], match[2].split('.')]);
  return Object.fromEntries(entries);
}

function sameSeries(actual, expected) {
  const actualEntries = Object.entries(actual).sort(([left], [right]) => left.localeCompare(right));
  const expectedEntries = Object.entries(expected).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(actualEntries) === JSON.stringify(expectedEntries);
}

export function validateConventions(content, fail, artifactSeries = ARTIFACT_SERIES) {
  const series = documentedSeries(content);
  if (series === null || !sameSeries(series, artifactSeries)) {
    fail(CONVENTIONS_FILE, 71, 'canonical type-to-series table must exactly match ARTIFACT_SERIES');
  }
  for (const requirement of REQUIRED_CONVENTIONS) {
    if (!requirement.pattern.test(content)) fail(CONVENTIONS_FILE, 0, requirement.message);
  }
}

export function validateDeliveryProse(deliveryRoot, fail) {
  for (const file of listMarkdown(deliveryRoot)) {
    const content = fs.readFileSync(file, 'utf8');
    for (const paragraphMatch of content.matchAll(/(?:^|\n\s*\n)([^]*?)(?=\n\s*\n|$)/g)) {
      const paragraph = paragraphMatch[1];
      for (const rule of STALE_PROSE) {
        const match = rule.pattern.exec(paragraph);
        if (!match) continue;
        if (rule.legacyInPlace && /\blegacy\b/i.test(paragraph)) continue;
        const index = paragraphMatch.index + paragraphMatch[0].indexOf(paragraph) + match.index;
        fail(path.relative(path.dirname(deliveryRoot), file), lineOf(content, index), `stale task-artifact guidance: ${rule.label}`);
      }
    }
  }
}

export function validateDistribution(fail, distribution = TASK_ARTIFACT_DISTRIBUTION) {
  for (const name of ['canonical', 'plugin']) {
    if (distribution[name]?.mode !== 'manual-index-mutation') {
      fail('scripts/lib/build.mjs', 29, `TASK_ARTIFACT_DISTRIBUTION.${name} must use manual-index-mutation`);
    }
  }
  for (const name of ['runtime', 'portable']) {
    if (distribution[name]?.mode !== 'adjacent-helper' || distribution[name]?.required !== false) {
      fail('scripts/lib/build.mjs', 29, `TASK_ARTIFACT_DISTRIBUTION.${name} must use an optional adjacent helper`);
    }
  }
  if (distribution.atomic?.mode !== 'adjacent-helper' || distribution.atomic?.required !== true) {
    fail('scripts/lib/build.mjs', 29, 'TASK_ARTIFACT_DISTRIBUTION.atomic must require an adjacent helper');
  }
}

export function validateHelperDistribution({ root, repoRoot, skills, generated, fail }) {
  for (const skill of skills) {
    for (const helper of HELPER_NAMES) {
      const target = path.join(skill.dir, 'references', helper);
      const label = path.relative(root, target);
      if (!generated) {
        if (fs.existsSync(target)) fail(label, 0, `canonical skills must not carry copied ${helper}`);
        continue;
      }
      if (!fs.existsSync(target)) {
        fail(label, 0, `generated skills must carry references/${helper}`);
        continue;
      }
      const source = path.join(repoRoot, 'shared', helper);
      if (!fs.readFileSync(target).equals(fs.readFileSync(source))) {
        fail(label, 0, `generated ${helper} must be byte-identical to shared/${helper}`);
      }
    }
  }
}

export function validateTaskArtifacts({ root, repoRoot, skills, generated, fail }) {
  validateConventions(fs.readFileSync(path.join(repoRoot, CONVENTIONS_FILE), 'utf8'), fail);
  validateDeliveryProse(path.join(repoRoot, 'skills', 'delivery'), fail);
  validateDistribution(fail);
  validateHelperDistribution({ root, repoRoot, skills, generated, fail });
}
