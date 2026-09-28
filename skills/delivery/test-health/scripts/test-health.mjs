#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const schemaVersion = 1;

export function parseLcov(text, root = process.cwd()) {
  const files = new Map();
  const invalid = [];
  let file;
  let recordOpen = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      if (recordOpen) invalid.push({ source: file, reason: "missing end_of_record terminator" });
      recordOpen = true;
      const source = line.slice(3).replaceAll("\\", "/");
      const absolute = path.resolve(root, source);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) {
        invalid.push({ source, reason: "source path is outside repository" });
        file = null;
      } else {
        file = relative;
        if (files.has(relative)) invalid.push({ source: relative, reason: "duplicate source record" });
        else files.set(file, { lines: new Map(), branches: new Map(), summaries: {} });
      }
    } else if (/^(?:DA|BRDA|FN|FNDA|FNF|FNH|BRF|BRH|LH|LF|FNLN):/.test(line) && !recordOpen) {
      invalid.push({ source: null, reason: "record-only directive outside source record" });
    } else if (line.startsWith("DA:")) {
      if (!file) continue;
      const values = line.slice(3).split(",");
      const [lineRaw, hitsRaw, checksum] = values;
      const lineNo = Number(lineRaw), hits = Number(hitsRaw);
      if ((values.length !== 2 && values.length !== 3) || !/^\d+$/.test(lineRaw) || !/^\d+$/.test(hitsRaw) || (values.length === 3 && !checksum) || !Number.isSafeInteger(lineNo) || lineNo < 1 || !Number.isSafeInteger(hits)) {
        invalid.push({ source: file, reason: "malformed DA counter" });
      } else if (files.get(file).lines.has(lineNo)) {
        invalid.push({ source: file, reason: "duplicate DA counter" });
      } else files.get(file).lines.set(lineNo, hits);
    } else if (line.startsWith("BRDA:")) {
      if (!file) continue;
      const values = line.slice(5).split(",");
      const [lineRaw, blockRaw, branchRaw, takenRaw] = values;
      const decimal = (value) => /^\d+$/.test(value);
      const lineNo = Number(lineRaw), block = Number(blockRaw), branch = Number(branchRaw);
      const taken = takenRaw === "-" ? null : Number(takenRaw);
      if (values.length !== 4 || !decimal(lineRaw) || !decimal(blockRaw) || !decimal(branchRaw) || (takenRaw !== "-" && !decimal(takenRaw)) || !Number.isSafeInteger(lineNo) || lineNo < 1 || !Number.isSafeInteger(block) || !Number.isSafeInteger(branch) || (taken !== null && !Number.isSafeInteger(taken))) {
        invalid.push({ source: file, reason: "malformed BRDA counter" });
      } else if (files.get(file).branches.has(`${lineNo}:${block}:${branch}`)) {
        invalid.push({ source: file, reason: "duplicate BRDA counter" });
      } else files.get(file).branches.set(`${lineNo}:${block}:${branch}`, taken);
    } else if (/^(?:LF|LH|BRF|BRH):/.test(line)) {
      if (!file) continue;
      const match = line.match(/^(LF|LH|BRF|BRH):(\d+)$/);
      const name = match?.[1], raw = match?.[2];
      if (!match || Object.hasOwn(files.get(file).summaries, name) || !Number.isSafeInteger(Number(raw))) {
        invalid.push({ source: file, reason: "malformed or duplicate LCOV summary counter" });
      } else files.get(file).summaries[name] = Number(raw);
    } else if (line === "end_of_record") {
      if (!recordOpen) invalid.push({ source: file, reason: "end_of_record without open record" });
      recordOpen = false;
      file = undefined;
    }
  }
  for (const [source, record] of files) {
    const lineHits = [...record.lines.values()].filter((hits) => hits > 0).length;
    const branchHits = [...record.branches.values()].filter((hits) => hits > 0).length;
    const unknownBranches = [...record.branches.values()].filter((hits) => hits === null).length;
    const { LF, LH, BRF, BRH } = record.summaries;
    if ((LF !== undefined && LF !== record.lines.size) || (LH !== undefined && LH !== lineHits) ||
        (BRF !== undefined && BRF !== record.branches.size) ||
        (BRH !== undefined && (BRH < branchHits || BRH > branchHits + unknownBranches))) {
      invalid.push({ source, reason: "LCOV summary counters disagree with detailed counters" });
    }
  }
  if (recordOpen) invalid.push({ source: file, reason: "missing end_of_record terminator" });
  return { files, invalid };
}

