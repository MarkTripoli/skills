import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { BODY, BODY_WORD_LIMIT, DEFAULT_TEMPLATE, checkRfc, readTemplate, scoreRfc } from "../skills/writing/rfc-six-pager/scripts/check-rfc.mjs";
import { blocks, checkFindings, decide, facts } from "../skills/writing/rfc-six-pager/scripts/tighten.mjs";
import { extractLinks, needsLogin } from "../skills/writing/rfc-six-pager/scripts/check-links.mjs";
import { readWordList, WORD_LIST } from "../skills/writing/technical-writing/scripts/score-prose.mjs";

const para = "The build cache stores each compiled module under a key made from its inputs.";
const options = "| Option | Median pipeline | Running cost | Verdict |\n|---|---|---|---|\n| A. Shared cache host | 14 minutes [1] | $310 a month [2] | Recommended |\n| B. Larger runners | 31 minutes [1] | $900 a month [2] | Rejected |\n\n**B. Larger runners.** They cut 7 minutes [1] and keep the rebuild of unchanged modules.";
const sources = "1. Pipeline timings, CI dashboard, February 2027\n2. Hosting quote from the platform team, January 2027";
const good = (overrides = {}) => {
  const sections = {
    Decision: "The team will build a shared cache host, because it cuts the median pipeline from 31 minutes to 14. It costs $310 a month.",
    "Problem and goals": "The design must:\n\n1. Bring the median pipeline under 15 minutes by March 31, 2027.",
    Options: options,
    "Proposed design": `### Cache keys\n\n${para}`,
    Cost: "| Running cost | Today | After |\n|---|---|---|\n| Hosting | $0 | $310 a month [2] |",
    "Failure modes and risks": "| Trigger | Effect | Response |\n|---|---|---|\n| The cache host stops | Builds run without the cache | The runner falls back to a full build |",
    Outcomes: "| Outcome | Measure | Today | Target |\n|---|---|---|---|\n| Faster builds | Median pipeline | 31 minutes [1] | 14 minutes, the target |",
    "Open questions": "| Question | Our proposal |\n|---|---|\n| Which of the two priced regions hosts it? | The cheaper one. |",
    Sources: sources,
    ...overrides,
  };
  const head = "# Cache compiled modules on a shared host\n\nStatus: Draft\nAuthor: Kofi\nDecider: Ines, platform lead\nDecision needed by: March 12, 2027\n";
  return `${head}\n${Object.entries(sections).filter(([, v]) => v !== null).map(([k, v]) => `## ${k}\n\n${v}\n`).join("\n")}`;
};
const rules = (text) => checkRfc(text).map((p) => p.rule);

test("a well-formed RFC passes", () => {
  assert.deepEqual(checkRfc(good()), []);
});

test("an FAQ, an appendix and a review record after the body pass", () => {
  assert.deepEqual(checkRfc(`${good()}\n## FAQ\n\n### Why not larger runners?\n\nThey keep the waste.\n\n## Appendix A: Data\n\nRows.\n\n## Review record\n\n### March 12, 2027\n\nOutcome: Accepted.\n`), []);
});

test("reports a missing section and an unknown section", () => {
  const problems = checkRfc(good({ Outcomes: null, Background: para }));
  assert.ok(problems.some((p) => p.rule === "sections" && /missing `## Outcomes`/.test(p.message)));
  assert.ok(problems.some((p) => p.rule === "sections" && /"Background" is not a section/.test(p.message)));
});

test("reports body sections out of order", () => {
  const text = good().replace("## Options", "## TMP").replace("## Outcomes", "## Options").replace("## TMP", "## Outcomes");
  assert.ok(checkRfc(text).some((p) => /is out of order/.test(p.message)));
});

test("reports a body over the word limit and names the largest section", () => {
  const problems = checkRfc(good({ "Proposed design": Array(40).fill(Array(80).fill("word").join(" ")).join("\n\n") }));
  assert.ok(problems.some((p) => p.rule === "page-limit" && /starting with "Proposed design"/.test(p.message)));
});

