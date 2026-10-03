#!/usr/bin/env node
// Creates skills/<name>/ (or skills/delivery/<name>/ with --delivery) in the current collection checkout:
// SKILL.md with placeholder frontmatter, the shared line-6 sentence and a title, plus an empty references/.
// Usage: node scripts/scaffold.mjs <name> [--delivery]   (run from the collection root)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LINE6 =
  "Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.";

// The XML-looking placeholder fails the description rule of check-skill-practices.mjs until it is replaced.
const DESCRIPTION = "<Third-person verb phrase for what it does and produces>. Use when <the /{name} command, phrases a user would say>; not for <nearest sibling>.";

const NEXT_STEPS = (name, delivery) => `Created ${delivery ? `skills/delivery/${name}` : `skills/${name}`}/SKILL.md. Remaining:
1. Replace the description placeholder and write the body (references/rules.md in the author-skill skill).
2. Write evals/scenarios/${name}.mjs, or add an EVAL_EXEMPT entry with a reason in scripts/check-skill-practices.mjs.
3. Raise EXPECTED_SKILL_COUNT in scripts/validate.mjs.
4. Add the skill to SKILL_DEPENDENCIES in scripts/install.mjs if it reads a sibling skill.
5. Add its answer templates to the inventories in scripts/validate.mjs if it has any.
6. Add it to docs/cheatsheet.md if users invoke it${delivery && !name.startsWith("agent-") ? "; add it to the phase table in workflows/delivery.md (not needed for a skill in WORKFLOW_OPTIONAL_SKILLS)" : ""}.
7. Add a .changeset/ entry, then run node scripts/sync-plugin.mjs and node scripts/check-skill-practices.mjs.`;

// Returns the created SKILL.md path; throws with the reason when the name or target is not usable.
export function scaffold(root, name, { delivery = false } = {}) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name ?? "") || name.length > 64) throw new Error(`name "${name}" must be kebab-case (lowercase letters, digits, hyphens), at most 64 characters`);
  if (/anthropic|claude/.test(name)) throw new Error(`name "${name}" must not contain the reserved words anthropic or claude`);
  const skills = path.join(root, "skills");
  if (!fs.existsSync(skills)) throw new Error(`no skills/ directory under ${root}; run from the collection root`);
  // Installs flatten, so a name is unique across groups.
  for (const entry of fs.readdirSync(skills, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    for (const candidate of [path.join(skills, entry.name), ...fs.readdirSync(path.join(skills, entry.name), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(skills, entry.name, e.name))]) {
      if (path.basename(candidate) === name && fs.existsSync(path.join(candidate, "SKILL.md"))) throw new Error(`skill "${name}" already exists at ${path.relative(root, candidate)}`);
    }
  }
  const dir = delivery ? path.join(skills, "delivery", name) : path.join(skills, name);
  if (fs.existsSync(dir)) throw new Error(`${path.relative(root, dir)} already exists`);
  fs.mkdirSync(path.join(dir, "references"), { recursive: true });
  const title = name.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  const file = path.join(dir, "SKILL.md");
  fs.writeFileSync(file, `---\nname: ${name}\ndescription: ${DESCRIPTION.replace("{name}", name)}\n---\n\n${LINE6}\n\n# ${title}\n`);
  return file;
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const delivery = args.includes("--delivery");
  try {
    scaffold(process.cwd(), args.find((a) => !a.startsWith("--")), { delivery });
    console.log(NEXT_STEPS(args.find((a) => !a.startsWith("--")), delivery));
  } catch (error) {
    console.error(`scaffold: ${error.message}\nUsage: node scripts/scaffold.mjs <name> [--delivery]`);
    process.exitCode = 1;
  }
}