export function coverage(parsed, changed, sourceOverrides = new Map(), addedLines = null) {
  if (!parsed) return { status: "unknown", reason: "coverage data unavailable", percent: null, uncoveredBranches: [] };
  if (parsed.invalid.length) return { status: "incomplete", reason: "LCOV contains invalid or out-of-repository records", percent: null, uncoveredBranches: [], invalid_records: parsed.invalid };
  const rows = changed.map((name) => {
    const row = parsed.files.get(sourceOverrides.get(name) ?? name);
    return row ? { name, row } : null;
  });
  if (rows.length === 0 || rows.some((row) => !row))
    return { status: "incomplete", reason: "coverage data missing changed file(s)", percent: null, uncoveredBranches: [] };
  let hit = 0, total = 0;
  const uncoveredBranches = [];
  for (const { name, row } of rows) {
    const selected = addedLines?.get(name);
    for (const [line, hits] of row.lines) {
      if (addedLines && !selected?.has(line)) continue;
      total++;
      if (hits > 0) hit++;
    }
    for (const [key, hits] of row.branches)
      if ((!addedLines || selected?.has(Number(key.split(":", 1)[0]))) && (hits === 0 || hits === null))
        uncoveredBranches.push({ file: name, branch: key });
  }
  return { status: total ? "available" : "incomplete", reason: total ? null : addedLines ? "coverage contains no executable added lines" : "coverage contains no executable lines for changed files", percent: total ? Math.round((hit / total) * 10000) / 100 : null, linesHit: hit, linesFound: total, uncoveredBranches };
}

export function readLcov(filePath, root) {
  if (!filePath) return null;
  try {
    return parseLcov(fs.readFileSync(filePath, "utf8"), root);
  } catch {
    return { files: new Map(), invalid: [{ source: filePath, reason: "coverage input could not be read" }] };
  }
}

export function classifyMutationOutcome({ timedOut = false, exitCode = null, signal = null, stdout = "", stderr = "" }) {
  if (timedOut) return { status: "incomplete", outcome: "timeout", survivors: [] };
  if (signal) return { status: "incomplete", outcome: "killed", signal, survivors: [] };
  if (/no tests? (?:were )?found|zero tests?/i.test(`${stdout}\n${stderr}`)) return { status: "incomplete", outcome: "no-tests", survivors: [] };
  if (exitCode !== 0) return { status: "incomplete", outcome: "failed", survivors: [] };
  return { status: "available", outcome: "completed", survivors: [] };
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", timeout: options.timeout ?? 1500, cwd: options.cwd, maxBuffer: 1024 * 1024 });
}

function git(root, ...args) {
  const result = run("git", args, { cwd: root });
  return result.status === 0 ? result.stdout : null;
}

function addedSourceLines(root, base, name, previousName) {
  const paths = [name, ...(previousName ? [previousName] : [])].map((file) => `:(literal)${file}`);
  const patch = git(root, "diff", "--no-ext-diff", "--no-color", "--unified=0", "--find-renames", `${base}...HEAD`, "--", ...paths);
  if (patch === null) return null;
  const lines = new Set(), hunks = [];
  let sections = 0, oldRemaining = 0, newRemaining = 0, nextLine = 0, inHunk = false;
  for (const line of patch.split("\n")) {
    if (inHunk && (oldRemaining || newRemaining)) {
      if (line.startsWith("\\ No newline at end of file")) continue;
      if (line.startsWith("+")) {
        if (!newRemaining--) return null;
        if (lines.has(nextLine)) return null;
        lines.add(nextLine++);
      } else if (line.startsWith("-")) {
        if (!oldRemaining--) return null;
      } else if (line.startsWith(" ")) {
        if (!oldRemaining-- || !newRemaining--) return null;
        nextLine++;
      } else return null;
      continue;
    }
    inHunk = false;
    if (line.startsWith("diff --git ")) {
      if (++sections > 1) return null;
      continue;
    }
    if (!line.startsWith("@@ ")) continue;
    if (!sections) return null;
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(line);
    if (!match) return null;
    hunks.push({ oldStart: Number(match[1]), oldCount: Number(match[2] ?? 1), newStart: Number(match[3]), newCount: Number(match[4] ?? 1) });
    const oldCount = Number(match[2] ?? 1), start = Number(match[3]), newCount = Number(match[4] ?? 1);
    if (![Number(match[1]), oldCount, start, newCount].every(Number.isSafeInteger)) return null;
    oldRemaining = oldCount;
    newRemaining = newCount;
    nextLine = start;
    inHunk = true;
  }
  return sections === 1 && oldRemaining === 0 && newRemaining === 0 ? { lines, hunks } : null;
}

