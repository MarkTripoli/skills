#!/usr/bin/env node
// Checks a filled report_template.md before it is printed: the block order and labels of the template, each finding's level against the rubric's
// severity-by-reach table and its named adjustments, the overall level against the highest finding, each finding's Intent
// cell, and that every `path:line` in the Evidence and Intent columns exists in the merged tree, the merge base or, for untracked task
// artifacts, the working tree.
// Usage: node check-report.mjs <report.md> --tree <merged-tree> --base <merge-base>   (reads only; exit 1 lists each problem)

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const LEVELS = ["Low", "Medium", "High"];
// The rubric's table: severity -> [Narrow, Feature, Wide].
const TABLE = { S4: ["High", "High", "High"], S3: ["Medium", "High", "High"], S2: ["Low", "Medium", "High"], S1: ["Low", "Low", "Medium"] };
const REACH = ["Narrow", "Feature", "Wide"];
const ADJUSTMENTS = { down: ["conditional", "flag", "tested"], up: ["irreversible", "silent"] };
// Intent values that name their source in parentheses; Unexplained names none.
const SOURCED = ["Specified", "Stated", "Contradicts"];

const HEADER = "| # | What users would see | Who | Severity | Reach | Level | Evidence | Intent |";
// The labelled paragraphs after the table, in template order; `Retracted:` is the one optional block.
const LABELS = ["Intent:", "Merge:", "Not verified:", "Retracted:", "Advisories:", "Before merging:"];
const OPTIONAL = ["Retracted:"];
// Lists under these labels may follow a blank line; their items are numbered (Before merging) or bulleted (the others).
const LISTS = ["Retracted:", "Advisories:", "Before merging:"];
const ITEM = /^(\d+\.\s|-\s|\s+\S)/;

const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

// Joins a list that follows its label after a blank line back onto the label's block.
function foldLists(blocks) {
  const labelled = [];
  for (const b of blocks) {
    if (labelled.length && LISTS.some((l) => labelled.at(-1)[0].startsWith(l)) && b.every((l) => ITEM.test(l))) labelled.at(-1).push(...b);
    else labelled.push(b);
  }
  return labelled;
}

// The lines of the block that starts with `label`, or null.
function blockOf(text, label) {
  const blocks = foldLists(text.trim().split(/\n\s*\n/).map((b) => b.split("\n").filter((l) => l.trim())));
  return blocks.find((b) => b[0]?.startsWith(label)) ?? null;
}

// Problems with the report's shape: level line, one summary paragraph, the table, then the labelled blocks in template
// order, ending with Before merging. Blocks are separated by blank lines.
export function structureProblems(text) {
  const problems = [];
  const blocks = text.trim().split(/\n\s*\n/).map((b) => b.split("\n").filter((l) => l.trim()));
  const [levelBlock = [], summary = [], table = [], ...rest] = blocks;
  if (levelBlock.length !== 1 || !/^\*\*Merge risk: /.test(levelBlock[0] ?? "")) problems.push("the first block must be the **Merge risk: ...** line alone, followed by a blank line; nothing goes above it");
  if (!summary.length || /^\|/.test(summary[0]) || LABELS.some((l) => summary[0].startsWith(l))) problems.push("the second block must be the one- or two-sentence summary paragraph");
  if (table.length < 3 || !table.every((l) => l.trim().startsWith("|"))) problems.push("the third block must be the findings table: header, separator and at least one row, with no blank line inside it");
  else {
    if (table[0].replace(/\s+/g, " ").trim() !== HEADER) problems.push(`the table header must be exactly: ${HEADER}`);
    if (!/^\|(\s*:?-+:?\s*\|){8}$/.test(table[1].replace(/\s/g, ""))) problems.push("the table's second line must be the separator row for its 8 columns");
    table.slice(2).forEach((row, i) => {
      if (cells(row)[0] !== String(i + 1)) problems.push(`table row ${i + 1} must be numbered ${i + 1}; rows count up from 1 with no gaps`);
      if (cells(row).length !== 8) problems.push(`table row ${i + 1} has ${cells(row).length} cells, expected 8`);
    });
  }
  const labelled = foldLists(rest);
  const found = labelled.map((b) => LABELS.find((l) => b[0].startsWith(l)) ?? null);
  for (const [i, label] of found.entries()) if (!label) problems.push(`unexpected block after the table: "${labelled[i][0].slice(0, 50)}"; after the table only ${LABELS.join(", ")} are allowed (${OPTIONAL.join(", ")} optional), each once`);
  const order = found.filter(Boolean);
  for (const label of LABELS) {
    const n = order.filter((l) => l === label).length;
    if (n > 1) problems.push(`${label} appears ${n} times; it appears once`);
    if (n === 0 && !OPTIONAL.includes(label)) problems.push(`missing the ${label} block`);
  }
  const ranks = order.map((l) => LABELS.indexOf(l));
  if (ranks.some((r, i) => i && r < ranks[i - 1])) problems.push(`the blocks after the table must follow the template order: ${LABELS.join(" ")}`);
  for (const [i, label] of found.entries()) {
    if (!label) continue;
    const block = labelled[i];
    if (label === "Before merging:" && i !== labelled.length - 1) problems.push("Before merging must be the last block");
    // List blocks are checked against the findings in actionProblems.
    if (!LISTS.includes(label) && !block.join(" ").slice(label.length).trim()) problems.push(`${label} is empty; write "None." when there is nothing to say`);
    if (label === "Intent:" && !(/\bRead:/.test(block.join(" ")) && /\bNot available:/.test(block.join(" ")))) problems.push("Intent: must include Read: and Not available: (write \"Not available: None.\" when every source was read)");
  }
  return problems;
}

