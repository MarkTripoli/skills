import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = path.join(repo, "skills", "explain");
const { PERSONAS, SECTIONS, STYLE_SHA256, check, checkText, inline, readPersona, standalone, start } = await import(path.join(skillDir, "scripts", "page.mjs"));

// Unfilled pages may only fail on what filling them fixes: placeholders, guide comments, the footer text, media not yet
// copied, and template stills a persona's media limit makes the writer drop.
const FILL_ONLY = /^(unfilled placeholder|template guide comment|about-evidence fine print is empty|(src|poster)="media\/\{[a-z_]+\}" does not exist|\w+ page has \d+ pictures or videos)/;

test("the pinned style hash matches references/style.css", () => {
  const hash = crypto.createHash("sha256").update(fs.readFileSync(path.join(skillDir, "references", "style.css"))).digest("hex");
  assert.equal(hash, STYLE_SHA256, "a style.css change updates STYLE_SHA256 in scripts/page.mjs in the same commit");
});

test("every persona's page comes from the one template with only its sections, in its order", () => {
  for (const name of ["engineer", "executive", "product", "qa", "ux"]) assert.ok(PERSONAS.includes(name), name);
  for (const name of PERSONAS) {
    const html = start(name);
    assert.match(html, new RegExp(`<main class="wrap" data-persona="${name}">`), name);
    const shown = [...html.matchAll(/data-section="([a-z-]+)"/g)].map((m) => m[1]);
    assert.deepEqual(shown, readPersona(name).sections.map((s) => s.id), name);
    const structural = check(html, path.join(os.tmpdir(), `${name}.html`)).filter((p) => !FILL_ONLY.test(p.message));
    assert.deepEqual(structural, [], name);
  }
  const slack = checkText(fs.readFileSync(path.join(skillDir, "references", "slack.md"), "utf8")).filter((p) => !FILL_ONLY.test(p.message));
  assert.deepEqual(slack, [], "slack.md");
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "explain-start-")), "qa.html");
  const cli = () => spawnSync("node", [path.join(skillDir, "scripts", "page.mjs"), "start", "qa", out], { encoding: "utf8" });
  assert.equal(cli().status, 0);
  fs.appendFileSync(out, "<!-- filled -->");
  assert.equal(cli().status, 1, "start never overwrites a page");
  assert.match(fs.readFileSync(out, "utf8"), /<!-- filled -->$/);
  const both = spawnSync("node", [path.join(skillDir, "scripts", "page.mjs"), "check", out, path.join(path.dirname(out), "slack.md")], { encoding: "utf8" });
  assert.equal(both.status, 1);
  assert.match(both.stderr, /qa\.html:\d+: unfilled placeholder/);
  assert.match(both.stderr, /slack\.md: missing/);
  // A retyped style block is restored by the command, so only real problems remain.
  const retyped = path.join(path.dirname(out), "retyped.html");
  fs.writeFileSync(retyped, inline(PAGE).replace("--after: #1a7a43;", "--after: #00ff00;"));
  fs.mkdirSync(path.join(path.dirname(out), "media"));
  for (const m of ["side-by-side.mp4", "before-confirm.jpg"]) fs.writeFileSync(path.join(path.dirname(out), "media", m), "x");
  const fixed = spawnSync("node", [path.join(skillDir, "scripts", "page.mjs"), "check", retyped], { encoding: "utf8" });
  assert.equal(fixed.status, 0, fixed.stderr);
  assert.match(fixed.stdout, /restored the shared style block/);
  assert.equal(fs.readFileSync(retyped, "utf8"), inline(PAGE));
  // A block that lost its end tag holds markup; the command reports it and rewrites nothing.
  const broken = inline(PAGE).replace("</style>", "") + "<style>p{}</style>";
  fs.writeFileSync(retyped, broken);
  const kept = spawnSync("node", [path.join(skillDir, "scripts", "page.mjs"), "check", retyped], { encoding: "utf8" });
  assert.equal(kept.status, 1);
  assert.doesNotMatch(kept.stdout, /restored/);
  assert.equal(fs.readFileSync(retyped, "utf8"), broken);
  assert.match(kept.stderr, /no <\/style> end tag/);
  assert.throws(() => inline(broken), /no <\/style> end tag/);
  const inlined = spawnSync("node", [path.join(skillDir, "scripts", "page.mjs"), "inline", retyped], { encoding: "utf8" });
  assert.equal(inlined.status, 1);
  assert.match(inlined.stderr, /retyped\.html: the <style data-explain> block has no <\/style> end tag/);
  // With nothing later to close it, the message is the same, never "start the page".
  const unclosed = inline(PAGE).replace("</style>", "");
  assert.ok(problems(unclosed, path.dirname(out)).some((m) => /no <\/style> end tag/.test(m)));
  assert.throws(() => inline(unclosed), /no <\/style> end tag/);
  // A bare "<" in a retyped rule is CSS, not markup: the command still restores the block.
  fs.writeFileSync(retyped, inline(PAGE).replace("--after: #1a7a43;", "--after: #00ff00; } @media (width < 40rem) { p { margin: 0; }"));
  const media = spawnSync("node", [path.join(skillDir, "scripts", "page.mjs"), "check", retyped], { encoding: "utf8" });
  assert.equal(media.status, 0, media.stderr);
  assert.equal(fs.readFileSync(retyped, "utf8"), inline(PAGE));
  // Comments and quoted strings may hold tags, such as an SVG icon in a data URI; the block is still plain CSS.
  fs.writeFileSync(retyped, inline(PAGE).replace("--after: #1a7a43;", `--after: #00ff00; } .x { background: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'></svg>"); content: '<b>'; } /* <b> */ .y {`));
  const icon = spawnSync("node", [path.join(skillDir, "scripts", "page.mjs"), "check", retyped], { encoding: "utf8" });
  assert.equal(icon.status, 0, icon.stderr);
  assert.equal(fs.readFileSync(retyped, "utf8"), inline(PAGE));
});