test("words after the body do not count toward the limit", () => {
  assert.ok(!rules(`${good()}\n## Appendix A: Data\n\n${Array(BODY_WORD_LIMIT + 1).fill("word").join(" ")}\n`).includes("page-limit"));
});

test("the Decision section is short and states the recommendation", () => {
  const messages = (text) => checkRfc(good({ Decision: text })).filter((p) => p.rule === "decision").map((p) => p.message);
  assert.match(messages("")[0], /has no text/);
  assert.match(messages(`${Array(251).fill("word").join(" ")}\n\nThe team will do it.`)[0], /\d+ words, over the limit of 250/);
  assert.deepEqual(messages("The team will build the cache, which costs $310 a month."), []);
});

test("the RFC states outcomes, not implementation planning", () => {
  const planning = (overrides) => checkRfc(good(overrides)).filter((p) => p.rule === "planning");
  assert.equal(planning({ "Proposed design": `### Cache keys\n\n${para}\n\nPhase 1 ships the host.` }).length, 1);
  assert.deepEqual(planning({ Sources: `${sources}\n3. Phase plan, planning doc, January 2027` }), []);
});

test("an RFC asks for nothing", () => {
  const asks = (overrides) => checkRfc(good(overrides)).filter((p) => p.rule === "ask").map((p) => p.message);
  assert.match(asks({ Decision: "We ask you to approve the cache, which costs $310 a month." })[0], /state the recommendation/);
  assert.deepEqual(asks({ "Open questions": "1. **Ask.** Who do we ask about the region?" }), []);
  assert.deepEqual(asks({ FAQ: "### Why do we ask for no approval?\n\nThe decider already knows the cost." }), []);
});

test("the Options section compares at least two options in a table with a verdict", () => {
  const messages = (text) => checkRfc(good({ Options: text })).filter((p) => p.rule === "table").map((p) => p.message);
  assert.match(messages(para)[0], /no table with the columns Option, Verdict/);
  assert.match(messages("| Option | Cost | Verdict |\n|---|---|---|\n| A. Cache | $310 | Recommended |")[0], /has 1 row; it needs at least 2/);
  assert.deepEqual(messages(options), []);
});

test("the risk and open-question tables exist and leave no cell empty", () => {
  const messages = (overrides) => checkRfc(good(overrides)).filter((p) => p.rule === "table").map((p) => p.message);
  assert.match(messages({ "Failure modes and risks": para })[0], /no table with the columns Trigger or Risk, Effect, Response or Mitigation/);
  assert.deepEqual(messages({ "Failure modes and risks": "| Risk | Effect | Mitigation |\n|---|---|---|\n| The host stops | Builds slow down | Full build |" }), []);
  assert.deepEqual(messages({ "Open questions": "1. **Region.** Which of the two priced regions hosts it? We propose the cheaper one." }), []);
  assert.match(messages({ "Failure modes and risks": "| Trigger | Effect | Response |\n|---|---|---|\n| The host stops | Builds slow down | |" })[0], /a cell in this row is empty/);
  // The team may have no proposal yet: that cell stays blank. The question itself never does.
  assert.deepEqual(messages({ "Open questions": "| Question | Our proposal |\n|---|---|\n| Which region? | |" }), []);
  assert.match(messages({ "Open questions": "| Question | Our proposal |\n|---|---|\n| | The cheaper one. |" })[0], /a cell in this row is empty/);
  assert.deepEqual(messages({ "Open questions": "None." }), []);
  assert.match(messages({ "Open questions": para })[0], /or `None\.` when nothing is open/);
});

test("reports a paragraph and a table cell too long to scan", () => {
  const long = Array(9).fill(para).join(" ");
  assert.deepEqual(rules(good({ "Proposed design": long })), ["paragraph"]);
  assert.deepEqual(rules(good({ "Failure modes and risks": `| Trigger | Effect | Response |\n|---|---|---|\n| The host stops | ${Array(3).fill(para).join(" ")} | Fall back |` })), ["cell"]);
});