// Before merging holds a test or local check for every finding that could seriously break something (level High, or
// severity S4) and nothing else; Advisories holds integration tests for the other findings, or None. `rows` are table cells.
export function actionProblems(text, rows) {
  const problems = [];
  const blocking = new Set(rows.filter(([, , , sev = "", , level = ""]) => /^High\b/.test(level) || /^S4\b/.test(sev)).map(([n]) => n));
  const numbers = new Set(rows.map(([n]) => n));
  const items = (block, marker) => {
    const out = [];
    for (const line of block.slice(1)) {
      if (marker.test(line)) out.push(line);
      else if (/^\s+\S/.test(line) && out.length) out[out.length - 1] += ` ${line.trim()}`;
      else problems.push(`${block[0].split(":")[0]}: "${line.slice(0, 40)}" is not a list item`);
    }
    return out;
  };
  const none = (block) => /^[A-Za-z ]+:\s*None\./.test(block[0]) && block.length === 1;

  const before = blockOf(text, "Before merging:");
  if (before) {
    if (!blocking.size) {
      if (!none(before)) problems.push('no finding is High or S4, so the block reads "Before merging: None." and test ideas go under Advisories');
    } else if (none(before) || before[0].trim() !== "Before merging:") {
      problems.push(`${blocking.size > 1 ? `findings ${[...blocking].join(", ")} are` : `finding ${[...blocking][0]} is`} High or S4: "Before merging:" stands alone, followed by a numbered test or local check for each`);
    } else {
      const covered = new Set();
      items(before, /^\d+\.\s/).forEach((item, k) => {
        if (!item.startsWith(`${k + 1}. `)) problems.push(`Before merging item ${k + 1} must start with "${k + 1}. "`);
        const n = /^\d+\.\s+Finding (\d+)\./.exec(item)?.[1];
        if (!n) return problems.push(`Before merging item ${k + 1} must start with "${k + 1}. Finding <n>." naming the finding it clears`);
        if (!numbers.has(n)) problems.push(`Before merging item ${k + 1} names finding ${n}, which is not in the table`);
        else if (!blocking.has(n)) problems.push(`Before merging item ${k + 1}: finding ${n} is neither High nor S4; move its test to Advisories`);
        covered.add(n);
        if (!/\b(Test|Local check):/.test(item)) problems.push(`Before merging item ${k + 1} needs "Test:" (an integration test to add: where, and what it asserts) or "Local check:" (exact steps a developer runs locally)`);
        const local = item.split("Local check:")[1];
        if (local !== undefined && !/\bexpect/i.test(local)) problems.push(`Before merging item ${k + 1}: a Local check states the expected result ("expect ...")`);
        if (local !== undefined && !/\brun `[^`]+`/i.test(local)) problems.push(`Before merging item ${k + 1}: a Local check names at least one command the developer runs, written as run \`<command>\`; opening the product and looking is manual QA, which happens elsewhere`);
      });
      for (const n of blocking) if (!covered.has(n)) problems.push(`finding ${n} is High or S4 but no Before merging item clears it`);
    }
  }

  const advisories = blockOf(text, "Advisories:");
  if (advisories && !none(advisories)) {
    if (advisories[0].trim() !== "Advisories:") problems.push('Advisories reads "Advisories: None." or stands alone, followed by "- Finding <n>. Test: ..." items');
    const list = items(advisories, /^-\s/);
    if (!list.length) problems.push('Advisories needs at least one "- Finding <n>. Test: ..." item, or reads "Advisories: None."');
    for (const item of list) {
      const n = /^-\s+Finding (\d+)\./.exec(item)?.[1];
      if (!n) problems.push(`advisory "${item.slice(0, 40)}" must start with "- Finding <n>."`);
      else if (!numbers.has(n)) problems.push(`advisory names finding ${n}, which is not in the table`);
      else if (blocking.has(n)) problems.push(`finding ${n} is High or S4: its test belongs under Before merging, not Advisories`);
      if (!/\bTest:/.test(item)) problems.push(`advisory "${item.slice(0, 40)}" must propose an integration test with "Test:"`);
    }
  }
  return problems;
}

