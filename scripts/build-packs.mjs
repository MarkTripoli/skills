#!/usr/bin/env node
// Generates the Oh My Pi flavor of the delivery packs. The native packs under .archon/workflows/delivery/
// run each AI phase as an Archon `prompt:` node (Claude Code, Codex, Pi, ...). Archon has no Oh My Pi
// provider, so the OMP flavor under .archon/workflows/delivery-omp/ is the same DAG with every prompt node
// rewritten as a `bash:` node that runs `omp -p` with the same prompt. A prompt node's `model:` tier
// becomes `--model="$OMP_MODEL_<TIER>"` when that variable is set and `effort:` becomes `--thinking`.
// Deterministic nodes, gates, loops, includes, and inputs are unchanged. Node built-ins only; the source
// YAML follows the authoring conventions in workflows/delivery.md (Pack source), which is what makes a
// line-level rewrite safe.
//
//   node scripts/build-packs.mjs            # write .archon/workflows/delivery-omp/
//   node scripts/build-packs.mjs --check    # exit 1 when the generated flavor is stale

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const NATIVE_DIR = path.join(repoRoot, ".archon", "workflows", "delivery");
export const OMP_DIR = path.join(repoRoot, ".archon", "workflows", "delivery-omp");
export const OMP_SUFFIX = "-omp";
// stdin comes from /dev/null: `omp -p` waits for more prompt text while stdin is an open pipe, and
// Archon hands bash nodes exactly that.
export const OMP_COMMAND = "omp -p --auto-approve --no-session --max-time=45m";
export const OMP_STDIN = "</dev/null";
export const NODE_TIMEOUT_MS = 46 * 60 * 1000;

const HEREDOC = "DELIVERY_PROMPT";

// `$node.output`, `$node.output.field`, `$LOOP_PREV.node.output[.field]`: runtime refs Archon shell-quotes
// in bash nodes, so each is hoisted into an unquoted assignment. `$INPUTS.name` is read from the
// `INPUTS_<UPPER_SNAKE>` environment variable Archon sets for bash nodes (the load-time macro is not
// substituted into bash bodies for literal-bound inputs; verified against Archon 0.10.1).
const RUNTIME_REF = /\$(?:LOOP_PREV\.)?[a-z][a-z0-9-]*\.output(?:\.[a-z_][a-z0-9_]*)?/g;
const INPUT_REF = /\$INPUTS\.([a-z_][a-z0-9_]*)/g;

export function listNative() {
  return fs
    .readdirSync(NATIVE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => fs.readdirSync(path.join(NATIVE_DIR, d.name)).filter((f) => f.endsWith(".yaml")).map((f) => ({ dir: d.name, file: f })))
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

// The bash body that replaces a prompt: hoisted refs, the prompt read from an unquoted heredoc (backticks
// and backslashes escaped; `$` kept only for hoisted variables and the engine's environment variables),
// one omp invocation. The heredoc feeds a brace group, not `$(cat <<EOF ...)`: bash 3.2 scans the body of
// a heredoc nested in `$(...)` for quotes, so a prompt with an unpaired apostrophe fails to parse there.
// A prompt node's `output_format` is appended to the prompt the way Archon appends it for AI nodes:
// Archon ignores the field on bash nodes, so the schema has to travel in the text and the node's stdout
// is what the next `$node.output.field` reads. A model still tends to wrap the object in a code fence or
// answer in prose (observed with `omp -p`), so the answer goes through the typed-judgment helper's
// `extract-json`: a contained object is printed compact, prose is recovered into the schema's enum and
// artifact fields when the TypeSafe key is set, and anything else is printed as is so a non-answer fails
// the next node with the raw text in the error. Without the helper (skills installed without it, or no
// `node`), or when it exits nonzero, the awk filter does the fence-and-brace part of that job: fence
// lines dropped, then the first line opening with `{` through the last line closing with `}`.
const JSON_FILTER = [
  "printf '%s\\n' \"$answer\" | awk '",
  "  /^[[:space:]]*```/ { next }",
  "  { n++; line[n] = $0 }",
  "  !start && /^[[:space:]]*\\{/ { start = n }",
  "  /\\}[[:space:]]*$/ { end = n }",
  "  END { if (!start || end < start) { start = 1; end = n }; for (i = start; i <= end; i++) print line[i] }",
  "'",
];
// The pack source writes schemas flat: one `field: { type: string, enum: [a, b] }` line per enum field
// and one `required: [a, b]` list. The generator reads them with these shapes and refuses anything else,
// since an enum it cannot read would silently lose its recovery.
const SCHEMA_ENUM = /^\s*([a-z_][a-z0-9_]*): \{ type: string, enum: \[([^\]]*)\] \}\s*$/;
const SCHEMA_REQUIRED = /^(\s*)required: \[([^\]]*)\]\s*$/;
const csv = (list) => list.split(",").map((s) => s.trim()).filter(Boolean);
export function schemaArgs(schemaLines) {
  let required = null;
  const enums = [];
  for (const line of schemaLines) {
    const req = SCHEMA_REQUIRED.exec(line);
    if (req) {
      if (required === null || req[1].length < required.indent) required = { indent: req[1].length, fields: csv(req[2]) };
      continue;
    }
    if (!/\benum\b/.test(line)) continue;
    const field = SCHEMA_ENUM.exec(line);
    if (!field) throw new Error(`cannot read the enum in schema line "${line.trim()}"; write it as \`field: { type: string, enum: [a, b] }\` on one line`);
    enums.push(`${field[1]}=${csv(field[2]).join(",")}`);
  }
  const args = [];
  if (required?.fields.length) args.push(`--required '${required.fields.join(",")}'`);
  if (enums.length) args.push(`--enum '${enums.join(";")}'`);
  return args;
}