function changedSources(root, base) {
  const output = git(root, "diff", "--name-status", "-z", "--find-renames", `${base}...HEAD`, "--", "*.js", "*.jsx", "*.mjs", "*.cjs", "*.ts", "*.tsx", "*.py");
  if (output === null) return { files: [], deleted: [], error: "could not read changed-file list" };
  const changed = classifyChangedFiles(output);
  const oldNames = new Map(changed.renamed.map(({ from, to }) => [to, from]));
  const addedLines = new Map(), hunks = new Map();
  for (const name of changed.files) {
    const diff = addedSourceLines(root, base, name, oldNames.get(name));
    if (diff === null) return { ...changed, error: "could not read changed-line diff" };
    addedLines.set(name, diff.lines);
    hunks.set(name, diff.hunks);
  }
  return { ...changed, addedLines, hunks, error: null };
}

export function classifyChangedFiles(output) {
  const files = [], deleted = [], renamed = [], added = [];
  const rows = [];
  if (output.includes("\0")) {
    const fields = output.split("\0");
    fields.pop();
    for (let i = 0; i < fields.length;) {
      const status = fields[i++];
      rows.push([status, fields[i++], ...(status.startsWith("R") || status.startsWith("C") ? [fields[i++]] : [])]);
    }
  } else {
    rows.push(...output.trim().split("\n").filter(Boolean).map((row) => row.split("\t")));
  }
  for (const [status, ...names] of rows) {
    if (status.startsWith("D")) deleted.push(names[0]);
    else if (status.startsWith("R") || status.startsWith("C")) {
      files.push(names.at(-1));
      if (status.startsWith("R")) renamed.push({ from: names[0], to: names.at(-1) });
    } else {
      files.push(names[0]);
      if (status.startsWith("A")) added.push(names[0]);
    }
  }
  return { files, deleted, renamed, added };
}

function comparableDelta(current, baseline, changed, renameSources) {
  if (!current || !baseline || current.invalid.length || baseline.invalid.length ||
      changed.files.some((name) => !current.files.has(name))) return null;
  let currentHits = 0, baselineHits = 0, total = 0;
  for (const name of changed.files) {
    if (changed.added.includes(name)) continue;
    const currentLines = current.files.get(name)?.lines;
    const baselineLines = baseline.files.get(renameSources.get(name) ?? name)?.lines;
    const hunks = changed.hunks.get(name);
    if (!currentLines || !baselineLines || !hunks) return null;
    let oldNext = 1, newNext = 1;
    const countSurvivors = (oldEnd) => {
      for (const [line, hits] of baselineLines) {
        if (line < oldNext || line >= oldEnd) continue;
        const currentHitsOnLine = currentLines.get(newNext + line - oldNext);
        if (currentHitsOnLine === undefined) continue;
        total++;
        if (hits > 0) baselineHits++;
        if (currentHitsOnLine > 0) currentHits++;
      }
    };
    for (const { oldStart, oldCount, newStart, newCount } of hunks) {
      const oldAnchor = oldStart + (oldCount === 0 ? 1 : 0);
      const newAnchor = newStart + (newCount === 0 ? 1 : 0);
      if (oldAnchor < oldNext || newAnchor < newNext || oldAnchor - oldNext !== newAnchor - newNext) return null;
      countSurvivors(oldAnchor);
      oldNext = oldAnchor + oldCount;
      newNext = newAnchor + newCount;
    }
    countSurvivors(Infinity);
  }
  return total ? Math.round(((currentHits - baselineHits) / total) * 10000) / 100 : null;
}

function untrackedInputs(root, outputPath) {
  const result = git(root, "ls-files", "--others", "--exclude-standard", "-z");
  if (result === null) return null;
  const output = outputPath && path.relative(root, path.resolve(outputPath)).split(path.sep).join("/");
  return result.split("\0").filter((name) => name && name !== output);
}

