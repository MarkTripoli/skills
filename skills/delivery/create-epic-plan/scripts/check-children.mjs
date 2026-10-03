#!/usr/bin/env node
// Usage: node check-children.mjs <epic-plan.md>
// Checks the `## Children` JSON fence of an epic plan. Prints one `child: rule` line per violation; exit 1 on any.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const WORKFLOWS = ["full", "lean", "prd", "oneshot", "bugfix"];
const SLICES = ["vertical", "enabler"];
const VAGUE = ["and also", "as well as", "fast", "secure", "user-friendly", "works correctly"];
const EARS = [
  /^The .+ shall .+\.$/,
  /^(?:WHEN|WHILE|WHERE) .+, the .+ shall .+\.$/,
  /^IF .+, THEN the .+ shall .+\.$/,
];

function isMain() {
  try { return process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]); } catch { return false; }
}

export function parseChildren(text) {
  const section = text.split(/^## Children\s*$/m)[1]?.split(/^## /m)[0];
  if (section === undefined) throw new Error("no `## Children` section");
  const fence = /^```json[^\n]*\n([\s\S]*?)^```/m.exec(section);
  if (!fence) throw new Error("no json fence under `## Children`");
  const children = JSON.parse(fence[1]);
  if (!Array.isArray(children)) throw new Error("`## Children` fence is not a JSON array");
  return children;
}

export function checkChildren(children) {
  const out = [];
  const bad = (child, rule) => out.push(`${child}: ${rule}`);
  const names = new Set(children.map((c) => c?.name));
  if (children.length === 0) bad("plan", "no children");
  children.forEach((c, i) => {
    const id = typeof c?.name === "string" && c.name ? c.name : `#${i + 1}`;
    if (typeof c?.name !== "string" || c.name.length < 1 || c.name.length > 120) bad(id, "name must be 1 to 120 characters");
    if (children.findIndex((o) => o?.name === c?.name) !== i) bad(id, "name repeats a sibling");
    if (!WORKFLOWS.includes(c?.workflow)) bad(id, `workflow must be one of ${WORKFLOWS.join(", ")}`);
    if (!SLICES.includes(c?.slice)) bad(id, "slice must be vertical or enabler");
    if (typeof c?.prompt !== "string" || c.prompt.length < 1 || c.prompt.length > 10000) bad(id, "prompt must be 1 to 10000 characters");
    const acc = c?.acceptance;
    if (!Array.isArray(acc) || acc.length < 1 || acc.length > 5) bad(id, "acceptance must hold 1 to 5 sentences");
    else {
      for (const a of acc) {
        if (typeof a !== "string" || !EARS.some((re) => re.test(a))) bad(id, `acceptance is not an EARS sentence: ${a}`);
        else if ((a.match(/\bshall\b/g) ?? []).length > 1) bad(id, `acceptance holds more than one obligation: ${a}`);
        for (const word of VAGUE) if (typeof a === "string" && new RegExp(`\\b${word}\\b`).test(a)) bad(id, `acceptance uses "${word}": ${a}`);
      }
    }
    const deps = c?.depends_on;
    if (!Array.isArray(deps)) bad(id, "depends_on must be an array");
    else for (const d of deps) if (!names.has(d) || d === c.name) bad(id, `depends_on names no sibling: ${d}`);
    if (c?.slice === "enabler" && !children.some((o) => Array.isArray(o?.depends_on) && o.depends_on.includes(c.name))) bad(id, "enabler has no consuming sibling");
  });
  const deps = new Map(children.map((c) => [c?.name, Array.isArray(c?.depends_on) ? c.depends_on.filter((d) => names.has(d)) : []]));
  const state = new Map();
  const visit = (n, trail) => {
    if (state.get(n) === 2) return;
    if (state.get(n) === 1) return bad(n, `depends_on cycle: ${[...trail, n].join(" -> ")}`);
    state.set(n, 1);
    for (const d of deps.get(n)) visit(d, [...trail, n]);
    state.set(n, 2);
  };
  for (const n of deps.keys()) visit(n, []);
  return out;
}

if (isMain()) {
  if (!process.argv[2]) {
    console.error("usage: node check-children.mjs <epic-plan.md>");
    process.exit(2);
  }
  let violations;
  try {
    violations = checkChildren(parseChildren(fs.readFileSync(process.argv[2], "utf8")));
  } catch (error) {
    violations = [`plan: ${error.message}`];
  }
  for (const v of violations) console.log(v);
  process.exit(violations.length ? 1 : 0);
}