// Per-node AI fields the OMP flavor carries as omp flags. `effort` is `--thinking`; `ultra` is Archon's
// rung above `max`, the top omp has. `model` is a tier word, and the flavor has no tier table of its
// own: the tier is read from OMP_MODEL_<TIER> at run time and adds no flag while the variable is unset,
// so omp's own default model applies exactly as before.
export const MODEL_TIERS = ["small", "medium", "large"];
function ompFlags({ model, effort } = {}) {
  const setup = [];
  const flags = [];
  if (effort) flags.push(`--thinking=${effort === "ultra" ? "max" : effort}`);
  if (model) {
    if (!MODEL_TIERS.includes(model)) throw new Error(`model must be a tier word (${MODEL_TIERS.join(", ")}), not "${model}"; the OMP flavor binds tiers through OMP_MODEL_<TIER>`);
    const variable = `OMP_MODEL_${model.toUpperCase()}`;
    setup.push('model=""', `if [ -n "\${${variable}:-}" ]; then model="--model=$${variable}"; fi`);
    flags.push('${model:+"$model"}');
  }
  return { setup, flags };
}

export function bashForPrompt(promptLines, schemaLines = [], fields = {}) {
  const marker = promptLines.find((l) => l.trim() === HEREDOC);
  if (marker !== undefined) throw new Error(`a prompt line reads "${HEREDOC}", which would close the heredoc early`);
  if (schemaLines.length) {
    promptLines = [...promptLines, "", "CRITICAL: Respond with ONLY a JSON object matching this schema (JSON Schema, written as YAML). No prose before or after it.", ...schemaLines];
  }
  const text = promptLines.join("\n");
  const vars = new Map();
  const nameFor = (ref) => {
    if (!vars.has(ref)) vars.set(ref, `v${vars.size + 1}`);
    return vars.get(ref);
  };
  let body = text
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(RUNTIME_REF, (ref) => `\u0000${nameFor(ref)}\u0000`)
    .replace(INPUT_REF, (_, name) => `\u0000INPUTS_${name.toUpperCase()}\u0000`)
    // Any other dollar is literal text, except the engine's environment variables for user text, which
    // default to empty so `set -u` tolerates a run without a message.
    .replace(/\$(LOOP_USER_INPUT|ARGUMENTS|USER_MESSAGE)\b/g, "\u0000$1:-\u0000")
    .replace(/\$/g, "\\$")
    .replace(/\u0000([A-Za-z_0-9:-]+)\u0000/g, "$${$1}");
  const assignments = [...vars.entries()].map(([ref, name]) => `${name}=${ref}`);
  const { setup, flags } = ompFlags(fields);
  const command = [OMP_COMMAND, ...flags, '"$prompt"', OMP_STDIN].join(" ");
  let run;
  if (schemaLines.length) {
    // The helper lives beside the skills the prompt reads; the prompt's own reference says where they are.
    const dirRef = (name) => (text.includes(`$INPUTS.${name}`) ? `\${INPUTS_${name.toUpperCase()}}` : vars.has(`$task.output.${name}`) ? `\${${vars.get(`$task.output.${name}`)}}` : null);
    const skillsDir = dirRef("skills_dir") ?? "${INPUTS_SKILLS_DIR:-$HOME/.agents/skills}";
    const taskDir = dirRef("task_dir");
    const extract = ["extract-json", ...schemaArgs(schemaLines), ...(taskDir ? [`--dir "${taskDir}"`] : [])].join(" ");
    run = [
      `answer=$(${command})`,
      `judge="${skillsDir}/typed-judgment/judge.mjs"`,
      'object=""',
      'if [ -f "$judge" ] && command -v node >/dev/null 2>&1; then',
      `  object=$(printf '%s\\n' "$answer" | node "$judge" ${extract}) || object=""`,
      "fi",
      'if [ -n "$object" ]; then',
      "  printf '%s\\n' \"$object\"",
      "else",
      ...JSON_FILTER.map((l) => `  ${l}`),
      "fi",
    ];
  } else {
    run = [command];
  }
  return ["set -eu", ...assignments, ...setup, `{ prompt=$(cat); } <<${HEREDOC}`, ...body.split("\n"), HEREDOC, ...run];
}