test("reports listed words in the body and the FAQ with their line, but not in quotations or code", () => {
  const problems = checkRfc(`${good({ "Problem and goals": "Builds are significantly slower.", "Proposed design": `${para} Support said "many teams wait" and the flag is \`--very-fast\`.` })}\n## FAQ\n\n### Is it fast?\n\nThe switch is seamless.\n`);
  // The weasel word is also a size in words with no source, so the sentence is an unbacked claim as well.
  assert.deepEqual(problems.map((p) => p.rule), ["weasel", "claim", "jargon"]);
  assert.match(problems[0].message, /"significantly": write the measurement/);
  assert.equal(good({ "Problem and goals": "Builds are significantly slower." }).split("\n")[problems[0].line - 1], "Builds are significantly slower.");
});

test("a term ending in * matches word endings and no term matches inside a longer word", () => {
  // "several keys" in the design is also a size given as a word.
  assert.deepEqual(rules(good({ "Proposed design": "We leveraged the cache. The keyring holds several keys." })), ["weasel", "jargon", "claim"]);
  assert.deepEqual(rules(good({ "Proposed design": "The journeyman release uses the cache." })), []);
});

test("reports metaphors, filler and signposts", () => {
  assert.deepEqual(rules(good({ "Proposed design": "In conclusion, the cache is basically our north star." })), ["metaphors", "filler", "signposts"]);
});

test("reports sentence shapes: contrast frame, hinted risk, residue, emoji, open item, placeholder, dashes", () => {
  const one = (text, section = "Proposed design") => rules(good({ [section]: text }));
  assert.deepEqual(one("The cache is not just a store but a contract."), ["contrast-frame"]);
  assert.deepEqual(one("A restart could be problematic."), ["vague-risk"]);
  assert.deepEqual(one(`${para}\n\nKeep these questions explicit:\n\n${para}`), ["residue"]);
  assert.deepEqual(one("The limit is TBD."), ["residue"]);
  assert.deepEqual(one(`${para} \u{1F680}`), ["emoji"]);
  assert.deepEqual(one("Account recovery remains open."), ["open-item"]);
  assert.deepEqual(one("| Question | Our proposal |\n|---|---|\n| How is an account recovered? It remains open because no key store exists. | A printed code. |", "Open questions"), []);
  assert.deepEqual(one(`${para}\n\n- **Speed:** builds finish in 9 minutes.`), []);
  assert.deepEqual(one("<Part of the design>"), ["placeholder"]);
  assert.deepEqual(one("Signing uses ed25519 keys."), []);
  assert.deepEqual(one("Its checks pass at revision 3f9c2ab71."), ["provenance", "provenance"]);
  assert.deepEqual(one("The limit is 0xdeadbeef in room 1234567 on 20270304."), []);
  assert.deepEqual(one("This does not establish hardware isolation."), ["disclaimer"]);
  assert.deepEqual(one("| Question | Our proposal |\n|---|---|\n| Is late delivery acceptable? This does not guarantee delivery after 72 hours. | Yes. |", "Open questions"), []);
  assert.deepEqual(one("Minimum versions remain undecided. Neither provider is selected."), ["open-item", "open-item"]);
  assert.deepEqual(one(`${para} (Aka - make it a PWA)`), ["residue"]);
  assert.deepEqual(one("The cache \u2014 a store \u2014 holds modules \u2014 all of them."), ["dashes"]);
});

test("reports a statement of absence in the body, outside Open questions, quotes and code", () => {
  const one = (text, section = "Proposed design") => rules(good({ [section]: text }));
  assert.deepEqual(one("That cost is not measured."), ["absence"]);
  assert.deepEqual(one("Nobody has counted them."), ["absence"]);
  assert.deepEqual(one("The period is not recorded."), ["absence"]);
  assert.deepEqual(one("| Part | Detail |\n|---|---|\n| Cost | not measured |\n| Size | 9 GB [1] |"), ["absence"]);
  assert.deepEqual(one("The cost is unknown."), ["absence"]);
  assert.deepEqual(one("The browser does not hold the key."), []);
  assert.deepEqual(one("The wrapping key is not known to the server."), []);
  assert.deepEqual(one("The key is not recorded in the log."), []);
  assert.deepEqual(one("No data is lost on restart."), []);
  assert.deepEqual(one("| Question | Our proposal |\n|---|---|\n| How many accounts exist? Nobody has counted them. | Count them. |", "Open questions"), []);
  assert.deepEqual(one("The tool prints `not measured` and \"nobody has counted\" when it fails."), []);
});

