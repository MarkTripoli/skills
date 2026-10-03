// The full chain with vendor documentation gathered ahead of it. Five fresh sessions. After the shared
// research phases: the design discussion must raise the vendor-driven decisions as open questions with a
// recommendation each (deciding everything silently is wrong; the fixture has genuine open choices) and
// hand off to its iterate skill while questions remain; the plan must carry vendor facts into its phases,
// add a test, and surface the design decisions it adopted by default under Verify.

import { expect, failures, section } from "../lib.mjs";
import { SOURCE, request, researchPhases, slug, title } from "../acme-chain.mjs";

const HUMAN_REVIEW = "## Human Review";

// The Execution DAG is read in the one form the templates allow (see DAG_FORM in scripts/validate.mjs) and
// fails closed. The fence runs from the opening backticks to the first run at least as long (the extraction
// in the check), and its closing line is 0 to 3 spaces, backticks, then only spaces or tabs (and a carriage return). After the
// `flowchart|graph` + direction header, every non-blank line is read left to right with sticky regexes and
// must be consumed whole as `NODE (ARROW NODE)*`: NODE is an id with an optional quoted label
// (`id["label"]`, taken whole, so an arrow inside it is text), ARROW is `-->` or `-.->` with an optional
// `|edge label|`. A bare id must already be labelled earlier in the fence or on the same line. Mermaid
// 12.0.0 reads `direction` followed by TB, BT, RL, LR or TD (case-sensitive, whitespace including line
// breaks between them) as a direction statement that swallows the rest of that line, so a line holding the
// pair, or ending in `direction` while the next line starts with one of the five, is out of form. Ids
// Mermaid cannot parse are refused: DAG_ANYWHERE anywhere; a bare click, call or href followed by whitespace
// or the line end (its lexer keyword rule); and a bare `o` or `x` right before `-` (read as an arrow head,
// also at the start of a line, where it continues the previous statement). Any other line is reported by
// name. An id's texts are all of its labels; the capture node is an id whose every label names
// record-evidence and none names baseline, so a label that mentions baseline is rejected by design.
const DAG_HEADER = /^(?:flowchart|graph)\s+(?:TD|TB|BT|LR|RL)$/;
const DAG_NODE = /\s*([A-Za-z0-9_]+)(?:\["([^"\n]*)"\])?\s*/y;
const DAG_ARROW = /(?:-->|-\.->)(?:\s*\|[^|\n]*\|)?/y;
const DAG_ANYWHERE = new Set(["end", "style", "class", "classDef", "linkStyle", "subgraph", "graph", "flowchart", "interpolate", "_self", "_blank", "_parent", "_top"]);
const DAG_SPACED = new Set(["click", "call", "href"]);
function readDag(fence) {
  const bad = [];
  if (!/\n {0,3}`{3,}[ \t]*\r?$/.test(fence)) bad.push("closing fence line is not only the fence");
  const body = fence.replace(/^`{3,}mermaid[^\n]*\n?/, "");
  let closing = body.lastIndexOf("```");
  while (closing > 0 && body[closing - 1] === "`") closing--;
  const lines = (closing >= 0 ? body.slice(0, closing) : body).split("\n").map((line) => line.trim()).filter(Boolean);
  const labels = new Map();
  if (!lines.length || !DAG_HEADER.test(lines[0])) bad.push(lines[0] ?? "");
  for (const [index, line] of lines.slice(1).entries()) {
    let at = 0;
    let ok = !/direction\s+(?:TB|BT|RL|LR|TD)/.test(line) && !(/direction$/.test(line) && /^(?:TB|BT|RL|LR|TD)/.test(lines[index + 2] ?? ""));
    while (ok) {
      DAG_NODE.lastIndex = at;
      const node = DAG_NODE.exec(line);
      const idEnd = node ? at + node[0].indexOf(node[1]) + node[1].length : 0;
      if (!node || DAG_ANYWHERE.has(node[1]) || (node[2] === undefined && (!labels.has(node[1]) || (DAG_SPACED.has(node[1]) && !/^[[-]/.test(line.slice(idEnd))) || (/^[ox]$/.test(node[1]) && line[idEnd] === "-")))) { ok = false; break; }
      if (!labels.has(node[1])) labels.set(node[1], []);
      if (node[2] !== undefined) labels.get(node[1]).push(node[2]);
      at = DAG_NODE.lastIndex;
      if (at === line.length) break;
      DAG_ARROW.lastIndex = at;
      if (!DAG_ARROW.test(line)) { ok = false; break; }
      at = DAG_ARROW.lastIndex;
    }
    if (!ok) bad.push(line);
  }
  const capture = [...labels].filter(([, texts]) => texts.length && texts.every((t) => /record-evidence/i.test(t)) && !texts.some((t) => /baseline/i.test(t))).map(([id]) => id);
  return { bad: bad.map((line) => line.slice(0, 80)), capture };
}

// The Execution DAG fence, read from a plain document or not at all. A document is plain when, after CRLF
// becomes LF and leading YAML frontmatter is dropped: (1) no CR, U+2028, U+2029 or U+0085 remains; (2) every
// fence is a line of exactly three backticks or three tildes at column 0 with an optional info word
// `[A-Za-z0-9_-]*`, closed by exactly the same three characters, and no other line outside a fence holds three
// backticks or tildes (an indented, list, quoted or trailing-text fence) and no line inside a fence holds a fence
// mark except its closing; (3) no line outside a fence starts, after whitespace, with `<` (an HTML block or
// comment); (4) exactly one line outside fences is `### Execution DAG` (any case), no other line starting with
// `#` names an "execution dag", and none is followed by a setext underline; (5) between that heading and the
// first fence there are only blank lines and plain paragraph lines (none starts with whitespace, `#`, `<`, `>`,
// `|`, `-`, `*`, `+`, `=` or a number and a `.` or `)`), and that fence opens with `mermaid`. Anything else is
// reported as outside the plain form, because a Markdown parser's reading of it cannot be assumed; shapes a
// parser would draw but this form rejects are stricter by design.
function dagFence(text) {
  const reasons = [];
  const normalised = text.replace(/\r\n/g, "\n");
  if (/[\r\u2028\u2029\u0085]/.test(normalised)) reasons.push("a CR, U+2028, U+2029 or U+0085 remains after CRLF is normalised");
  let lines = normalised.split("\n");
  if (lines[0] === "---") {
    const close = lines.indexOf("---", 1);
    if (close > 0) lines = lines.slice(close + 1);
  }
  const fences = [];
  const headings = [];
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (open) {
      if (line === open.mark) { open.close = i; open = null; }
      else if (line.includes("```") || line.includes("~~~")) reasons.push("a line inside a fence holds a fence mark but is not exactly its closing");
      continue;
    }
    if (line.includes("```") || line.includes("~~~")) {
      const plain = /^(```|~~~)([A-Za-z0-9_-]*)$/.exec(line);
      if (!plain) reasons.push("a line with a fence mark is not a plain fence line");
      else { open = { mark: plain[1], info: plain[2], start: i, close: -1 }; fences.push(open); }
      continue;
    }
    if (/^\s*</.test(line)) reasons.push("a line outside a fence starts with `<`");
    if (/^### Execution DAG[ \t]*$/i.test(line)) headings.push(i);
    else if (/^[\s>*+\-\d.)]*#/.test(line) && /execution\s+dag/i.test(line)) reasons.push("a second or misformed Execution DAG heading");
    if (/execution\s+dag/i.test(line) && /^\s*(?:=+|-+)\s*$/.test(lines[i + 1] ?? "")) reasons.push("an Execution DAG setext heading");
  }
  if (open) reasons.push("an unclosed fence");
  if (headings.length > 1) reasons.push("more than one Execution DAG heading");
  if (headings.length !== 1) return { fence: "", reasons };
  const heading = headings[0];
  const first = fences.find((fence) => fence.start > heading);
  const stop = first ? first.start : lines.length;
  for (let i = heading + 1; i < stop; i++) {
    if (lines[i].trim() !== "" && /^(?:\s|[#<>|\-*+=]|\d+[.)])/.test(lines[i])) reasons.push("a line between the heading and the fence is not a plain paragraph line");
  }
  if (!first) return { fence: "", reasons };
  if (first.info !== "mermaid") reasons.push("the first fence under the heading is not a mermaid fence");
  return { fence: lines.slice(first.start, first.close < 0 ? lines.length : first.close + 1).join("\n"), reasons };
}

export default {
  slug,
  title,
  workflow: "full",
  fixtures: ["full-with-sources"],
  request,
  phases: [
    ...researchPhases("create-design-discussion"),
    {
      skill: "create-design-discussion",
      artifactType: "design-discussion",
      template: "design_discussion_template.md",
      // A gate phase: with decisions open it hands off to its iterate skill and the human decides (the review gate); with everything resolved it proceeds. The expectation follows the artifact, and the check below requires that decisions are in fact open. The eval then continues to the plan as an unattended run (`gates=none`) would.
      next: ({ artifact }) => (/^#### /m.test(section(artifact?.text ?? "", "### Design Questions") ?? "") ? "iterate-design-discussion" : "create-plan"),
      handoffNamesArtifact: true,
      check: ({ artifact }) => {
        const text = artifact?.text ?? "";
        const open = (section(text, "### Design Questions") ?? "").split(/^#### /m).slice(1);
        const openText = open.join("\n");
        const { fence, reasons } = dagFence(text);
        const dag = readDag(fence);
        return failures(
          expect.atLeast("design: open decisions raised", open.length, 1),
          // The fixture leaves these two genuinely open; deciding them silently under Resolved is wrong.
          expect.matches("design: token/secret placement is an open decision", openText, /token|secret/i),
          expect.matches("design: 429 / Retry-After handling is an open decision", openText, /429|Retry-After/),
          expect.matches("design: Execution DAG draws the full chain through evidence inspection and the PR", fence, /iterate-evidence/i),
          expect.matches("design: Execution DAG draws the full chain through evidence inspection and the PR", fence, /describe[- ]pr/i),
          expect.atLeast("design: Execution DAG draws the full chain through evidence inspection and the PR", dag.capture.length, 1),
          reasons.slice(0, 3).map((reason) => `design: Execution DAG document outside the plain form: ${reason}`),
          (fence ? dag.bad : []).slice(0, 3).map((line) => `design: Execution DAG line outside the template's form: ${line}`),
          expect.matches("design: new channel module named", text, /acme-status\.mjs|acme_status|acmeStatus/),
          open.filter((q) => !/recommend/i.test(q)).map((q) => `design: open question without a recommendation: ${q.split("\n")[0]}`),
        );
      },
    },
    {
      skill: "create-plan",
      artifactType: "plan",
      template: "plan_template.md",
      next: "implement-plan",
      handoffNamesArtifact: true,
      check: ({ artifact }) => {
        const text = artifact?.text ?? "";
        const body = text.split(HUMAN_REVIEW)[0];
        const phases = body.slice(body.search(/^## Phase 1/m));
        const verify = section(text, "### Verify", { last: true }) ?? "";
        return failures(
          expect.matches("plan: at least one phase heading", body, /^## Phase 1/m),
          expect.matches("plan: unchecked boxes inside the phases, not only under Human Review", phases, /- \[ \]/),
          expect.matches("plan: a phase edits the channel module", phases, /\*\*File\*\*: `src\/channels\/acme-status\.mjs`/),
          expect.matches("plan: a phase edits a test file", phases, /\*\*File\*\*: `tests\/[^`]*\.test\.mjs`/),
          expect.matches("plan: vendor contract reaches the phases", phases, /Idempotency-Key|Retry-After|429|Bearer/),
          expect.matches("plan: design decisions adopted without a human are surfaced for review", verify, /- \[ \][^\n]*\b(open (decision|question)s?|design (question|discussion|recommendation)s?|recommend\w*|adopted|default(ed)? to|option [ABC]|Q\d+ [ABC]|fixed options?)\b/i),
          expect.includes("plan: vendor doc still cited", text, SOURCE),
        );
      },
    },
  ],
};