function indentOf(line) {
  return line.length - line.trimStart().length;
}

// The node that owns the key line `i` (a `- id:` two columns left of the key, up to the next sibling or
// a dedent): its line range and the `model:`/`effort:` fields at the key indent.
function promptNode(lines, i, keyIndent) {
  const sibling = new RegExp(`^${" ".repeat(Math.max(keyIndent - 2, 0))}- id: `);
  const start = lines.slice(0, i).findLastIndex((l) => sibling.test(l));
  let end = i + 1;
  while (end < lines.length && !sibling.test(lines[end]) && (lines[end].trim() === "" || indentOf(lines[end]) >= keyIndent)) end++;
  const fields = {};
  const fieldLines = [];
  for (let k = start; k < end; k++) {
    const field = new RegExp(`^${" ".repeat(keyIndent)}(model|effort): (\\S+)$`).exec(lines[k]);
    if (!field) continue;
    fields[field[1]] = field[2];
    fieldLines.push(k);
  }
  return { start, end, fields, fieldLines };
}

// Rewrites one native workflow file into its OMP flavor.
export function convert(source) {
  const lines = source.split("\n");
  // `model:` and `effort:` are AI-node fields; on a prompt node they become omp flags, so their lines
  // are dropped wherever they sit in the node (a pre-pass, since they usually precede the prompt).
  const nodes = new Map();
  const drop = new Set();
  lines.forEach((line, i) => {
    const prompt = /^(\s*)prompt: \|$/.exec(line);
    if (!prompt) return;
    const node = promptNode(lines, i, prompt[1].length);
    nodes.set(i, node);
    for (const k of node.fieldLines) drop.add(k);
  });
  const out = [];
  let inDescription = false;
  let descriptionIndent = 0;
  let pendingBlanks = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = indentOf(line);
    const trimmed = line.trim();

    if (inDescription) {
      if (trimmed === "") {
        pendingBlanks++;
        continue;
      }
      if (indent >= descriptionIndent) {
        for (; pendingBlanks > 0; pendingBlanks--) out.push("");
        out.push(line);
        continue;
      }
      // The block ends here: the flavor note joins it as its last line, before the blank lines that followed.
      out.push(`${" ".repeat(descriptionIndent)}Oh My Pi flavor: every AI phase runs in \`omp -p\`; deterministic nodes, gates, and loops are unchanged.`);
      for (; pendingBlanks > 0; pendingBlanks--) out.push("");
      inDescription = false;
    }

    const name = /^name: (delivery-[a-z0-9-]+)$/.exec(line);
    if (name) {
      out.push(`name: ${name[1]}${OMP_SUFFIX}`);
      continue;
    }
    const include = /^(\s*)include: (delivery-[a-z0-9-]+)$/.exec(line);
    if (include) {
      out.push(`${include[1]}include: ${include[2]}${OMP_SUFFIX}`);
      continue;
    }
    if (/^description: \|$/.test(line)) {
      inDescription = true;
      descriptionIndent = 2;
      out.push(line);
      continue;
    }
    if (drop.has(i)) continue;
    const prompt = /^(\s*)prompt: \|$/.exec(line);
    if (prompt) {
      const keyIndent = prompt[1].length;
      const bodyIndent = keyIndent + 2;
      const node = nodes.get(i);
      const promptLines = [];
      let j = i + 1;
      while (j < lines.length && (lines[j].trim() === "" || indentOf(lines[j]) >= bodyIndent)) {
        promptLines.push(lines[j].trim() === "" ? "" : lines[j].slice(bodyIndent));
        j++;
      }
      while (promptLines.length && promptLines.at(-1) === "") promptLines.pop();
      // An `output_format:` block right after the prompt moves into the prompt text. Anywhere else in the
      // node it would be dropped silently, so that is an error.
      const schemaLines = [];
      if (j < lines.length && lines[j] === `${prompt[1]}output_format:`) {
        let k = j + 1;
        while (k < lines.length && lines[k].trim() !== "" && indentOf(lines[k]) > keyIndent) {
          schemaLines.push(lines[k].slice(bodyIndent));
          k++;
        }
        j = k;
      } else if (lines.slice(node.start, node.end).some((l) => l === `${prompt[1]}output_format:`)) {
        throw new Error(`${lines[node.start].trim()}: output_format must directly follow the prompt block so the generator can move it into the prompt`);
      }
      out.push(`${prompt[1]}bash: |`);
      let bash;
      try {
        bash = bashForPrompt(promptLines, schemaLines, node.fields);
      } catch (error) {
        throw new Error(`${lines[node.start].trim()}: ${error.message}`);
      }
      for (const b of bash) out.push(b === "" ? "" : `${" ".repeat(bodyIndent)}${b}`);
      // Archon kills a bash node after 120 s by default; an agent session runs far longer. The node's
      // timeout sits above omp's own --max-time so omp ends the session and reports before Archon does.
      out.push(`${prompt[1]}timeout: ${NODE_TIMEOUT_MS}`);
      // Trailing blank lines the prompt block consumed belong to the file layout; keep one.
      if (j < lines.length && lines[j - 1].trim() === "") out.push("");
      i = j - 1;
      continue;
    }
    // `context: fresh` is an AI-node field; a bash node has no session. Every prompt node in the source
    // carries it, so it is dropped wherever it appears at a node key indent.
    if (/^\s*context: fresh$/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n");
}

// One generated file: the flavor YAML or a fixture copy. Fixtures address nodes by id, and the ids are
// the same in both flavors, so `archon workflow test delivery-omp` runs the native fixtures verbatim.
function generated(target, content, results, write) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
  results.push({ target, stale: current !== content });
  if (write && current !== content) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

export function build({ write = true } = {}) {
  const results = [];
  for (const { dir, file } of listNative()) {
    const source = fs.readFileSync(path.join(NATIVE_DIR, dir, file), "utf8");
    generated(path.join(OMP_DIR, dir, file.replace(/\.yaml$/, `${OMP_SUFFIX}.yaml`)), convert(source), results, write);
    const fixtures = path.join(NATIVE_DIR, dir, "fixtures");
    if (fs.existsSync(fixtures)) {
      for (const f of fs.readdirSync(fixtures).filter((f) => f.endsWith(".stubs.yaml")).sort()) {
        generated(path.join(OMP_DIR, dir, "fixtures", f), fs.readFileSync(path.join(fixtures, f), "utf8"), results, write);
      }
    }
  }
  // Remove OMP files whose native source is gone.
  if (fs.existsSync(OMP_DIR)) {
    const expected = new Set(results.map((r) => r.target));
    const sweep = (dir, depth) => {
      for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, d.name);
        if (d.isDirectory() && depth < 2) {
          sweep(p, depth + 1);
          if (write && fs.readdirSync(p).length === 0) fs.rmdirSync(p);
        } else if (!expected.has(p)) {
          results.push({ target: p, stale: true, orphan: true });
          if (write) fs.rmSync(p, { recursive: true });
        }
      }
    };
    sweep(OMP_DIR, 0);
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const results = build({ write: !check });
  const stale = results.filter((r) => r.stale);
  if (check) {
    for (const r of stale) console.error(`${path.relative(repoRoot, r.target)}: ${r.orphan ? "no native source" : "stale; run node scripts/build-packs.mjs"}`);
    process.exit(stale.length ? 1 : 0);
  }
  for (const r of results) if (r.stale) console.log(`${r.orphan ? "removed" : "wrote"} ${path.relative(repoRoot, r.target)}`);
}