test("a Mermaid diagram does not count against the page limit, but other code blocks do", () => {
  const limit = (extra) => checkRfc(good({ "Proposed design": `${para}\n\n${extra}` })).filter((p) => p.rule === "page-limit").length;
  const filler = Array(3000).fill("label").join(" ");
  assert.equal(limit("```mermaid\nflowchart LR\n  A[\"" + filler + "\"] --> B\n```"), 0);
  assert.equal(limit("```text\n" + filler + "\n```"), 1);
});

test("reassurance is reported; what the system does is not", () => {
  const sure = (text) => checkRfc(good({ "Proposed design": `${para} ${text}` })).filter((p) => p.rule === "reassure").length;
  assert.equal(sure("Nothing breaks while the database fails over."), 1);
  assert.equal(sure("The switch works as before for users."), 1);
  assert.equal(sure("The cut-over happens without any disruption."), 1);
  assert.equal(sure("While the database fails over, writes queue in the client and replay when it returns."), 0);
  assert.equal(sure('Support said "nothing breaks".'), 0);
});

test("the shipped template and word list parse, and the template is not itself a finished RFC", () => {
  const template = fs.readFileSync(DEFAULT_TEMPLATE, "utf8");
  assert.deepEqual(readTemplate(template).body, BODY);
  assert.deepEqual(readTemplate(template).keys, ["Status", "Author", "Decider", "Decision needed by"]);
  const list = readWordList(fs.readFileSync(WORD_LIST, "utf8"));
  assert.deepEqual([...new Set(list.map((e) => e.rule))], ["weasel", "jargon", "metaphors", "filler", "signposts", "hedges"]);
  assert.ok(list.length > 150);
  assert.ok(rules(template).includes("placeholder"));
});

test("a team template adds a required section and metadata line, and cannot drop a base section", () => {
  const template = fs.readFileSync(DEFAULT_TEMPLATE, "utf8").replace("Status: Draft", "Status: Draft\nTicket: <key>").replace("## Outcomes", "## Security\n\n## Outcomes");
  const problems = checkRfc(good(), { template });
  assert.ok(problems.some((p) => /no `Ticket:` line/.test(p.message)));
  assert.ok(problems.some((p) => /missing `## Security`/.test(p.message)));
  assert.deepEqual(checkRfc(good().replace("Status: Draft", "Status: Draft\nTicket: PROJ-1").replace("## Outcomes", `## Security\n\n${para}\n\n## Outcomes`), { template }), []);
  assert.throws(() => readTemplate(template.replace("## Outcomes", "## Delivery")), /no `## Outcomes` before `## Open questions`/);
});

test("reports missing or unknown metadata", () => {
  assert.ok(rules(good().replace("Status: Draft", "Status: WIP")).includes("metadata"));
  assert.ok(checkRfc(good().replace(/Decider:.*\n/, "")).some((p) => /no `Decider:` line/.test(p.message)));
  assert.ok(checkRfc(good().replace(/Decider:.*\n/, "Decider: not named in the sources\n")).some((p) => /names nothing; ask the author/.test(p.message)));
});

