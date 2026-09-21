import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRuntime, copyTaskArtifactHelper, repoRoot } from './build.mjs';
import { scanSkills } from './layout.mjs';
import { short } from './install-plan.mjs';

const MARK_BEGIN = '# >>> MarkTripoli/skills workers (managed by the installer; edits inside are overwritten)';
const MARK_END = '# <<< MarkTripoli/skills workers';
const noDsStore = src => path.basename(src) !== '.DS_Store';

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
function configBlocks(block) {
  const sections = new Map(); let name = null; let lines = [];
  const commit = () => { if (name) sections.set(name, lines.join('\n').trim()); };
  for (const line of block.trim().split('\n')) {
    const heading = /^\[agents\.([^\]]+)\]$/.exec(line);
    if (heading) { commit(); name = heading[1]; lines = [line]; } else if (name) lines.push(line);
  }
  commit(); return sections;
}
function selectedConfigBlock(text, block, names, uninstall) {
  const begin = text.indexOf(MARK_BEGIN); const end = text.indexOf(MARK_END);
  const managed = begin !== -1 && end > begin ? text.slice(begin + MARK_BEGIN.length, end) : '';
  const merged = configBlocks(managed); const incoming = configBlocks(block);
  for (const name of names) { if (uninstall) merged.delete(name); else if (incoming.has(name)) merged.set(name, incoming.get(name)); }
  return updateConfigBlock(text, [...merged.values()].join('\n\n') || null);
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
      case 'agents':
        for (const name of step.names) {
          const to = path.join(step.to, `${name}.${step.format}`);
          if (uninstall) fs.rmSync(to, { force: true }); else { fs.mkdirSync(step.to, { recursive: true }); fs.copyFileSync(path.join(tree, 'agents', `${name}.${step.format}`), to); }
        }
        done.push(`${uninstall ? 'removed' : 'wrote'} ${step.names.length} worker definitions under ${short(step.to, home)}`); break;
      case 'config': {
        if (uninstall && !fs.existsSync(step.to)) break;
        const existing = fs.existsSync(step.to) ? fs.readFileSync(step.to, 'utf8') : '';
        const block = uninstall ? '' : fs.readFileSync(path.join(tree, 'config.snippet.toml'), 'utf8');
        const updated = step.complete !== false ? updateConfigBlock(existing, uninstall ? null : block) : selectedConfigBlock(existing, block, step.names, uninstall);
        if (uninstall && updated.trim() === '') fs.rmSync(step.to, { force: true }); else { fs.mkdirSync(path.dirname(step.to), { recursive: true }); fs.writeFileSync(step.to, updated); }
        done.push(`${uninstall ? 'updated selected workers in' : 'updated the workers block in'} ${short(step.to, home)}`); break;
      }
      case 'workflow': {
        const entry = path.join(path.dirname(step.to), 'skills-delivery.mjs');
        if (uninstall) { fs.rmSync(entry, { force: true }); fs.rmSync(step.to, { recursive: true, force: true }); }
        else {
          copyDir(path.join(repoRoot, 'atomic'), step.to);
          fs.mkdirSync(path.join(step.to, 'shared'), { recursive: true });
          for (const name of ['task-artifacts.mjs', 'task-root.mjs']) fs.copyFileSync(path.join(repoRoot, 'shared', name), path.join(step.to, 'shared', name));
          const yamlRoot = path.dirname(fileURLToPath(import.meta.resolve('yaml/package.json')));
          copyDir(yamlRoot, path.join(step.to, 'node_modules', 'yaml'));
          fs.writeFileSync(entry, "export { default } from './skills-delivery/workflows/delivery.ts';\n");
        }
        done.push(`${uninstall ? 'removed' : 'wrote'} Atomic delivery workflow and entry under ${short(path.dirname(step.to), home)}`); break;
      }
      default: throw new Error(`unknown step ${step.kind}`);
    }
  }
  return done;
}
export function buildTrees(planned, work) {
  const built = new Map(); const selected = new Set(planned.names);
  for (const target of new Set(planned.steps.filter(step => step.kind !== 'workflow').map(step => step.target))) {
    const dest = path.join(work, target);
    if (target === 'portable') {
      fs.mkdirSync(path.join(dest, 'skills'), { recursive: true });
      for (const skill of scanSkills(path.join(repoRoot, 'skills')).skills) if (selected.has(skill.name)) {
        const skillTarget = path.join(dest, 'skills', skill.name);
        fs.cpSync(skill.dir, skillTarget, { recursive: true, filter: noDsStore }); copyTaskArtifactHelper(skillTarget);
      }
    } else buildRuntime(target, dest, { skillNames: planned.names });
    built.set(target, dest);
  }
  return built;
}