function completedTestExecution(command, stdout) {
  const executable = path.basename(command[0]).replace(/\.exe$/i, "");
  if ((executable !== "node" && command[0] !== process.execPath) || command[1] !== "--test") return false;
  const tests = /^(?:#|ℹ) tests (\d+)$/m.exec(stdout);
  const passed = /^(?:#|ℹ) pass (\d+)$/m.exec(stdout);
  return tests && passed && Number(tests[1]) > 0 && Number(passed[1]) === Number(tests[1]) &&
    /^(?:#|ℹ) fail 0$/m.test(stdout);
}

function runCoverage(root, revision, command, outputPath) {
  const failure = (reason) => ({ parsed: null, reason, provenance: null });
  if (!Array.isArray(command) || !command.length || command.some((part) => typeof part !== "string" || !part))
    return failure("coverage command must be a nonempty argv array");
  let checkout;
  try { checkout = fs.realpathSync(root); } catch { return failure("coverage source worktree is unavailable"); }
  if (!revision || git(root, "rev-parse", "HEAD")?.trim() !== revision ||
      git(root, "rev-parse", "--show-toplevel")?.trim() !== checkout ||
      git(root, "diff", "--quiet", "HEAD", "--") === null ||
      untrackedInputs(root, outputPath)?.length !== 0)
    return failure("coverage source revision or worktree inputs are not clean and pinned");
  if (!outputPath || fs.existsSync(outputPath)) return failure("coverage run requires a fresh, absent output path");
  const env = { ...process.env, TEST_HEALTH_LCOV_PATH: outputPath };
  delete env.NODE_TEST_CONTEXT; // A nested invocation must run its own tests, not inherit Node's parent runner guard.
  const result = spawnSync(command[0], command.slice(1), {
    cwd: root, env, encoding: "utf8", timeout: 600000, maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) return failure("coverage command did not complete successfully");
  if (!completedTestExecution(command, result.stdout ?? "")) return failure("coverage command did not demonstrate executed tests");
  if (git(root, "rev-parse", "HEAD")?.trim() !== revision ||
      git(root, "diff", "--quiet", "HEAD", "--") === null ||
      untrackedInputs(root, outputPath)?.length !== 0)
    return failure("coverage source or worktree inputs changed during test execution");
  try {
    if (!fs.lstatSync(outputPath).isFile()) return failure("coverage command did not create a regular LCOV file");
    const bytes = fs.readFileSync(outputPath);
    return {
      parsed: parseLcov(bytes.toString("utf8"), root), reason: null,
      provenance: { revision, command, sha256: createHash("sha256").update(bytes).digest("hex") }
    };
  } catch {
    return failure("coverage command did not create a readable LCOV file");
  }
}

function boundCoverage(parsed, changed, overrides, run, changedError, addedLines = null) {
  if (changedError) return { status: "incomplete", reason: changedError, percent: null, uncoveredBranches: [] };
  if (run?.reason) return { status: "incomplete", reason: run.reason, percent: null, uncoveredBranches: [] };
  const result = coverage(parsed, changed, overrides, addedLines);
  if (result.status !== "available" || run?.provenance) return result;
  return { status: "unknown", reason: "LCOV has no verified test execution and source revision", percent: null, uncoveredBranches: [] };
}

export function buildReport({ root, base, coveragePath, baselineCoveragePath, baselineRoot, currentCommand, baselineCommand, selectedFiles = [], mutation = false }) {
  const revision = git(root, "rev-parse", "HEAD")?.trim() ?? null;
  const baseRevision = git(root, "merge-base", base, "HEAD")?.trim() ?? null;
  const changed = changedSources(root, base);
  const distinctInputs = !coveragePath || !baselineCoveragePath || path.resolve(coveragePath) !== path.resolve(baselineCoveragePath);
  const currentRun = currentCommand ? runCoverage(root, revision, currentCommand, coveragePath) : null;
  const baselineRun = baselineCommand ? (!baselineRoot || !distinctInputs || path.resolve(baselineRoot) === path.resolve(root)
    ? { parsed: null, reason: "baseline execution requires a separate worktree and distinct output path", provenance: null }
    : runCoverage(baselineRoot, baseRevision, baselineCommand, baselineCoveragePath)) : null;
  const currentParsed = currentRun ? currentRun.parsed : readLcov(coveragePath, root);
  const baselineParsed = baselineRun ? baselineRun.parsed : readLcov(baselineCoveragePath, baselineRoot ?? root);
  const currentCoverage = boundCoverage(currentParsed, changed.files, new Map(), currentRun, changed.error, changed.addedLines);
  const renameSources = new Map((changed.error ? [] : changed.renamed).map(({ from, to }) => [to, from]));
  const baselineFiles = changed.files.filter((name) => !changed.added?.includes(name));
  const baselineCoverage = boundCoverage(baselineParsed, baselineFiles, renameSources, baselineRun, changed.error);
  const delta = !changed.error && currentRun?.provenance && baselineRun?.provenance
    ? comparableDelta(currentParsed, baselineParsed, changed, renameSources) : null;
  const selected = [...new Set(selectedFiles)];
  const selectedDeleted = selected.filter((name) => changed.deleted.includes(name));
  const invalidSelected = selected.filter((name) => !changed.files.includes(name) && !selectedDeleted.includes(name));
  const mutationReport = { status: "not-requested", tool: "mutmut", survivors: [], skipped: [], provenance: null };
  if (mutation) {
    mutationReport.provenance = { revision, selectedFiles: selected.filter((name) => changed.files.includes(name)), tool: "mutmut" };
    if (selectedDeleted.length) {
      mutationReport.status = "incomplete";
      mutationReport.skipped.push({ reason: "deleted source files cannot be mutation targets", files: selectedDeleted });
    } else if (invalidSelected.length) {
      mutationReport.status = "incomplete";
      mutationReport.skipped.push({ reason: "selected files are not current changed source files", files: invalidSelected });
    } else if (!selected.length || selected.some((name) => !name.endsWith(".py"))) {
      mutationReport.status = "unknown";
      mutationReport.skipped.push({ reason: "select changed Python files; other mutation adapters are unsupported" });
    } else {
      const version = run("mutmut", ["--version"]);
      mutationReport.status = "unknown";
      mutationReport.skipped.push({ reason: version.status === 0 ? "installed mutmut has no supported invocation here that isolates selected files and this run" : "mutmut unavailable; no installation attempted" });
      if (version.status === 0) mutationReport.provenance.toolVersion = version.stdout.trim();
    }
  }
  return { schema_version: schemaVersion, repository: root, revision, base, changed_files: changed.files, deleted_files: changed.deleted, renamed_files: changed.renamed, coverage: { status: currentCoverage.status, reason: currentCoverage.reason, provenance: { current: coveragePath ?? null, baseline: baselineCoveragePath ?? null, current_run: currentRun?.provenance ?? null, baseline_run: baselineRun?.provenance ?? null }, linesHit: currentCoverage.linesHit ?? null, linesFound: currentCoverage.linesFound ?? null, uncoveredBranches: currentCoverage.uncoveredBranches, invalid_records: currentCoverage.invalid_records ?? [], baseline: { status: baselineCoverage.status, reason: baselineCoverage.reason, percent: baselineCoverage.percent }, current: { status: currentCoverage.status, reason: currentCoverage.reason, percent: currentCoverage.percent }, delta_percentage_points: delta }, mutation: mutationReport, interpretation: "Coverage and mutation evidence describe tool observations; neither establishes correctness." };
}

function main(args) {
  let root = process.cwd(), base, coveragePath, baselineCoveragePath, baselineRoot, currentCommand, baselineCommand, mutation = false;
  const selectedFiles = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root") root = path.resolve(args[++i]);
    else if (args[i] === "--base") base = args[++i];
    else if (args[i] === "--coverage") coveragePath = path.resolve(args[++i]);
    else if (args[i] === "--baseline-coverage") baselineCoveragePath = path.resolve(args[++i]);
    else if (args[i] === "--baseline-root") baselineRoot = path.resolve(args[++i]);
    else if (args[i] === "--current-command") currentCommand = JSON.parse(args[++i]);
    else if (args[i] === "--baseline-command") baselineCommand = JSON.parse(args[++i]);
    else if (args[i] === "--mutate") mutation = true;
    else if (args[i] === "--file") selectedFiles.push(args[++i]);
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!base) throw new Error("--base <commit> is required");
  const report = buildReport({ root, base, coveragePath, baselineCoveragePath, baselineRoot, currentCommand, baselineCommand, selectedFiles, mutation });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
}
