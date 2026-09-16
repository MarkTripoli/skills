// Skill layout of this repository. A skill is a directory holding SKILL.md, either directly under
// skills/ (a standalone skill) or one level deeper under a group directory (skills/<group>/<name>/)
// that holds nothing but skills. Installs flatten to <install dir>/<name>/, so names are unique.
// Repository tooling only; nothing installed needs this.

import fs from "node:fs";
import path from "node:path";

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Returns { skills: [{ name, dir, group }], problems: [{ path, message }] } for a skills/ directory.
export function scanSkills(skillsRoot) {
  const skills = [];
  const problems = [];
  const seen = new Map();
  const add = (name, dir, group) => {
    if (seen.has(name)) problems.push({ path: dir, message: `skill name "${name}" also used by ${seen.get(name)}; installs flatten, so names must be unique` });
    else seen.set(name, dir);
    skills.push({ name, dir, group });
  };
  if (!fs.existsSync(skillsRoot)) return { skills, problems: [{ path: skillsRoot, message: "missing skills/ directory" }] };
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    const dir = path.join(skillsRoot, entry.name);
    if (!entry.isDirectory()) {
      if (entry.name !== ".DS_Store") problems.push({ path: dir, message: "skills/ holds only skill or group directories" });
      continue;
    }
    if (fs.existsSync(path.join(dir, "SKILL.md"))) {
      add(entry.name, dir, null);
      continue;
    }
    if (!NAME.test(entry.name)) problems.push({ path: dir, message: "group name must be kebab-case" });
    let members = 0;
    for (const inner of fs.readdirSync(dir, { withFileTypes: true })) {
      const innerDir = path.join(dir, inner.name);
      if (!inner.isDirectory()) {
        if (inner.name !== ".DS_Store") problems.push({ path: innerDir, message: `group ${entry.name}/ holds only skill directories` });
        continue;
      }
      if (!fs.existsSync(path.join(innerDir, "SKILL.md"))) {
        problems.push({ path: innerDir, message: "missing SKILL.md (groups nest one level only)" });
        continue;
      }
      members += 1;
      add(inner.name, innerDir, entry.name);
    }
    if (members === 0) problems.push({ path: dir, message: `group ${entry.name}/ holds no skills` });
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return { skills, problems };
}

// Directory of the named skill under skillsRoot, or null.
export function findSkillDir(skillsRoot, name) {
  const direct = path.join(skillsRoot, name);
  if (fs.existsSync(path.join(direct, "SKILL.md"))) return direct;
  if (!fs.existsSync(skillsRoot)) return null;
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const nested = path.join(skillsRoot, entry.name, name);
    if (fs.existsSync(path.join(nested, "SKILL.md"))) return nested;
  }
  return null;
}

// Like findSkillDir but throws with the skills root named.
export function skillDir(skillsRoot, name) {
  const dir = findSkillDir(skillsRoot, name);
  if (!dir) throw new Error(`no skill "${name}" under ${skillsRoot}`);
  return dir;
}
