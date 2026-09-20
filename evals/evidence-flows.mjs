import { section } from "./lib.mjs";

function rows(text) {
  return text.split("\n")
    .filter((line) => /^\s*\|/.test(line))
    .map((line) => line.trim().slice(1, -1).split("|").map((cell) => cell.replace(/[`*_]/g, "").trim()))
    .filter((cells) => cells.length === 7);
}

// These are counter actions, not ID prefixes or evidence filenames. Configuration
// follows a comma, semicolon, or a spaced slash in the retained receipts.
function flowName(label) {
  if (/^(?:increment(?: from (?:0|zero))?|(?:one )?add one(?: activation)?(?: from (?:fresh )?(?:0|zero))?)$/i.test(label)) return "increment";
  if (/^reset(?: from (?:(?:actual|the current) )?nonzero(?: count| \d+)?)?$/i.test(label)) return "reset";
  return null;
}

function identity(label) {
  const [name, ...details] = label.split(/[,;:]|\s+\/\s+/).map((part) => part.trim());
  const direct = flowName(name);
  const match = direct ? null : /^([a-z0-9][a-z0-9_-]*)(?:\s+(.+))?$/i.exec(name);
  const suffix = flowName(match?.[2] ?? "");
  const id = match && (!match[2] || suffix) ? match[1].toLowerCase() : null;
  if (!direct && !id) return { id: null, semantic: null, conflict: false };
  const semantics = [direct, suffix, ...details.map(flowName)].filter(Boolean);
  return { id, semantic: semantics[0] ?? null, conflict: new Set(semantics).size > 1 };
}

function actionFlow(action) {
  return flowName(action.replace(/^(?:activate|click)\s+/i, "").replace(/\s+(?:exactly\s+)?once\b/i, ""));
}

// Stable IDs have meaning only within this receipt's frozen target charter.
// A contradictory mapping or duplicate opposite verdict fails closed rather
// than letting a favorable row hide the contradiction.
export function counterFlowCoverage(text, expected) {
  const mappings = new Map();
  let conflict = false;
  for (const cells of rows(section(text, "### Targets and regression charter") ?? "")) {
    const declared = identity(cells[0]);
    if (declared.conflict) conflict = true;
    const action = actionFlow(cells[3]);
    if (declared.semantic && declared.semantic !== action) conflict = true;
    if (!declared.id) continue;
    if (mappings.has(declared.id) && mappings.get(declared.id) !== action) conflict = true;
    mappings.set(declared.id, action);
  }

  const outcomes = { increment: [], reset: [] };
  const results = [];
  for (const cells of rows(section(text, "## Final coverage") ?? "")) {
    results.push(cells[5].toLowerCase());
    const declared = identity(cells[0]);
    if (declared.conflict) conflict = true;
    const mapped = declared.id ? mappings.get(declared.id) : null;
    if (mapped && declared.semantic && mapped !== declared.semantic) conflict = true;
    // An ID with a semantic suffix still needs an explicit charter mapping.
    const flow = declared.id ? mapped : declared.semantic;
    if (flow) outcomes[flow].push(cells[5].toLowerCase());
  }
  return {
    increment: !conflict && outcomes.increment.length > 0 && outcomes.increment.every((result) => result === expected.increment),
    reset: !conflict && outcomes.reset.length > 0 && outcomes.reset.every((result) => result === expected.reset),
    results,
  };
}