test("persona files parse, and the README menu lists every template section", () => {
  for (const name of PERSONAS) assert.deepEqual(readPersona(name).problems, [], name);
  const readme = fs.readFileSync(path.join(skillDir, "personas", "README.md"), "utf8");
  assert.deepEqual([...readme.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]), SECTIONS);
  const edited = readPersona("sales", '# Sales\n\n## Words to avoid\n\nSome words.\n\n- `churn`\n- "stack trace"\n\n## Sections\n\n1. Top\n2. `numbers` (optional)\n3. about-evidence\n\n## Limits\n\n- Table rows: at most 2\n- pictures and videos: 0\n');
  assert.deepEqual(edited, {
    name: "sales",
    sections: [{ id: "top", optional: false }, { id: "numbers", optional: true }, { id: "about-evidence", optional: false }],
    avoid: ["churn", "stack trace"],
    limits: { rows: 2, media: 0 },
    problems: [],
  });
  const broken = readPersona("sales", "# Sales\n\n## Sections\n\n1. numbers\n2. sidebar\n3. numbers\n4. top (optional)\n\n## Limits\n\n- Slides: at most 2\n").problems.join("\n");
  for (const expected of [/unknown section "sidebar"/, /"numbers" is listed twice/, /"top" must be listed first/, /"about-evidence" must be listed last/, /unknown limit "Slides: at most 2"/]) assert.match(broken, expected);
  assert.match(readPersona("sales", "# Sales\n").problems.join(), /no "## Sections" list/);
  const loose = readPersona("sales", '# Sales\n\n## Words we avoid\n\n- churn\n\n## Words to avoid\n\n- churn (say "customers who left")\n- **churn**\n- churn, attrition\n- \u2018churn\u2019\n- stack trace\n\n## Sections\n\n1. top\n2. about-evidence\n').problems.join("\n");
  for (const expected of [/unknown heading "## Words we avoid"/, /"churn \(say "customers who left"\)" is not one plain word/, /"\*\*churn\*\*" is not one plain word/, /"churn, attrition" is not one plain word/]) assert.match(loose, expected);
  assert.doesNotMatch(loose, /\u2018churn\u2019|stack trace/);
  const spelled = readPersona("sales", "# Sales\n\n## Words to avoid\n\n- don\u2019t\n- CI/CD\n- Node.js\n- e-mail\n- caf\u00e9\n\n## Sections\n\n1. top\n2. about-evidence\n");
  assert.deepEqual([spelled.problems, spelled.avoid], [[], ["don't", "CI/CD", "Node.js", "e-mail", "caf\u00e9"]]);
  const headings = readPersona("sales", "# Sales\n\n### Words to avoid\n\n- churn\n\n## Tone\n\n- Plain.\n\n## Tone\n\n- Short.\n\n## Sections\n\n1. top\n2. about-evidence\n").problems.join("\n");
  assert.match(headings, /"### Words to avoid" needs two hashes/);
  assert.match(headings, /"## Tone" appears twice/);
  const crlf = readPersona("sales", "# Sales\r\n\r\n## Words to avoid\r\n\r\n- churn\r\n\r\n## Sections\r\n\r\n1. top\r\n2. numbers (Optional)\r\n3. about-evidence\r\n\r\n## Limits\r\n\r\n- Table rows: at most 2\r\n");
  assert.deepEqual([crlf.problems, crlf.avoid, crlf.sections.map((s) => s.optional), crlf.limits], [[], ["churn"], [false, true, false], { rows: 2 }]);
});

test("a persona file added by copying another works with no code change, banner parts in any order", async () => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "explain-persona-"));
  fs.cpSync(skillDir, copy, { recursive: true });
  const sales = fs.readFileSync(path.join(copy, "personas", "product.md"), "utf8").replace("# Product", "# Sales").replace("2. headline-number\n3. video (optional)", "2. video (optional)\n3. headline-number").replace("- stack trace", "- churn\n- don\u2019t worry");
  fs.writeFileSync(path.join(copy, "personas", "sales.md"), sales);
  const edited = await import(path.join(copy, "scripts", "page.mjs"));
  assert.ok(edited.PERSONAS.includes("sales"));
  const html = edited.start("sales");
  assert.match(html, /data-persona="sales"/);
  assert.deepEqual(edited.check(html, path.join(copy, "sales.html")).filter((p) => !FILL_ONLY.test(p.message)), []);
  const dir = pageDir();
  const page = edited.inline(PAGE).replace('data-persona="ux"', 'data-persona="sales"').replace(/<section data-section="timeline">[\s\S]*?<section data-section="takeaways">[\s\S]*?<\/section>/, [
    '<section data-section="before-and-now"><p>Members reach the workspace before the history arrives.</p></section>',
    '<section data-section="numbers"><p>Measured on two emulators.</p></section>',
    '<section data-section="scope"><p>Joining only.</p></section>',
    '<section data-section="status"><p>In review.</p></section>',
  ].join("\n"));
  assert.deepEqual(problems(page, dir, edited.check), []);
  assert.ok(problems(page.replace("Joining only.", "Joining only, which cuts churn."), dir, edited.check).some((m) => /"churn" is in personas\/sales\.md/.test(m)));
  for (const typed of ["Don't worry.", "Don\u2019t worry.", "Don&rsquo;t worry."]) {
    assert.ok(problems(page.replace("Joining only.", typed), dir, edited.check).some((m) => /is in personas\/sales\.md/.test(m)), typed);
  }
});