test("numbered section headings match the template", () => {
  let n = 0;
  assert.deepEqual(checkRfc(good().replace(/^## /gm, () => `## ${++n}. `)), []);
});

test("scoreRfc scores the body and the FAQ, counts the RFC rules, and holds an unfinished RFC at 70", () => {
  const body = Array(10).fill(Array(4).fill(para).join(" ")).join("\n\n");
  const clean = scoreRfc(good({ "Proposed design": body }));
  assert.ok(clean.score >= 90, `clean RFC scored ${clean.score}`);
  assert.deepEqual(clean.problems, []);
  const open = scoreRfc(good({ "Proposed design": `${body} Account recovery remains open. Its checks pass at revision 3f9c2ab71.` }));
  assert.ok(open.score < clean.score);
  assert.deepEqual(open.problems.map((p) => p.rule).sort(), ["open-item", "provenance", "provenance"]);
  const unfinished = scoreRfc(good({ "Proposed design": body, Outcomes: null }));
  assert.ok(unfinished.score <= 70 && unfinished.capped);
  // Text outside the body and the FAQ is not scored.
  assert.equal(scoreRfc(`${good({ "Proposed design": body })}\n## Appendix A: Notes\n\nBasically a seamless, robust north star.\n`).score, clean.score);
});

test("the body has eight sections", () => {
  assert.equal(BODY.length, 8);
});

test("a claim cites a source or says it is an estimate", () => {
  const claimLines = (section, text) => checkRfc(good({ [section]: text })).filter((p) => p.rule === "claim").map((p) => p.message);
  assert.match(claimLines("Problem and goals", "Builds took 31 minutes in February.")[0], /"Builds took 31 minutes in February\." states a fact with no source/);
  assert.match(claimLines("Problem and goals", "Most builds rebuild unchanged modules.")[0], /no source/);
  assert.deepEqual(claimLines("Problem and goals", "Builds took 31 minutes in February [1]."), []);
  assert.deepEqual(claimLines("Problem and goals", "The host costs about $310 a month, an estimate from the quote."), []);
  assert.deepEqual(claimLines("Problem and goals", "The design must:\n\n1. Bring builds under 15 minutes."), []);
  assert.deepEqual(claimLines("Problem and goals", "Since March 12, 2027, INC-907 and step 2 changed nothing."), []);
  // A table row is one claim, backed by a citation in any cell.
  assert.equal(claimLines("Cost", "| Running cost | Today | After |\n|---|---|---|\n| Hosting | $0 | $310 a month |").length, 1);
  assert.deepEqual(claimLines("Cost", "| Running cost | Today | After |\n|---|---|---|\n| Hosting | $0 | $310 a month [2] |"), []);
  // The design describes what the team builds, so its numbers are not checked as claims about the world.
  assert.deepEqual(claimLines("Proposed design", "### Cache keys\n\nEach key holds 32 bytes."), []);
});

test("a size given as a word in the design, the decision or the outcomes is reported, but not a superlative or a limit", () => {
  const sized = (text) => checkRfc(good({ "Proposed design": `${para} ${text}` })).filter((p) => /size as a word/.test(p.message)).length;
  assert.equal(sized("The relay cuts most of the wait."), 1);
  assert.equal(sized("The relay cuts the wait from 26 hours to 2 [1]."), 0);
  assert.equal(sized("The relay is the most direct path, and retries at most 5 times."), 0);
  assert.equal(sized('Support said "many teams wait".'), 0);
});

test("each citation has an entry in Sources, and each entry is cited and dated", () => {
  const sourceProblems = (overrides) => checkRfc(good(overrides)).filter((p) => p.rule === "sources").map((p) => p.message);
  assert.match(sourceProblems({ Outcomes: "| Outcome | Measure | Today | Target |\n|---|---|---|---|\n| Faster builds | Median pipeline | 31 minutes [3] | 14 minutes, the target |" })[0], /\[3\] cites no entry of `## Sources`/);
  assert.match(sourceProblems({ Sources: null })[0], /\[1\] is cited but the RFC has no `## Sources`/);
  assert.match(sourceProblems({ Sources: `${sources}\n3. An old benchmark, 2025` }).at(-1), /source 3 is never cited/);
  assert.match(sourceProblems({ Sources: "1. Pipeline timings, CI dashboard\n2. Hosting quote, January 2027" })[0], /source 1 gives no date or period/);
  assert.deepEqual(sourceProblems({ Sources: "1. Pipeline timings, CI dashboard, undated\n2. Hosting quote, January 2027" }), []);
});

test("Out of scope sits inside Problem and goals", () => {
  const text = good().replace("## Outcomes", "## Out of scope\n\n- Flags as code, which Lucia writes up separately.\n\n## Outcomes");
  assert.ok(checkRfc(text).some((p) => p.rule === "sections" && /make it `### Out of scope`/.test(p.message)));
  assert.deepEqual(checkRfc(good({ "Problem and goals": "The design must:\n\n1. Bring builds under 15 minutes.\n\n### Out of scope\n\n- Flags as code." })), []);
});

// The comprehension test: questions from the sources, answers from fresh readers.
const comprehension = await import("../skills/writing/rfc-six-pager/scripts/comprehension.mjs");
const questions = comprehension.readQuestions({ questions: [
  { id: 1, ask: "Who decides, and by when?", expect: ["Ines", "March 12|2027-03-12"] },
  { id: 2, ask: "What does the cache cost?", expect: ["310"] },
  { id: 3, ask: "What happens when the cache host stops?", expect: ["full build"] },
] });

test("the comprehension sheet hides the facts, and the script lists facts the RFC does not state", () => {
  assert.equal(comprehension.sheet(questions), "1. Who decides, and by when?\n2. What does the cache cost?\n3. What happens when the cache host stops?\n");
  assert.deepEqual(comprehension.missingFacts(good(), questions), []);
  const missing = comprehension.missingFacts(good().replaceAll("$310 a month", "a fee"), questions);
  assert.deepEqual(missing.map((m) => [m.id, m.missing]), [[2, ["310"]]]);
  assert.throws(() => comprehension.readQuestions({ questions: [{ id: 1, ask: "Why?" }] }), /no "expect" patterns/);
});

test("the comprehension test counts an answer right when most readers hold every fact", () => {
  const answers = (two, three) => ({ answers: [{ id: 1, answer: "Ines, by March 12, 2027." }, { id: 2, answer: two }, { id: 3, answer: three }] });
  const all = comprehension.tally(good(), questions, [answers("$310 a month", "A full build runs."), answers("$310/month", "It falls back to a full build.")]);
  assert.equal(all.pass, true);
  assert.equal(all.right, 3);
  const split = comprehension.tally(good(), questions, [answers("$310 a month", "not in the RFC"), answers("$1,310", "A full build.")]);
  assert.equal(split.right, 2);
  assert.equal(split.pass, false);
  assert.deepEqual(split.wrong.map((w) => w.id), [3]);
  assert.match(comprehension.report("rfc.md", split), /^comprehension: fail \(readers: 2\)\nanswered right: 2 of 3, 67% \(limit 90%\)/);
  assert.match(comprehension.report("rfc.md", split), /readers did not get them[\s\S]*question 3/);
  assert.throws(() => comprehension.tally(good(), questions, [{ answers: [{ id: 1, answer: "Ines" }] }]), /answers 1 of 3 questions/);
});

test("check-links finds each link once, without trailing punctuation", () => {
  const text = "See [cache](https://example.com/cache).\n1. Quote, https://example.com/q, May 2027.\n2. Again https://example.com/q";
  assert.deepEqual(extractLinks(text), [
    { url: "https://example.com/cache", line: 1 },
    { url: "https://example.com/q", line: 2 },
  ]);
});

test("check-links leaves sign-in hosts for a person to open", () => {
  assert.equal(needsLogin("https://app.notion.com/p/abc"), true);
  assert.equal(needsLogin("https://team.slack.com/archives/C1"), true);
  assert.equal(needsLogin("https://github.com/org/repo"), false);
});

test("a source cited only in an appendix counts as cited", () => {
  const rfc = `${good({ Sources: `${sources}\n3. An old benchmark, 2025` })}\n## Appendix A: Benchmarks\n\nThe old runner took 40 minutes [3].\n`;
  assert.ok(!checkRfc(rfc).some((p) => /source 3 is never cited/.test(p.message)));
});

test("tighten lists each body paragraph, list item and table as one block", () => {
  const b = blocks(good());
  assert.ok(b.length > 5);
  assert.ok(b.every((x) => /^P\d+$/.test(x.id) && x.words > 0));
  assert.equal(b.filter((x) => x.text.startsWith("| Option")).length, 1);
  assert.ok(!b.some((x) => x.section === "Sources"));
});

test("tighten facts are the numbers and citations a block holds", () => {
  assert.deepEqual(facts("It costs $310 a month [2], down 61% from 2,300 runs [1, 3]."), ["[2]", "[1]", "[3]", "$310", "61%", "2,300"]);
});

test("tighten check rejects a rewrite that is longer or drops a fact, and accepts a declared drop", () => {
  const text = good();
  const b = blocks(text).find((x) => /\$310/.test(x.text));
  const longer = { id: b.id, verdict: "shorter", why: "x", rewrite: `${b.text} And more words here.` };
  assert.ok(checkFindings(text, [longer]).some((p) => /not fewer than/.test(p)));
  const lossy = { id: b.id, verdict: "shorter", why: "x", rewrite: "It is cheaper." };
  assert.ok(checkFindings(text, [lossy]).some((p) => /removes \$310/.test(p)));
  const declared = { ...lossy, drops: facts(b.text) };
  assert.deepEqual(checkFindings(text, [declared]), []);
  assert.ok(checkFindings(text, [{ id: "P999", verdict: "cut", why: "x" }])[0].startsWith("P999: no block"));
});

test("tighten stops after an empty round or two rounds under 2%", () => {
  assert.equal(decide([{ bodyWords: 3000 }, { findings: 0, bodyWords: 3000 }]), "stop: the last round found nothing to cut or shorten");
  assert.equal(decide([{ bodyWords: 3000 }, { findings: 9, bodyWords: 2700 }]), "continue");
  assert.match(decide([{ bodyWords: 3000 }, { findings: 9, bodyWords: 2700 }, { findings: 2, bodyWords: 2690 }, { findings: 1, bodyWords: 2685 }]), /two rounds/);
});

test("tighten accepts a plain rewrite that is longer, and still guards its facts", () => {
  const text = good();
  const b = blocks(text).find((x) => /\$310/.test(x.text));
  assert.deepEqual(checkFindings(text, [{ id: b.id, verdict: "plain", why: "x", rewrite: `${b.text} In plain terms, more words.` }]), []);
  assert.ok(checkFindings(text, [{ id: b.id, verdict: "plain", why: "x", rewrite: "It is cheaper." }]).some((p) => /removes \$310/.test(p)));
});

test("link-citations links each cited number to its source URL and leaves Sources and fences alone", async () => {
  const { linkCitations } = await import("../skills/writing/rfc-six-pager/scripts/link-citations.mjs");
  const rfc = [
    "## Decision", "", "Builds pass [1, 2], and owners agree [3, 4].", "", "```", "x [1]", "```", "",
    "## Sources", "", "1. CI dashboard, https://ci.example.com/runs, 2026", "2. Docs, https://docs.example.com/a, 2026", "3. Owner answers, 2026", "4. Draft, https://www.notion.so/team/Draft-123, 2026",
  ].join("\n");
  const out = linkCitations(rfc);
  assert.match(out, /Builds pass \[\[1\]\(https:\/\/ci\.example\.com\/runs\), \[2\]\(https:\/\/docs\.example\.com\/a\)\]/);
  assert.match(out, /owners agree \[3, 4\]\./);
  assert.doesNotMatch(out, /\]\(https:\/\/www\.notion/);
  assert.match(out, /^x \[1\]$/m);
  assert.match(out, /^1\. CI dashboard, https:\/\/ci\.example\.com\/runs, 2026$/m);
});

test("check-rfc flags a source that links an internal page", () => {
  const internal = (text) => checkRfc(text).filter((p) => /internal page/.test(p.message));
  const withInternal = good().replace(/(## Sources\n\n1\. [^\n]*)/, "$1, https://www.notion.so/team/Private-123");
  assert.equal(internal(withInternal).length, 1);
  assert.equal(internal(good()).length, 0);
});
