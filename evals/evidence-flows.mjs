import { section } from "./lib.mjs";

// Strip parenthetical/bracketed annotations, surrounding quotes/backticks, trailing
// punctuation, and collapse whitespace; lowercases for uniform comparison.
// Routes every receipt text parser so annotated forms like 'increment (Add one from zero)'
// resolve to 'increment' and 'reset (Reset from nonzero)' to 'reset'.
export function normalize(label) {
  return String(label ?? "")
    .replace(/\([^)]*\)/g, " ")      // strip (...) annotations
    .replace(/\[[^\]]*\]/g, " ")     // strip [...] annotations
    .replace(/[`*_]/g, "")           // strip inline formatting markers
    .replace(/^(["'`])(.*)\1$/, "$2") // strip matching surrounding quote/backtick pair only
    .replace(/[.!?,;]+$/, "")        // strip trailing punctuation
    .replace(/\s+/g, " ")            // collapse whitespace
    .trim()
    .toLowerCase();
}

function rows(text) {
  return text.split("\n")
    .filter((line) => /^\s*\|/.test(line))
    .map((line) => line.trim().slice(1, -1).split("|").map((cell) => cell.replace(/[`*_]/g, "").trim()))
    .filter((cells) => cells.length === 7);
}

// These are counter actions, not ID prefixes or evidence filenames. Configuration
// follows a comma, semicolon, or a spaced slash in the retained receipts.
function flowName(label) {
  const n = normalize(label);
  const addOnePatterns = [
    /^(?:one )?add one(?: activation)?(?: (?:exactly )?once)?(?: from (?:fresh )?(?:0|zero))?$/i,
    /^(?:one )?add one from (?:fresh )?(?:0|zero)(?: (?:exactly )?once)?$/i,
  ];
  if (n === "increment" || addOnePatterns.some((pattern) => pattern.test(n))) return "increment";
  if (/^reset(?: from (?:(?:actual|the current) )?nonzero(?: count| \d+)?)?$/i.test(n)) return "reset";
  return null;
}

function identity(label) {
  const n = normalize(label);
  const [name, ...details] = n.split(/[,;:]|\s+\/\s+/).map((part) => normalize(part));
  const direct = flowName(name);
  const match = direct ? null : /^([a-z0-9][a-z0-9_-]*)(?:\s+(.+))?$/i.exec(name);
  const suffix = flowName(match?.[2] ?? "");
  const id = match && (!match[2] || suffix) ? match[1].toLowerCase() : null;
  if (!direct && !id) return { id: null, semantic: null, conflict: false };
  const semantics = [direct, suffix, ...details.map(flowName)].filter(Boolean);
  return { id, semantic: semantics[0] ?? null, conflict: new Set(semantics).size > 1 };
}

function actionFlow(action) {
  const n = normalize(action);
  const stripped = n.replace(/^(?:activate|click)\s+/i, "").replace(/\s+(?:exactly\s+)?once\b/i, "").trim();
  return flowName(stripped);
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
    const result = normalize(cells[5]);
    results.push(result);
    const declared = identity(cells[0]);
    if (declared.conflict) conflict = true;
    const mapped = declared.id ? mappings.get(declared.id) : null;
    if (mapped && declared.semantic && mapped !== declared.semantic) conflict = true;
    // An ID with a semantic suffix still needs an explicit charter mapping.
    const flow = declared.id ? mapped : declared.semantic;
    if (flow) outcomes[flow].push(result);
  }
  return {
    increment: !conflict && outcomes.increment.length > 0 && outcomes.increment.every((result) => result === expected.increment),
    reset: !conflict && outcomes.reset.length > 0 && outcomes.reset.every((result) => result === expected.reset),
    results,
  };
}