const PAGE = `<title>Get In, Then Catch Up</title>
<style data-explain></style>
<main class="wrap" data-persona="ux">
  <section class="hero" aria-labelledby="title" data-section="top">
    <div class="hero-text"><h1 id="title">Get in first. Catch up after.</h1>
      <div class="scoreboard" data-section="headline-number"><div class="score after"><span class="n mono">8.8 s</span><span class="l">Now</span></div></div>
    </div>
    <figure data-section="video"><div class="video"><video src="media/side-by-side.mp4" controls muted aria-label="Two phones joining an organization"></video></div></figure>
  </section>
  <section data-section="timeline"><div class="strip"><div class="shot"><img src="media/before-confirm.jpg" alt="Join confirmation screen"><span class="tc before">0 s</span></div></div></section>
  <section data-section="takeaways"><p>Members reach the workspace before the history arrives.</p></section>
  <footer class="fine" id="about-evidence" data-section="about-evidence"><p>All footage is real. Invitations were delivered off camera, so no invite code appears.</p></footer>
</main>
`;

function pageDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explain-"));
  fs.mkdirSync(path.join(dir, "media"));
  fs.writeFileSync(path.join(dir, "media", "side-by-side.mp4"), "video");
  fs.writeFileSync(path.join(dir, "media", "before-confirm.jpg"), "image");
  return dir;
}

const problems = (html, dir, run = check) => run(html, path.join(dir, "page.html")).map((p) => p.message);

test("a filled page on the shared style passes, including code, exact quotes and links", () => {
  const dir = pageDir();
  const legit = [
    "",
    "<pre><code>Text('${count} items', key: {children})</code></pre>",
    '<p class="quote">You’re in — still syncing</p>',
    "<q>View only — you're not a member of this team</q>",
    '<p><a href="https://example.com/a-comprehensive-guide" target="_blank" rel="noopener">guide</a></p>',
    "<img src='media/before-confirm.jpg' alt='Single-quoted attributes' width=\"640\" height=\"1280\">",
    '<p><a href="#about-evidence">fine print</a> <a href="media/side-by-side.mp4">video</a> <a href="mailto:qa@example.com">mail</a></p>',
    "<!-- a note for the next editor -->",
    '<pre class="mermaid">\nflowchart LR\n  A[Tap Join] --> B{Access confirmed?}\n  B -->|yes| C[Workspace]\n</pre>',
    '<pre class="mermaid">\nclassDiagram\n  class Store\n  Store : appendLog()\n</pre>',
    '<pre class="mermaid">\nflowchart LR\n  A[Fix #123] --> B[Done #9829;]\n</pre>',
    '<pre class="mermaid">\nstateDiagram-v2\n  Foreground --> Background: home button\n  Background: sync paused\n</pre>',
    '<pre class="mermaid">\nsequenceDiagram\n  App->>Theme: updateStyle(tokens)\n</pre>',
    '<pre class="mermaid">\nflowchart LR\n  Z["&#99999999"] --> Y["&#x110000;"]\n</pre>',
    '<pre class="mermaid">\nquadrantChart\n  title Color: contrast against effort\n  Link color: [0.3, 0.6]\n</pre>',
    '<svg class="diagram" role="img" aria-label="Join time before and now" viewBox="0 0 640 60"><g class="tone-before"><rect x="0" y="0" width="600" height="14" fill="currentColor"></rect><text x="604" y="12">33 s</text></g><g class="tone-after"><path d="M0 30 H80" stroke="currentColor" fill="none"></path></g></svg>',
    "<pre><code>f\"joined {path} in {value} ms\"</code></pre>",
    "<p><code>&lt;Input value={value} /&gt;</code></p>",
    "<pre><code>println!(\"{step}: {value}\")</code></pre>",
    '<p class="quote">Tap <span class="mono">Join</span> — then wait</p>',
    "<p class=quote>You're in — still syncing</p>",
    "<p><q>Pick a branch to continue</q> <code>git commit</code></p>",
    '<p><span class="quote">View only <span>now</span> — not a member</span></p>',
  ];
  for (const extra of legit) assert.deepEqual(problems(inline(PAGE.replace("before the history arrives.</p>", `before the history arrives.</p>${extra}`)), dir), [], extra);
  // The persona's words to avoid stay allowed in the evidence footer.
  assert.deepEqual(problems(inline(PAGE.replace("All footage is real.", "All footage is real, built from commit abc1234 on its branch.")), dir), []);
});