// Each withdrawn finding names what cleared it and what was observed. A finding cleared by running a test or local check
// names the source commit it ran on, which must be the commit this report assesses: a run on an older commit clears nothing.
export function retractedProblems(text) {
  const problems = [];
  const block = blockOf(text, "Retracted:");
  if (!block) return problems;
  const shape = '"- <finding>. Cleared by: <check or evidence>. Observed: <result>"';
  if (block[0].trim() !== "Retracted:") problems.push(`"Retracted:" stands alone, followed by one ${shape} item per withdrawn finding`);
  const source = /\(([0-9a-f]{7,40}) onto/.exec(text.split("\n")[0])?.[1];
  const items = [];
  for (const line of block.slice(1)) {
    if (/^-\s/.test(line)) items.push(line);
    else if (/^\s+\S/.test(line) && items.length) items[items.length - 1] += ` ${line.trim()}`;
    else problems.push(`Retracted: "${line.slice(0, 40)}" is not a list item`);
  }
  if (!items.length) problems.push(`Retracted needs at least one ${shape} item; leave the block out when nothing was withdrawn`);
  items.forEach((item, k) => {
    const at = `retracted item ${k + 1}`;
    const cleared = /\bCleared by:\s*(.*?)(?:\bObserved:|$)/.exec(item)?.[1]?.trim();
    if (!cleared) problems.push(`${at} needs "Cleared by:" naming the check or evidence that cleared it`);
    if (!/\bObserved:\s*\S/.test(item)) problems.push(`${at} needs "Observed:" with what the run or evidence showed`);
    if (cleared && /\b(local check|test|run)\b/i.test(cleared)) {
      const shas = [...cleared.matchAll(/`([0-9a-f]{7,40})`/g)].map((m) => m[1]);
      if (!shas.length) problems.push(`${at} was cleared by a run; name the source commit it ran on as \`<sha>\``);
      else if (source && !shas.some((sha) => sha.startsWith(source) || source.startsWith(sha))) problems.push(`${at} ran on ${shas.join(", ")}, not the assessed source ${source}; a run on another commit clears nothing, so restore the finding or rerun the check`);
    }
  });
  return problems;
}

// Returns the report's problems as strings; `lineCount(file)` gives a file's line count in the merged tree or base, or null.
export function checkReport(text, lineCount = () => null) {
  const problems = [...structureProblems(text)];
  const first = text.split("\n").find((l) => l.trim()) ?? "";
  const overall = /^\*\*Merge risk: (High|Medium|Low)\*\*/.exec(first)?.[1];
  if (!overall) problems.push(`the first line must start with **Merge risk: High**, **Merge risk: Medium** or **Merge risk: Low**; found: ${first.slice(0, 60)}`);

  const rows = text.split("\n").filter((l) => /^\|\s*\d+\s*\|/.test(l)).map(cells);
  if (!rows.length) problems.push("no finding rows: the table needs at least one row starting with | 1 |");
  let highest = -1;
  let previous = 3;
  for (const [n, , , severity, reach, levelCell = "", evidence = "", intent = ""] of rows) {
    const at = `finding ${n}`;
    const s = /^S[1-4]\b/.exec(severity)?.[0];
    const r = REACH.indexOf(reach.split(/\s/)[0]);
    if (!s) problems.push(`${at}: Severity "${severity}" must start with S1, S2, S3 or S4`);
    if (r === -1) problems.push(`${at}: Reach "${reach}" must be Narrow, Feature or Wide`);
    const level = /^(High|Medium|Low)\b/.exec(levelCell)?.[1];
    if (!level) problems.push(`${at}: Level "${levelCell}" must start with High, Medium or Low`);
    const named = [...levelCell.matchAll(/\b(up|down):\s*([a-z]+)/g)].map((m) => [m[1], m[2]]);
    for (const [dir, key] of named) if (!ADJUSTMENTS[dir].includes(key)) problems.push(`${at}: unknown adjustment "${dir}: ${key}"; use ${Object.entries(ADJUSTMENTS).flatMap(([d, ks]) => ks.map((k) => `${d}: ${k}`)).join(", ")}`);
    const keys = named.map(([d, k]) => `${d}:${k}`);
    if (new Set(keys).size !== keys.length) problems.push(`${at}: an adjustment is named twice; each applies at most once`);
    if (s && r !== -1 && level) {
      const base = LEVELS.indexOf(TABLE[s][r]);
      const ups = named.filter(([d]) => d === "up").length;
      const downs = named.filter(([d]) => d === "down").length;
      let expected = Math.max(0, Math.min(2, base + ups - downs));
      if (s === "S4") expected = keys.includes("down:flag") ? Math.max(expected, 1) : 2;
      if (s === "S4" && keys.includes("down:conditional")) problems.push(`${at}: "down: conditional" does not apply to S4`);
      if (LEVELS.indexOf(level) !== expected) problems.push(`${at}: ${s} with ${REACH[r]} reach is ${TABLE[s][r]} in the table; with ${keys.length ? keys.join(", ") : "no adjustments"} it is ${LEVELS[expected]}, not ${level}`);
      highest = Math.max(highest, LEVELS.indexOf(level));
      if (LEVELS.indexOf(level) > previous) problems.push(`${at}: rows go from highest level down; ${level} follows ${LEVELS[previous]}`);
      previous = LEVELS.indexOf(level);
    }
    const kind = /^(Specified|Stated|Contradicts|Unexplained)\b/.exec(intent)?.[1];
    if (!kind) problems.push(`${at}: Intent "${intent}" must start with Specified, Stated, Contradicts or Unexplained`);
    else if (SOURCED.includes(kind) && !/\(\s*\S[^)]*\)/.test(intent)) problems.push(`${at}: Intent ${kind} must name its source in parentheses, e.g. ${kind} (PROJ-123)`);
    const pathLine = /`?([\w./@-]+\.[\w]+):(\d+)(?:-(\d+))?`?/g;
    const cited = [...evidence.matchAll(pathLine)];
    if (!cited.length) problems.push(`${at}: Evidence cites no path:line`);
    for (const [, file, from, to] of [...cited, ...intent.matchAll(pathLine)]) {
      const count = lineCount(file);
      if (count === null) problems.push(`${at}: ${file} is in neither the merged tree, the merge base nor the working tree`);
      else if (Number(to ?? from) > count) problems.push(`${at}: ${file}:${to ?? from} is past the end of the file (${count} lines)`);
    }
  }
  problems.push(...actionProblems(text, rows), ...retractedProblems(text));
  if (overall && highest !== -1 && LEVELS.indexOf(overall) !== highest) problems.push(`the overall level is ${overall} but the highest finding is ${LEVELS[highest]}; they must match`);
  return problems;
}

