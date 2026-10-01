import fs from 'node:fs';
import path from 'node:path';
import { buildRuntime, copyTaskArtifactHelper, relinkSkillTree, repoRoot } from './build.mjs';
import { scanSkills } from './layout.mjs';
import { short } from './install-plan.mjs';
import { MARK_BEGIN, MARK_END, managedRange, configBlocks, currentRetiredItems } from './install-retirement.mjs';

const noDsStore = src => path.basename(src) !== '.DS_Store';
const publicationFiles = ['hooks/omp-publication.mjs', 'shared/publication-command.mjs', 'shared/publication-proof.mjs', 'shared/publication-proof-policy.mjs', 'shared/task-artifacts.mjs', 'shared/task-root.mjs'];

function copyDir(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, filter: noDsStore });
}
export function updateConfigBlock(text, block) {
  const begin = text.indexOf(MARK_BEGIN); const end = text.indexOf(MARK_END);
  let before = text; let after = '';
  if (begin !== -1 && end !== -1 && end > begin) { before = text.slice(0, begin); after = text.slice(end + MARK_END.length).replace(/^\n/, ''); }
  if (block === null) return `${before.replace(/\n+$/, '\n')}${after}`.replace(/^\n$/, '');
  const body = `${MARK_BEGIN}\n${block.trim()}\n${MARK_END}\n`;
  const separator = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  return `${before}${separator}${body}${after}`;
}
function selectedConfigBlock(text, block, names, uninstall) {
  const range = managedRange(text);
  if (!range) return uninstall ? text : updateConfigBlock(text, block);
  let body = text.slice(range.bodyStart, range.bodyEnd);
  const incoming = configBlocks(block); const selected = new Set(names); const found = new Set();
  const headers = [...body.matchAll(/^\[([^\]\n]+)\][ \t]*$/gm)];
  for (let index = headers.length - 1; index >= 0; index--) {
    const header = headers[index]; const name = header[1].startsWith('agents.') ? header[1].slice(7) : null;
    if (!selected.has(name)) continue;
    found.add(name);
    const replacement = uninstall ? '' : `${incoming.get(name) || ''}\n\n`;
    body = body.slice(0, header.index) + replacement + body.slice(headers[index + 1]?.index ?? body.length);
  }
  if (!uninstall) for (const name of names) if (!found.has(name) && incoming.has(name)) {
    body = `${body.trimEnd()}\n\n${incoming.get(name)}\n`;
  }
  if (!body.trim()) return updateConfigBlock(text, null);
  return text.slice(0, range.bodyStart) + body + text.slice(range.bodyEnd);
}
export function apply(planned, { built, uninstall, home }) {
  const done = [];
  for (const step of planned.steps) {
    const tree = built.get(step.target);
    switch (step.kind) {
      case 'skills':
        for (const name of (uninstall ? (step.removeNames || step.names) : step.names)) {
          const to = path.join(step.to, name);
          if (uninstall) fs.rmSync(to, { recursive: true, force: true }); else copyDir(path.join(tree, 'skills', name), to);
        }
        done.push(`${uninstall ? 'removed' : 'wrote'} ${(uninstall ? (step.removeNames || step.names) : step.names).length} skills under ${short(step.to, home)}`); break;
      case 'agents': {
        const names = uninstall ? (step.removeNames || step.names) : step.names;
        for (const name of names) {
          const to = path.join(step.to, `${name}.${step.format}`);
          if (uninstall) fs.rmSync(to, { force: true }); else { fs.mkdirSync(step.to, { recursive: true }); fs.copyFileSync(path.join(tree, 'agents', `${name}.${step.format}`), to); }
        }
        done.push(`${uninstall ? 'removed' : 'wrote'} ${names.length} worker definitions under ${short(step.to, home)}`); break;
      }
      case 'config': {
        if (uninstall && !fs.existsSync(step.to)) break;
        if (uninstall && step.removeNames?.length === 0) break;
        const existing = fs.existsSync(step.to) ? fs.readFileSync(step.to, 'utf8') : '';
        const block = uninstall ? '' : fs.readFileSync(path.join(tree, 'config.snippet.toml'), 'utf8');
        const updated = selectedConfigBlock(existing, block, uninstall ? (step.removeNames || step.names) : step.names, uninstall);
        if (uninstall && updated.trim() === '') fs.rmSync(step.to, { force: true }); else { fs.mkdirSync(path.dirname(step.to), { recursive: true }); fs.writeFileSync(step.to, updated); }
        done.push(`${uninstall ? 'updated selected workers in' : 'updated the workers block in'} ${short(step.to, home)}`); break;
      }
      case 'publication-hook': {
        for (const name of publicationFiles) {
          const to = path.join(step.to, name);
          if (uninstall) fs.rmSync(to, { force: true });
          else { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(repoRoot, name), to); }
        }
        if (uninstall) {
          for (const dir of ['hooks', 'shared', '']) {
            const target = path.join(step.to, dir);
            if (fs.existsSync(target) && fs.readdirSync(target).length === 0) fs.rmdirSync(target);
          }
        }
        done.push(`${uninstall ? 'removed' : 'installed'} optional OMP Bash publication guard ${short(path.join(step.to, 'hooks', 'omp-publication.mjs'), home)}; ${uninstall ? 'registration was not changed' : 'launch with omp --hook=<installed-path> and SKILLS_PUBLICATION_TASK_DIR=<absolute-task-dir>; only intercepted Bash calls are guarded (not direct shell or Codex)'}`); break;
      }
      case 'retire': {
        const current = currentRetiredItems(step);
        for (const item of step.items) {
          if (!current.includes(item)) { done.push(`kept ${item.label} ${item.path}: ownership or contents changed after planning`); continue; }
          if (item.config) {
            const text = fs.readFileSync(item.path, 'utf8');
            fs.writeFileSync(item.path, selectedConfigBlock(text, '', item.config, true));
          } else fs.rmSync(item.path, { recursive: true, force: true });
          done.push(`removed ${item.label} ${item.path}`);
        }
        break;
      }
      default: throw new Error(`unknown step ${step.kind}`);
    }
  }
  return done;
}
export function buildTrees(planned, work) {
  const built = new Map(); const selected = new Set(planned.names);
  for (const target of new Set(planned.steps.filter(step => step.kind !== 'retire' && step.kind !== 'publication-hook').map(step => step.target))) {
    const dest = path.join(work, target);
    if (target === 'portable') {
      fs.mkdirSync(path.join(dest, 'skills'), { recursive: true });
      const catalog = scanSkills(path.join(repoRoot, 'skills')).skills;
      for (const skill of catalog) if (selected.has(skill.name)) {
        const skillTarget = path.join(dest, 'skills', skill.name);
        fs.cpSync(skill.dir, skillTarget, { recursive: true, filter: noDsStore }); copyTaskArtifactHelper(skillTarget);
        relinkSkillTree({ targetDir: skillTarget, sourceDir: skill.dir, destSkills: path.join(dest, 'skills'), skills: catalog, selected });
      }
    } else buildRuntime(target, dest, { skillNames: planned.names, workerModel: planned.workerModel });
    built.set(target, dest);
  }
  return built;
}