test("the check rejects drift from the shared style, voice and evidence rules", () => {
  const dir = pageDir();
  const page = inline(PAGE);
  const end = (html) => page.replace("</main>", `${html}</main>`);
  const say = (text) => page.replace("All footage is real.", text);
  const cases = [
    [page.replace("--after: #1a7a43;", "--after: #00ff00;"), /shared style differs/],
    [PAGE, /shared style differs/],
    [end("<style>.x { color: red; }</style>"), /<style> is not an element/],
    [end("<style/x>p { color: red; }</style>"), /<style> is not an element/],
    [page.replace('<h1 id="title">', '<h1 id="title" style="color: red">'), /attribute "style"/],
    [end('<p class="lede"style="color: red">x</p>'), /attribute "style"/],
    [end('<p align="center">x</p>'), /attribute "align"/],
    [end('<blockquote>x</blockquote>'), /<blockquote> is not an element/],
    [end('<a href="javascript:alert(1)">x</a>'), /not an http\(s\), mailto, anchor or relative link/],
    [end('<a href="&#106;avascript:alert(1)">x</a>'), /not an http\(s\), mailto, anchor or relative link/],
    [end('<a href="javascript&colon;alert(1)">x</a>'), /not an http\(s\), mailto, anchor or relative link/],
    [end('<a href="java\tscript:alert(1)">x</a>'), /not an http\(s\), mailto, anchor or relative link/],
    [end('<!--><script src="x.js"></script>-->'), /<script> is not an element/],
    [end('<!---><script src="x.js"></script>-->'), /<script> is not an element/],
    [end('<!-- x --!><style>main { background: red; }</style> -->'), /<style> is not an element/],
    [end('<!-->{thesis} A seamless page.'), /unfilled placeholder \{thesis\}/],
    [end('<div class="wide"><table width="1400"><tbody><tr><td>x</td></tr></tbody></table></div>'), /attribute "width" on <table>/],
    [page.replace('class="fine"', 'class="fine banner"'), /class "banner" is not in the shared style/],
    [end('<script src="https://cdnjs.cloudflare.com/x.js"></script>'), /<script> is not an element/],
    [end('<script/src="x.js"></script>'), /<script> is not an element/],
    [end('<svg viewBox="0 0 10 10"><rect width="10" height="10"></rect></svg>'), /svg needs role="img" and an aria-label/],
    [end('<svg class="diagram" role="img" aria-label="x"><rect width="10" height="10" fill="#ff00ff"></rect></svg>'), /fill="#ff00ff" on <rect>; paint with currentColor/],
    [end('<svg class="diagram" role="img" aria-label="x"><line stroke="red"></line></svg>'), /stroke="red" on <line>/],
    [end('<svg class="diagram" role="img" aria-label="x"><foreignObject></foreignObject></svg>'), /<foreignobject> is not an element/],
    [end('<svg class="diagram" role="img" aria-label="x"><text>A seamless join</text></svg>'), /voice: "seamless"/],
    [end('<svg role="img" aria-label="x" viewBox="0 0 10 10"></svg>'), /svg needs class "diagram"/],
    [end('<svg class="diagram" role="img" aria-label="x" width="1200"></svg>'), /attribute "width" on <svg>/],
    [end('<svg class="diagram" role="img" aria-label="x" transform="scale(3)"></svg>'), /transform on <svg>/],
    [end('<pre class="mermaid">flowchart LR\n  A --> B\n  style A fill:#ff00ff</pre>'), /Mermaid "(?:fill:|#ff00ff|style)" overrides/],
    [end('<pre class="mermaid">flowchart LR\n  A --> B\n  classDef hot stroke-width:4px</pre>'), /Mermaid "classDef" overrides/],
    [end('<pre class="mermaid">%%{init: {"theme": "forest"}}%%\nflowchart LR\n  A --> B</pre>'), /Mermaid "%%\{" overrides/],
    [end('<pre class="mermaid">flowchart LR; A-->B; style A fill:red</pre>'), /Mermaid "(?:fill:|style)" overrides/],
    [end('<pre class="mermaid">flowchart LR\n  A --> B&#13;style A fill:red</pre>'), /Mermaid "(?:fill:|style)" overrides/],
    [end('<pre class="mermaid">flowchart LR\r  A --> B\rstyle A fill:red</pre>'), /Mermaid "(?:fill:|style)" overrides/],
    [end('<pre class="mermaid">---\nconfig:\n  theme: forest\n---\nflowchart LR\n  A --> B</pre>'), /Mermaid "--- frontmatter" overrides/],
    [end('<pre class="mermaid">sequenceDiagram\n  rect rgb(255, 0, 255)\n  A->>B: join\n  end</pre>'), /Mermaid "rgb\(" overrides/],
    [end('<pre class="mermaid">flowchart LR\n  A --> B\n  &#115;tyle A stroke-width:4px</pre>'), /Mermaid "style" overrides/],
    [end('<pre class="mermaid">sequenceDiagram\n  box Purple Members\n  participant A\n  end</pre>'), /Mermaid "box" overrides/],
    [end('<pre class="mermaid">sequenceDiagram\n  rect LightYellow\n  A->>B: join\n  end</pre>'), /Mermaid "rect" overrides/],
    [end('<pre class="mermaid">flowchart TD %%{init: {"theme": "forest"}}%%\n  A --> B</pre>'), /Mermaid "%%\{" overrides/],
    [end('<pre class="mermaid">flowchart LR\n  A["&lt;span style=\'color:red\'&gt;Join&lt;/span&gt;"] --> B</pre>'), /Mermaid "<span style=" overrides/],
    [end('<pre class="mermaid">flowchart LR\n  A["&lt;font color=\'red\'&gt;Join&lt;/font&gt;"] --> B</pre>'), /Mermaid "<font color=" overrides/],
    [end('<pre class="mermaid">flowchart LR\n  A["&ltfont color=\'red\'&gt;Join&lt;/font&gt;"] --> B</pre>'), /Mermaid "<font color=" overrides/],
    [end('<pre class="mermaid">flowchart LR\n  A["&#60font color=\'red\'&gt;Join&lt;/font&gt;"] --> B</pre>'), /Mermaid "<font color=" overrides/],
    [end('<pre class="mermaid">C4Context\n  System(s, "Store")\n  UpdateElementStyle(s, $bgColor="red")</pre>'), /Mermaid "UpdateElementStyle" overrides/],
    [end('<pre class="mermaid">quadrantChart\n  Point A: [0.3, 0.6] color: #333333, stroke-color: #999999</pre>'), /Mermaid "point color" overrides/],
    [end('<pre class="mermaid">quadrantChart\n  Point A: [0.3, 0.6&rsqb; color: red</pre>'), /Mermaid "point color" overrides/],
    [end('<pre class="mermaid">flowchart LR\n  A --> B\n  &percnt;&percnt;&lcub;init: {}}%%</pre>'), /Mermaid "%%\{" overrides/],
    [end('<pre class="mermaid">\n{mermaid_diagram}\n</pre>'), /unfilled placeholder \{mermaid_diagram\}/],
    [end('<svg class="diagram" role="img" aria-label="x" viewBox="0 0 640 40"><use href="media/chart.svg#g"></use></svg>'), /<use> may only reference a shape on this page/],
    [end('<svg class="diagram" role="img" aria-label="x" viewBox="0 0 60 20"></svg>'), /viewBox needs a width of at least 480/],
    [end('<pre class="mermaid">flowchart LR\n  A[A seamless join] --> B</pre>'), /voice: "seamless"/],
    [end('<font color="red">old</font>'), /<font> is not an element/],
    [end('<table bgcolor="#ff00ff"><tbody><tr><td>x</td></tr></tbody></table>'), /attribute "bgcolor"/],
    [end('<p onclick="go()">x</p>'), /attribute "onclick"/],
    [page.replace("Catch up after.", "{thesis}"), /unfilled placeholder \{thesis\}/],
    [page.replace('alt="Join confirmation screen"', 'alt="{what_is_on_screen}"'), /unfilled placeholder \{what_is_on_screen\}/],
    [end("<!-- guide: drop this -->"), /template guide comment/],
    [page.replace(' alt="Join confirmation screen"', ""), /image without alt text/],
    [page.replace(' aria-label="Two phones joining an organization"', ""), /video without aria-label/],
    [end('<audio src="https://example.com/a.mp3" aria-label="Narration"></audio>'), /<audio> is not an element/],
    [page.replace("media/before-confirm.jpg", "media/missing.jpg"), /does not exist/],
    [page.replace('"media/before-confirm.jpg"', "'media/missing.jpg'"), /does not exist/],
    [page.replace('"media/before-confirm.jpg"', "media/missing.jpg"), /does not exist/],
    [page.replace("media/before-confirm.jpg", "data:image/svg+xml,%3Csvg%3E"), /data: URI/],
    [page.replace('src="media/before-confirm.jpg"', 'src="media/before-confirm.jpg" srcset="https://example.com/a.jpg 2x"'), /attribute "srcset"/],
    [page.replace('src="media/before-confirm.jpg" alt="Join confirmation screen"', 'src="https://example.com/a.jpg"alt="x"'), /not a relative path/],
    [page.replace("media/before-confirm.jpg", "https://example.com/a.jpg"), /not a relative path/],
    [page.replace("media/before-confirm.jpg", "../escape.jpg"), /leaves the page directory/],
    [page.replace('data-persona="ux"', 'data-persona="no/persona"'), /data-persona/],
    [end("<p>A stray note.</p>"), /<p> sits outside every section/],
    [page.replace("</main>", "</main>\n<p>After the page.</p>"), /<p> sits outside every section/],
    [page.replace('<section data-section="takeaways">', 'A loose line.<section data-section="takeaways">'), /text sits outside every section/],
    [page.replace("</main>", "</main>\nTrailing words."), /text sits outside every section/],
    ["Draft.\n" + page, /text sits outside every section/],
    [page.replace('<section data-section="takeaways">', '<section><p>Untracked.</p></section><section data-section="takeaways">'), /<section> sits outside every section/],
    [page.replace("Members reach", "Both branches let members reach"), /"branches" is in personas\/ux\.md Words to avoid/],
    [page.replace("Members reach", "After two refactors, members reach"), /"refactors" is in personas\/ux\.md Words to avoid/],
    [end('<section data-section="scope"><p>Shipped.</p></section>'), /section "scope" is not in personas\/ux\.md/],
    [end('<section data-section="sidebar"><p>x</p></section>'), /not in the section menu/],
    [end('<section data-section="timeline"><p>Later.</p></section>'), /section "timeline" is out of order/],
    [page.replace(/<section data-section="takeaways">[\s\S]*?<\/section>/, ""), /section "takeaways" is missing/],
    [page.replace(' data-section="headline-number"', ""), /section "headline-number" is missing/],
    [page.replace("Members reach", "After the refactor, members reach"), /"refactor" is in personas\/ux\.md Words to avoid/],
    [page.replace('alt="Join confirmation screen"', 'alt="Join screen on the new branch"'), /"branch" is in personas\/ux\.md Words to avoid/],
    [page.replace(' id="about-evidence"', ""), /missing the id="about-evidence"/],
    [page.replace(' id="about-evidence"', ' id="about-evidence" hidden'), /attribute "hidden"/],
    [page.replace(' id="about-evidence"', ' id="about-evidence" aria-hidden="true"'), /attribute "aria-hidden"/],
    [page.replace(/(<footer class="fine" id="about-evidence" data-section="about-evidence">)[\s\S]*?<\/footer>/, "$1<p></p></footer>"), /fine print is empty/],
    [page.replace("Get In, Then Catch Up", "How joining an organization works now for new members"), /title has 9 words/],
    [say("A seamless, robust join."), /voice: "seamless"/],
    [say("Real footage — no edits."), /voice: "—"/],
    [say("Real footage &#8212; no edits."), /voice: "&#8212;"/],
    [say("Real footage &#x2014; no edits."), /voice: "&#x2014;"/],
    [say("Let’s take a look at the join."), /voice: "Let’s take a look"/],
    [say("Let&rsquo;s take a look at the join."), /voice: "Let&rsquo;s take a look"/],
    [page.replace('alt="Join confirmation screen"', 'alt="A seamless join screen"'), /voice: "seamless"/],
    [say("Token glpat-abcdefghijklmnop1234."), /credential or key/],
    [say("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"), /credential or key/],
  ];
  for (const [html, expected] of cases) {
    const found = problems(html, dir);
    assert.ok(found.some((m) => expected.test(m)), `${expected} not in ${JSON.stringify(found)}`);
  }
});