const count = (text) => text.split("\n").length - (text.endsWith("\n") ? 1 : 0);

// Line count of `file` in the first tree-ish that holds it, else on disk under `cwd` (task artifacts are untracked), or null.
export function lineCounter(cwd, treeishes) {
  return (file) => {
    for (const t of treeishes) {
      // One cited file; 64 MiB is above any source file worth citing and keeps a stray binary from exhausting memory.
      const out = spawnSync("git", ["show", `${t}:${file}`], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      if (out.status === 0) return count(out.stdout);
    }
    // Working content cannot substantiate a citation to tracked source absent from the pinned trees.
    const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", `:(literal)${file}`], { cwd, encoding: "utf8" });
    if (tracked.status !== 1) return null;
    const local = path.resolve(cwd, file);
    if (!fs.existsSync(local) || !fs.statSync(local).isFile()) return null;
    const relative = path.relative(fs.realpathSync(cwd), fs.realpathSync(local));
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
    return count(fs.readFileSync(local, "utf8"));
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const file = args.find((a, i) => !a.startsWith("--") && !["--tree", "--base"].includes(args[i - 1]));
  const tree = flag("--tree");
  const base = flag("--base");
  if (!file || !tree || !base || !fs.existsSync(file)) {
    console.error(`check-report: ${!file || !fs.existsSync(file ?? "") ? `report "${file ?? ""}" not found` : "--tree and --base are required; take both from scope.mjs"}\nUsage: node check-report.mjs <report.md> --tree <merged-tree> --base <merge-base>`);
    process.exitCode = 1;
  } else {
    const problems = checkReport(fs.readFileSync(file, "utf8"), lineCounter(process.cwd(), [tree, base]));
    if (problems.length) {
      for (const p of problems) console.error(`check-report: ${p}`);
      process.exitCode = 1;
    } else console.log("ok");
  }
}