test("a persona's limits hold its page: the executive keeps three table rows and one image or video", () => {
  const dir = pageDir();
  const exec = inline(PAGE).replace('data-persona="ux"', 'data-persona="executive"').replace(/<section data-section="timeline">[\s\S]*?<section data-section="takeaways">[\s\S]*?<\/section>/, [
    '<section data-section="before-and-now"><div class="compare"><div class="before"><img src="media/before-confirm.jpg" alt="Join confirmation screen"></div></div></section>',
    '<section data-section="numbers"><p>Measured on two emulators.</p></section>',
    '<section data-section="status"><p>In review.</p></section>',
  ].join("\n"));
  assert.deepEqual(problems(exec, dir), ["executive page has 2 pictures or videos; personas/executive.md allows 1"]);
  const one = exec.replace(/<figure data-section="video">[\s\S]*?<\/figure>/, "");
  assert.deepEqual(problems(one, dir), []);
  const rows = '<div class="wide"><table><tbody>' + "<tr><td>a</td></tr>".repeat(4) + "</tbody></table></div>";
  assert.ok(problems(one.replace("</main>", `${rows}</main>`), dir).some((m) => /4 table rows/.test(m)));
  const bare = '<div class="wide"><table><thead><tr><th>h</th></tr></thead>' + "<tr><td>a</td></tr>".repeat(4) + "</table></div>";
  assert.ok(problems(one.replace("</main>", `${bare}</main>`), dir).some((m) => /4 table rows/.test(m)));
  const open = '<div class="wide"><table><thead><tr><th>h</th></tr><tbody>' + "<tr><td>a</td></tr>".repeat(5) + "</tbody></table></div>";
  assert.ok(problems(one.replace("</main>", `${open}</main>`), dir).some((m) => /5 table rows/.test(m)));
  assert.deepEqual(problems(one.replace("Measured on two emulators.</p>", 'Measured on two emulators.</p><div class="wide"><table><thead><tr><th>h</th></tr></thead><tbody>' + "<tr><td>a</td></tr>".repeat(3) + "</tbody></table></div>"), dir), []);
});

test("an edited installed style.css fails every page until the skill repository updates the pin", async () => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "explain-skill-"));
  fs.cpSync(skillDir, copy, { recursive: true });
  fs.appendFileSync(path.join(copy, "references", "style.css"), ".banner { color: red; }\n");
  const edited = await import(path.join(copy, "scripts", "page.mjs"));
  const dir = pageDir();
  const found = problems(edited.inline(PAGE.replace('class="fine"', 'class="fine banner"')), dir, edited.check);
  assert.ok(found.some((m) => /differs from the skill's published style/.test(m)), JSON.stringify(found));
});

test("standalone wraps the page in the document head a publishing host adds", () => {
  const html = standalone(inline(PAGE));
  assert.match(html, /^<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<meta name="viewport"/);
  assert.ok(html.includes("<title>Get In, Then Catch Up</title>"));
  assert.doesNotMatch(html, /mermaid\.min\.js/);
  assert.match(standalone(inline(PAGE).replace("</main>", '<pre class="mermaid">flowchart LR\n A --> B</pre></main>')), /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid@12\.0\.0\/dist\/mermaid\.min\.js"><\/script>/);
});

const SLACK = `*TL;DR: New members get into an organization in seconds.*

*Before*
A new member waited while the app downloaded the organization's history.

*Now*
• The joining screen says "Some data may still be loading \u2014 when you enter."
• Spinning arrows show sync; \`Pull succeeded\` when done.

*Measured on Android emulators*
• Large (2,512 changes): 18.8 s → 8.8 s

*Status*
In review.
Open: empty Inventory wording during catch-up.

_Not shown: retry wait, reduced motion._
<https://claude.ai/artifact/abc|Product page>
`;

test("the Slack message follows Slack mrkdwn and the shared voice", () => {
  assert.deepEqual(checkText(SLACK), []);
  assert.deepEqual(checkText(SLACK.replace("In review.", "In review; the probe printed `sent {value} ms`.")), []);
  assert.deepEqual(checkText(SLACK.replace("In review.", "In review; the template uses `<!-- guide: -->` comments.")), []);
  const cases = [
    [SLACK.replace("*Before*", "**Before**"), /\*\*bold\*\*/],
    [SLACK.replace("*Before*", "## Before"), /heading/],
    [SLACK.replace("• Large (2,512 changes): 18.8 s → 8.8 s", "| Org | Before | Now |\n|---|---|---|"), /table row/],
    [SLACK.replace("<https://claude.ai/artifact/abc|Product page>", "[Product page](https://claude.ai/artifact/abc)"), /Markdown link/],
    [SLACK.replace("In review.", "In review \u2014 next week."), /voice: "\u2014"/],
    [SLACK.replace("In review.", "A seamless rollout."), /voice: "seamless"/],
    [SLACK.replace("In review.", "{stage_and_next_step}"), /unfilled placeholder/],
    [SLACK.replace("In review.", "Token xoxb-1234567890-abcdefghij."), /credential or key/],
    [SLACK.replace("• Large (2,512 changes): 18.8 s → 8.8 s", "Org | Before | Now\n---|---|---"), /table row/],
    [SLACK.replace("<https://claude.ai/artifact/abc|Product page>", '[Product page](https://claude.ai/artifact/abc "page")'), /Markdown link/],
    [SLACK.replace("In review.", "In review. <!-- note to self -->"), /HTML comment/],
    [SLACK.replace("In review.", 'In review; a "seamless" rollout.'), /voice: "seamless"/],
  ];
  for (const [text, expected] of cases) {
    const found = checkText(text).map((p) => p.message);
    assert.ok(found.some((m) => expected.test(m)), `${expected} not in ${JSON.stringify(found)}`);
  }
});

test("the live eval's grader passes an honest recording and fails an overstated or illustrated one", async () => {
  const { default: scenario } = await import(path.join(repo, "evals", "scenarios", "explain.mjs"));
  const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), "explain-eval-"));
  const pagesDir = fs.mkdtempSync(path.join(os.tmpdir(), "explain-eval-pages-"));
  fs.writeFileSync(path.join(taskDir, "02-evidence-jsonl-log.md"), "---\ntype: evidence\n---\n- commit: abc1234def\n");
  const footer = '<footer class="fine" id="about-evidence" data-section="about-evidence"><p>Captured terminal output on one Linux host. Windows was not measured. The summary says roughly 10x; the medians give 2.5x.</p></footer>';
  const page = (persona, body) => inline(`<title>Faster Sends</title>\n<style data-explain></style>\n<main class="wrap" data-persona="${persona}">\n${body}\n${footer}\n</main>\n`);
  const top = (title, parts) => `<section class="hero" data-section="top"><div class="hero-text"><h1>${title}</h1>${parts}</div></section>`;
  const score = '<div class="scoreboard" data-section="headline-number"><div class="score after"><span class="n mono">36.6 ms</span><span class="l">Now</span></div></div>';
  const engineer = page("engineer", [
    top("Sends no longer rewrite the log", `${score}<dl class="facts" data-section="key-facts"><dt>Change</dt><dd><code>abc1234</code></dd></dl>`),
    '<section data-section="mechanism"><p>Median send on a 50,000-entry log: 91.5 ms before, 36.6 ms now at <code>abc1234</code> in <code>src/store.mjs</code>. Small logs: 40.3 ms and 43.0 ms.</p><pre class="mermaid">flowchart LR\n  A[send] --> B[append one line]</pre></section>',
    '<section data-section="limits"><p>Windows was not measured.</p></section>',
  ].join("\n"));
  const executive = page("executive", [
    top("Sends stay fast on big logs", score),
    '<section data-section="before-and-now"><p>Median send fell from 91.5 ms to 36.6 ms.</p></section>',
    '<section data-section="numbers"><p>Measured on one Linux host.</p></section>',
    '<section data-section="status"><p>Ready for review.</p></section>',
  ].join("\n"));
  const slack = "*TL;DR: Sends stay fast on big logs.*\n\n*Measured on one Linux host*\n• 50,000 entries: 91.5 ms → 36.6 ms\n\n_Not shown: Windows. The PR summary says roughly 10x; the medians give 2.5x._\n";
  const answer = "Pages saved:\n- engineer\n\nSummary:\nx\n\nShare text:\nx\n\nPublished: not published\n\nNot shown:\n- Windows\n";
  const grade = (pages) => {
    for (const [name, text] of Object.entries(pages)) fs.writeFileSync(path.join(pagesDir, name), text);
    return scenario.phases[0].check({ live: false, taskDir, pagesDir, answer, skillsDir: path.join(repo, "skills") });
  };
  assert.deepEqual(grade({ "engineer.html": engineer, "executive.html": executive, "slack.md": slack }), []);
  // Grading reports a changed style block and leaves the recording as it was.
  const restyled = engineer.replace("--after: #1a7a43;", "--after: #00ff00;");
  assert.ok(grade({ "engineer.html": restyled }).some((p) => /engineer\.html:\d+: shared style differs/.test(p)));
  assert.equal(fs.readFileSync(path.join(pagesDir, "engineer.html"), "utf8"), restyled);
  grade({ "engineer.html": engineer });
  const claims = [
    "Sends are now roughly 10x faster.", "Sends are tenfold faster.", "Sends are an order of magnitude faster.", "Sends take 90% less time.",
    "Sends are about 10 times faster.", "An order-of-magnitude gain.", "Send time dropped by 90%.", "Sends got a 90% speedup.", "Send time is down 90%.", "Sends take 90 percent less time.",
    "Per the PR, sends are roughly 10x faster. Windows does not support the new append mode.",
    "As the PR says, sends are roughly 10x faster. Not shown: Windows.", "Per the PR, sends are roughly 10x faster. Windows was not measured.",
    "This PR makes a send append one JSON line instead of rewriting the log, so sends are roughly 10x faster.",
    "Per the PR, sends on big logs are roughly 10x faster. A send appends one line instead of rewriting the log.",
    "Sends are roughly 10x faster, as the PR says: the median fell from 91.5 ms to 36.6 ms. Windows was not measured.",
    "Sends are not 2x but 10x faster.",
    "Sends are 10x faster, not 2.5x.",
  ];
  // Planted after the measured sentence, so nothing that follows corrects it.
  for (const claim of claims) {
    const overstated = grade({ "executive.html": executive.replace("36.6 ms.</p>", `36.6 ms. ${claim}</p>`) });
    assert.ok(overstated.some((p) => /10x claim stated as fact/.test(p)), `${claim} ${JSON.stringify(overstated)}`);
  }
  for (const label of ['aria-label="Sends 10x faster"', "aria-label='Sends 10x faster'"]) {
    const labelled = grade({ "executive.html": executive.replace("<h1>", `<h1 ${label}>`) });
    assert.ok(labelled.some((p) => /10x claim stated as fact/.test(p)), JSON.stringify(labelled));
  }
  assert.deepEqual(grade({ "executive.html": executive.replace("Median send fell", "Tests passed 3 of 3 (100%). Median send fell") }), []);
  const corrections = [
    "The PR summary says roughly 10x, but the medians went from 91.5 ms to 36.6 ms.",
    "The PR claims roughly 10x; the probe measured 91.5 ms → 36.6 ms.",
    "The pull request claims roughly 10x faster sends. The medians show 60% less time on large logs.",
    "Primary outputs give 91.5 → 36.6 ms, not the local summary's roughly 10x claim.",
    "The large-log median ratio is 2.5x, not the summary's roughly 10x.",
    "The PR's roughly 10x does not match the medians (91.5 ms to 36.6 ms).",
    "Per the PR, sends are roughly 10x faster. Measured sends take 60 percent less time.",
    "The PR description claims roughly 10x faster; primary timings support about 2.5x, not 10x.",
    "Measured sends are about 2.5x faster, not 10x.",
  ];
  for (const correction of corrections) {
    const honest = grade({ "executive.html": executive.replace("Median send fell", `${correction} Median send fell`) });
    assert.deepEqual(honest, [], correction);
  }
  const footerClaim = grade({ "executive.html": executive.replace("Captured terminal output on one Linux host.", "Real: sends are roughly 10x faster.") });
  assert.ok(footerClaim.some((p) => /10x claim stated as fact/.test(p)), JSON.stringify(footerClaim));
  fs.writeFileSync(path.join(pagesDir, "executive.html"), executive);
  fs.writeFileSync(path.join(pagesDir, "shot.jpg"), "image");
  const illustrated = grade({ "executive.html": executive.replace("</section>", '<img src="shot.jpg" alt="A terminal"></section>') });
  assert.ok(illustrated.some((p) => /no images or video/.test(p)), JSON.stringify(illustrated));
});

test("the added-persona and no-evidence eval graders pass the right outcome and fail the wrong one", async () => {
  const { default: persona, SUPPORT } = await import(path.join(repo, "evals", "scenarios", "explain-persona.mjs"));
  const { default: stop } = await import(path.join(repo, "evals", "scenarios", "explain-no-evidence.mjs"));
  const skills = fs.mkdtempSync(path.join(os.tmpdir(), "explain-eval-skills-"));
  fs.cpSync(skillDir, path.join(skills, "explain"), { recursive: true });
  const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), "explain-eval-task-"));
  const pagesDir = fs.mkdtempSync(path.join(os.tmpdir(), "explain-eval-pages-"));
  // What the scenario's setup writes into the installed skill before the session starts.
  fs.writeFileSync(path.join(skills, "explain", "personas", "support.md"), SUPPORT);
  const footer = '<footer class="fine" id="about-evidence" data-section="about-evidence"><p>Captured terminal output on one Linux host. Windows was not measured. The summary says roughly 10x; the medians give 2.5x.</p></footer>';
  const page = (body) => inline(`<title>Sends Stay Quick</title>\n<style data-explain></style>\n<main class="wrap" data-persona="support">\n${body}\n${footer}\n</main>\n`);
  const good = page([
    '<section class="hero" data-section="top"><div class="hero-text"><h1>Sending stays quick with a long history</h1><div class="scoreboard" data-section="headline-number"><div class="score after"><span class="n mono">36.6 ms</span><span class="l">Now</span></div></div></div></section>',
    '<section data-section="before-and-now"><p>A send on a long history took 91.5 ms before and 36.6 ms now.</p></section>',
    '<section data-section="limits"><p>Windows was not measured.</p></section>',
  ].join("\n"));
  const answer = "Pages saved:\n- support\n\nSummary:\nx\n\nShare text:\nx\n\nPublished: not published\n\nNot shown:\n- Windows\n";
  const grade = (html) => {
    fs.writeFileSync(path.join(pagesDir, "support.html"), html);
    return persona.phases[0].check({ live: false, taskDir, pagesDir, answer, skillsDir: skills });
  };
  assert.deepEqual(grade(good), []);
  assert.ok(grade(good.replace("A send on", "Each append on")).some((p) => /Words to avoid/.test(p)));
  assert.ok(grade(good.replace('<section data-section="limits"><p>Windows was not measured.</p></section>', "")).some((p) => /sections top, headline-number, before-and-now, about-evidence/.test(p)));
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "explain-eval-stop-"));
  const emptyPages = fs.mkdtempSync(path.join(os.tmpdir(), "explain-eval-stop-pages-"));
  const stopAnswer = "No recording, captured output or measurement shows this change, so no page was written. Run /record-evidence first.";
  assert.deepEqual(stop.phases[0].check({ live: false, taskDir: empty, pagesDir: emptyPages, answer: stopAnswer }), []);
  fs.writeFileSync(path.join(emptyPages, "executive.html"), "x");
  assert.ok(stop.phases[0].check({ live: false, taskDir: empty, pagesDir: emptyPages, answer: stopAnswer }).some((p) => /wrote executive\.html/.test(p)));
  assert.ok(stop.phases[0].check({ live: false, taskDir, pagesDir, answer: "Pages saved:\n- support" }).length >= 2);
});
