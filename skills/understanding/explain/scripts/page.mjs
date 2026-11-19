#!/usr/bin/env node
// Keeps every explain page on the one shared style and voice, with the sections and words its persona file sets.
// Usage: node page.mjs start <persona> <page.html>  writes references/page.html with only the persona's sections, in its order, style inlined
//        node page.mjs inline <page.html>           writes references/style.css into the page's <style data-explain> block
//        node page.mjs check <page.html|slack.md>... restores a hand-edited shared style block, then prints `ok` or one
//                                                   `file:line: problem` per finding per file; exit 1 when there is any
//        node page.mjs standalone <page.html>       writes <page>.standalone.html with the doctype, charset and viewport a host adds at publish

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skill = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const refs = path.join(skill, "references");
const personaDir = path.join(skill, "personas");
const styleFile = fs.readFileSync(path.join(refs, "style.css"), "utf8");
export const STYLE = styleFile.trim();
// Hash of the published style.css. A layout change lands in the skill repository together with this pin, never in an installed copy.
export const STYLE_SHA256 = "8e1123d4f855f09fbbd662f2600fe50c7ff75c822b160af79bfd3ec202ee9b46";
const STYLE_BLOCK = /<style data-explain>([\s\S]*?)<\/style>/;
const CLASSES = new Set([...STYLE.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]));
const PAGE = fs.readFileSync(path.join(refs, "page.html"), "utf8");
// The section menu: every data-section the one page template offers, in its default order.
export const SECTIONS = [...PAGE.matchAll(/data-section="([a-z-]+)"/g)].map((m) => m[1]);
// A persona is any Markdown file in personas/ except the README; its file name is its name.
export const PERSONAS = fs.readdirSync(personaDir).filter((f) => f.endsWith(".md") && f !== "README.md").map((f) => f.slice(0, -3)).sort();
// Only the templates' own placeholder names count, so code such as `{children}` or Dart `${count}` is not flagged.
const PLACEHOLDERS = new Set([PAGE, fs.readFileSync(path.join(refs, "slack.md"), "utf8")].flatMap((t) => [...t.matchAll(/\{([a-z][a-z0-9_]*)\}/g)].map((m) => m[1])));
const MERMAID = "https://cdn.jsdelivr.net/npm/mermaid@12.0.0/dist/mermaid.min.js";
// Allowlists: the elements and attributes the templates use, plus inline text elements. Anything else is a layout,
// a color or behavior the shared style does not own.
const ELEMENTS = new Set(["title", "main", "section", "footer", "div", "span", "p", "h1", "h2", "h3", "ul", "ol", "li", "dl", "dt", "dd", "figure", "figcaption", "img", "video", "source", "track", "table", "thead", "tbody", "tr", "th", "td", "a", "strong", "em", "small", "code", "pre", "q", "br", "sub", "sup", "abbr", "time", "kbd",
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "defs", "marker", "use", "desc"]);
const ATTRIBUTES = new Set(["class", "id", "lang", "title", "href", "target", "rel", "src", "alt", "loading", "decoding", "poster", "controls", "muted", "playsinline", "loop", "preload", "type", "kind", "srclang", "label", "default", "datetime", "start", "colspan", "rowspan", "scope", "data-persona", "data-section", "aria-label", "aria-labelledby", "aria-describedby",
  "role", "viewbox", "xmlns", "preserveaspectratio", "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "dx", "dy", "points", "transform",
  "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "marker-start", "marker-end", "text-anchor", "dominant-baseline",
  "refx", "refy", "markerwidth", "markerheight", "markerunits", "orient"]);
const MEDIA = new Set(["img", "video", "source", "track"]);
const SIZED = new Set(["img", "video", "rect", "use"]); // width and height size media and drawn shapes; on an svg or elsewhere they would set layout
const PAINT = new Set(["fill", "stroke"]); // an SVG shape paints with currentColor or none; a tone class picks the palette color
// A browser also ends a comment at `<!-->`, `<!--->` and `--!>`; anything after those is live markup.
const COMMENT = /<!--(?:-?>|[\s\S]*?--!?>)/g;
const PROSE_ATTRS = new Set(["alt", "aria-label", "title"]);
const MAX_MEDIA_BYTES = 15 * 1024 * 1024; // Artifact limit for one binary file.
const MAX_PAGE_BYTES = 16 * 1024 * 1024; // Artifact limit for the page.

// shared/WRITING.md "Delete on sight", minus words with common literal uses on these pages (finally, overall, note that).
const BANNED = [
  /\b(robust|seamless(ly)?|comprehensive|holistic|streamlined|leverag(e|es|ed|ing)|utiliz(e|es|ed|ing))\b/i,
  /\b(basically|essentially|obviously|clearly|of course)\b/i,
  /\b(in order to|due to the fact that|the fact that|a number of|going forward)\b/i,
  /\b(it is important to note|as mentioned above|in this section|this document describes|in summary|in conclusion|additionally|furthermore|moreover)\b/i,
  /\b(let(?:'|’|&rsquo;|&#8217;|&#x2019;)s take a look|let us walk through)\b/i,
  /—|&mdash;|&#8212;|&#x2014;/i,
];
const SECRETS = /\b(glpat-[\w-]{10,}|gh[pousr]_\w{20,}|github_pat_\w{20,}|xox[abpr]-[\w-]{10,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,})|-----BEGIN [A-Z ]*PRIVATE KEY-----/;

const blank = (text) => text.replace(/[^\n]/g, " ");
// Named entities for the punctuation Mermaid syntax uses, so an encoded bracket or colon reads as the browser decodes it.
const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", colon: ":", semi: ";", num: "#", lpar: "(", rpar: ")", lsqb: "[", rsqb: "]",
  lbrack: "[", rbrack: "]", lcub: "{", rcub: "}", lbrace: "{", rbrace: "}", percnt: "%", equals: "=", comma: ",", period: ".",
  excl: "!", quest: "?", sol: "/", bsol: "\\", verbar: "|", vert: "|", ast: "*", plus: "+", lowbar: "_",
  dollar: "$", tab: "\t", newline: "\n", nbsp: " ",
};
// Browsers also decode numeric references and the legacy names lt, gt, amp, quot and nbsp without the closing semicolon,
// as a prefix: "&ltfont" reads "<font".
const LEGACY = new Set(["lt", "gt", "amp", "quot", "nbsp", "LT", "GT", "AMP", "QUOT"]);
const codePoint = (n) => (n > 0x10ffff ? "\ufffd" : String.fromCodePoint(n)); // out of range reads U+FFFD, as in the browser
const decode = (text) =>
  text.replace(/&(?:#(\d+);?|#x([0-9a-f]+);?|([a-z]+);|(lt|gt|amp|quot|nbsp))/gi, (whole, dec, hex, name, legacy) =>
    dec ? codePoint(Number(dec)) : hex ? codePoint(parseInt(hex, 16)) : legacy && !LEGACY.has(legacy) ? whole : (ENTITIES[(name ?? legacy).toLowerCase()] ?? whole));

// Mermaid that would leave the host's theme: style statements, theme config, and any color literal. Returns the offending text or null.
// Statements split on newlines and `;`; HTML entities are decoded first, as the browser does before Mermaid reads the text.
export function mermaidOverride(source) {
  const text = decode(source);
  if (/^\s*---/.test(text)) return "--- frontmatter";
  if (text.includes("%%{")) return "%%{";
  // A hex color has a letter (#ff00ff, #abc); digits alone are labels such as #123 or Mermaid's #9829; entity codes.
  // Colors outside statements: hex (with a letter) and rgb/hsl literals, and HTML in labels carrying style or color
  // attributes. Diagram-specific color syntax is checked per statement below, so label text such as
  // "Background: sync paused" or "updateStyle(tokens)" stays allowed.
  const color = /#(?=[0-9a-f]{0,7}[a-f])[0-9a-f]{3,8}\b(?!;)|\b(?:rgba?|hsla?)\s*\(|<[a-z][^>]*\s(?:style|color|bgcolor)\s*=/i.exec(text);
  if (color) return color[0];
  const statements = text.split(/[\r\n;]/).map((line) => line.trim()).filter(Boolean);
  const kind = statements.find((line) => !line.startsWith("%%")) ?? "";
  const classDiagram = /^classDiagram/.test(kind);
  for (const line of statements) {
    if (line.includes(":::")) return ":::";
    // C4 colors come through Update*Style calls and $...Color arguments; quadrant points take color and stroke settings.
    if (/^C4/.test(kind) && /^Update\w*Style\s*\(|\$\w*colou?r\s*=/i.test(line)) return /^Update\w*Style/i.exec(line)?.[0] ?? "$color";
    if (/^quadrantChart/.test(kind) && /\][^\]]*\b(?:color|stroke-color|stroke-width)\s*:/i.test(line)) return "point color";
    const keyword = /^(style|classDef|linkStyle|cssClass|class|box|rect)\b/.exec(line)?.[1];
    if (keyword && !(keyword === "class" && classDiagram && !/\bclass\s+\S+\s*:::/.test(line))) return keyword;
  }
  return null;
}
const blankRanges = (text, ranges) => ranges.reduce((out, [from, to]) => out.slice(0, from) + blank(out.slice(from, to)) + out.slice(to), text);

// Start and end tags with their attributes, read the way a browser reads them, so `<script/src=x>` or
// `<p class="a"style="b">` cannot slip past. Comments are skipped.
function tokenize(html) {
  const tags = [];
  const name = /<(\/?)([a-zA-Z][^\s/>]*)/y;
  let pos = 0;
  for (let k = html.indexOf("<"); k !== -1; k = html.indexOf("<", pos)) {
    if (html.startsWith("<!--", k)) {
      COMMENT.lastIndex = k;
      const comment = COMMENT.exec(html);
      pos = comment?.index === k ? k + comment[0].length : html.length;
      continue;
    }
    name.lastIndex = k;
    const m = name.exec(html);
    if (!m) {
      pos = k + 1;
      continue;
    }
    let i = k + m[0].length;
    const attrs = new Map();
    for (;;) {
      while (i < html.length && /[\s/]/.test(html[i])) i++;
      if (i >= html.length || html[i] === ">") break;
      const start = i++;
      while (i < html.length && !/[\s/>=]/.test(html[i])) i++;
      const key = html.slice(start, i).toLowerCase();
      while (i < html.length && /\s/.test(html[i])) i++;
      let value = "";
      let at = i;
      if (html[i] === "=") {
        i++;
        while (i < html.length && /\s/.test(html[i])) i++;
        const quote = html[i] === '"' || html[i] === "'" ? html[i] : null;
        at = quote ? i + 1 : i;
        if (quote) {
          const end = html.indexOf(quote, at);
          i = end === -1 ? html.length : end + 1;
          value = html.slice(at, end === -1 ? html.length : end);
        } else {
          while (i < html.length && !/[\s>]/.test(html[i])) i++;
          value = html.slice(at, i);
        }
      }
      if (!attrs.has(key)) attrs.set(key, { value, index: at });
    }
    pos = Math.min(i + 1, html.length);
    tags.push({ close: m[1] === "/", name: m[2].toLowerCase(), index: k, end: pos, attrs });
  }
  return tags;
}

// The matching end tag of tags[n], counting nested elements of the same name; null when it is missing.
function closing(tags, n) {
  let depth = 0;
  for (let j = n; j < tags.length; j++) {
    if (tags[j].name !== tags[n].name) continue;
    depth += tags[j].close ? -1 : 1;
    if (depth === 0) return tags[j];
  }
  return null;
}

const PERSONA_HEADINGS = ["What they want to see", "Tone", "Numbers", "Words to avoid", "Sections", "Limits"];

// A persona file's Sections, Words to avoid and Limits. People who do not read code edit these files, so each problem
// says what to fix in their words.
export function readPersona(name, text = fs.readFileSync(path.join(personaDir, `${name}.md`), "utf8")) {
  const part = (heading) => new RegExp(`^##[ \\t]+${heading}[ \\t]*$([\\s\\S]*?)(?=^##[ \\t]|(?![\\s\\S]))`, "im").exec(text)?.[1] ?? null;
  const items = (body) => [...(body ?? "").matchAll(/^[ \t]*(?:\d+[.)]|[-*])[ \t]+(.+?)[ \t]*$/gm)].map((m) => m[1]);
  const problems = [];
  const seen = new Set();
  for (const m of text.matchAll(/^(#+)[ \t]+(.+?)[ \t]*$/gm)) {
    const known = PERSONA_HEADINGS.find((h) => h.toLowerCase() === m[2].toLowerCase());
    if (m[1] !== "##") {
      if (known) problems.push(`"${m[0]}" needs two hashes: "## ${known}"`);
    } else if (!known) problems.push(`unknown heading "${m[0]}"; use ${PERSONA_HEADINGS.join(", ")} (other guidance goes under Tone)`);
    else if (seen.has(known)) problems.push(`"## ${known}" appears twice; merge them into one`);
    else seen.add(known);
  }
  const sections = [];
  const listed = part("Sections");
  if (listed === null) problems.push('no "## Sections" list');
  for (const item of items(listed)) {
    const id = /^`?([a-z][a-z-]*)`?/i.exec(item)?.[1].toLowerCase();
    if (!SECTIONS.includes(id)) problems.push(`unknown section "${item}"; use a name from the menu in personas/README.md`);
    else if (sections.some((s) => s.id === id)) problems.push(`section "${id}" is listed twice`);
    else sections.push({ id, optional: /\boptional\b/i.test(item) });
  }
  for (const [id, where] of [["top", sections[0]], ["about-evidence", sections.at(-1)]]) {
    if (where?.id !== id || where.optional) problems.push(`"${id}" must be listed ${id === "top" ? "first" : "last"} and not optional`);
  }
  const avoid = [];
  for (const item of items(part("Words to avoid"))) {
    const word = item.replace(/^[`"'\u2018\u201c]+|[`"'\u2019\u201d.]+$/g, "").replaceAll("\u2019", "'").trim();
    if (/^[\p{L}\p{N}](?:[\p{L}\p{N}' ./-]*[\p{L}\p{N}])?$/u.test(word)) avoid.push(word);
    else problems.push(`words to avoid "${item}" is not one plain word or phrase; write one per bullet, with no notes or punctuation`);
  }
  const limits = {};
  for (const item of items(part("Limits"))) {
    const m = /^(table rows|pictures and videos)\s*:\s*(?:at most\s+)?(\d+)\.?$/i.exec(item);
    if (m) limits[/^table/i.test(m[1]) ? "rows" : "media"] = Number(m[2]);
    else problems.push(`unknown limit "${item}"; write "Table rows: at most N" or "Pictures and videos: at most N"`);
  }
  return { name, sections, avoid, limits, problems };
}

// The page for one persona: references/page.html with only the sections the persona lists, the page-level ones in its
// order (the banner parts inside `top` keep their place), and the shared style inlined.
export function start(name) {
  if (!PERSONAS.includes(name)) throw new Error(`no persona "${name}"; personas/ has ${PERSONAS.join(", ")}`);
  const persona = readPersona(name);
  if (persona.problems.length) throw new Error(`personas/${name}.md: ${persona.problems.join("; ")}`);
  const listed = new Set(persona.sections.map((s) => s.id));
  const tags = tokenize(PAGE);
  const blocks = [];
  tags.forEach((tag, n) => {
    const id = tag.close ? null : tag.attrs.get("data-section")?.value;
    if (!id) return;
    const line = PAGE.lastIndexOf("\n", tag.index) + 1;
    const end = closing(tags, n).end;
    blocks.push({ id, start: line, end: PAGE.indexOf("\n", end) + 1, nested: blocks.some((b) => b.start < line && end <= b.end) });
  });
  const text = (block) => {
    let out = PAGE.slice(block.start, block.end);
    for (const part of blocks.filter((b) => b.nested && b.start > block.start && b.end <= block.end && !listed.has(b.id)).reverse()) {
      out = out.slice(0, part.start - block.start) + out.slice(part.end - block.start);
    }
    return out;
  };
  const byId = new Map(blocks.filter((b) => !b.nested).map((b) => [b.id, b]));
  const body = persona.sections.filter((s) => byId.has(s.id)).map((s) => text(byId.get(s.id))).join("\n");
  const first = Math.min(...[...byId.values()].map((b) => b.start));
  const last = Math.max(...[...byId.values()].map((b) => b.end));
  return inline(PAGE.slice(0, first) + body + PAGE.slice(last)).replace('data-persona="{persona}"', `data-persona="${name}"`);
}

const ENDLESS = "the <style data-explain> block has no </style> end tag of its own; add </style> after the style rules, then run `page.mjs inline`";
// A tag inside the block means its end tag went missing and the block swallowed page markup. CSS may hold a bare "<",
// and comments and quoted strings may hold anything, such as an SVG data URI.
const holdsMarkup = (css) => /<[a-z!/]/i.test(css.replace(/\/\*[\s\S]*?\*\/|"[^"\n]*"|'[^'\n]*'/g, ""));
const STYLE_OPEN = /<style data-explain>/;

export function inline(html) {
  const block = STYLE_BLOCK.exec(html);
  if (!block) throw new Error(STYLE_OPEN.test(html) ? ENDLESS : "no <style data-explain></style> block; start the page with `page.mjs start <persona>`");
  // Rewriting a block that swallowed page markup would delete that markup.
  if (holdsMarkup(block[1])) throw new Error(ENDLESS);
  return html.replace(STYLE_BLOCK, () => `<style data-explain>\n${STYLE}\n</style>`);
}

// A publishing host such as Claude Artifacts adds the document head and renders Mermaid itself; the standalone copy does both for a local browser.
export function standalone(html) {
  const mermaid = /class\s*=\s*["']?[^"'>]*\bmermaid\b/.test(html)
    ? `<script src="${MERMAID}"></script>\n<script>mermaid.initialize({ startOnLoad: true, theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "neutral" });</script>\n`
    : "";
  return `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${html}${mermaid}</body>\n</html>\n`;
}

// The Slack message: Slack mrkdwn, the same voice, no placeholders or credentials. Code spans and quoted on-screen copy keep their own words.
export function checkText(text) {
  const problems = [];
  const add = (index, message) => problems.push({ line: text.slice(0, index).split("\n").length, message });
  // Code spans count for placeholders only when the whole span is one placeholder, as on the pages.
  const slots = text.replace(/```[\s\S]*?```|`[^`\n]*`/g, (m) => (/^`+\s*\{[a-z][a-z0-9_]*\}\s*`+$/.test(m) ? m : m.replace(/[^\n]/g, " ")));
  for (const m of slots.matchAll(/(?<!\$)\{([a-z][a-z0-9_]*)\}/g)) if (PLACEHOLDERS.has(m[1])) add(m.index, `unfilled placeholder ${m[0]}`);
  const outsideCode = text.replace(/```[\s\S]*?```|`[^`\n]*`/g, (m) => m.replace(/[^\n]/g, " "));
  for (const m of outsideCode.matchAll(/<!--/g)) add(m.index, /^<!--\s*guide:/.test(text.slice(m.index)) ? "template guide comment left in the message" : "HTML comment; Slack shows it as text");
  for (const m of text.matchAll(/^\s*\|.*\|\s*$|^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm)) add(m.index, "table row; Slack does not render Markdown tables, so write one line per case");
  for (const m of text.matchAll(/^#{1,6}\s/gm)) add(m.index, "heading; Slack does not render Markdown headings, so use a *bold* line");
  for (const m of text.matchAll(/\*\*[^*\n]+\*\*/g)) add(m.index, "**bold**; Slack bold is *single asterisks*");
  for (const m of text.matchAll(/\[[^\]\n]+\]\([^)\n]+\)/g)) add(m.index, "Markdown link; Slack links are <url|label> or a bare URL");
  // Code is not prose. Quoted copy keeps its own em dashes, but a quoted banned word is still the message's word.
  const prose = text.replace(/```[\s\S]*?```|`[^`\n]*`/g, (m) => m.replace(/[^\n]/g, " "));
  const unquoted = prose.replace(/"[^"\n]{1,200}"|\u201c[^\u201d\n]{1,200}\u201d/g, (m) => m.replace(/[^\n]/g, " "));
  for (const pattern of BANNED) {
    const scope = pattern === BANNED.at(-1) ? unquoted : prose;
    for (const m of scope.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))) add(m.index, `voice: "${m[0]}" (shared/WRITING.md delete-on-sight; em dashes are not used outside quoted copy)`);
  }
  const secret = SECRETS.exec(text);
  if (secret) add(secret.index, "text looks like a credential or key; remove it");
  return problems.sort((a, b) => a.line - b.line);
}

// Returns [{ line, message }] for the page at `file`; media paths resolve against the page's directory.
export function check(html, file) {
  const problems = [];
  const add = (index, message) => problems.push({ line: html.slice(0, index).split("\n").length, message });
  if (crypto.createHash("sha256").update(styleFile).digest("hex") !== STYLE_SHA256) {
    add(0, "references/style.css differs from the skill's published style; change it in the skill repository with its pin in scripts/page.mjs, never in an installed copy");
  }
  const shared = STYLE_BLOCK.exec(html);
  if (!shared) add(0, STYLE_OPEN.test(html) ? ENDLESS : "missing <style data-explain> block; start the page with `page.mjs start <persona>`");
  else if (holdsMarkup(shared[1])) add(shared.index, ENDLESS);
  else if (shared[1].trim() !== STYLE) add(shared.index, "shared style differs from references/style.css; run `page.mjs inline` instead of editing the page's style");
  // Blank the shared style so its CSS is not read as page content; offsets and line numbers stay put.
  const body = shared ? html.replace(STYLE_BLOCK, blank) : html;
  for (const m of body.matchAll(/<!--\s*guide:/g)) add(m.index, "template guide comment left in the page");

  const tags = tokenize(body);
  const notProse = []; // code, exact quotes and markup: not the page's own words
  const notSlot = []; // code longer than one {placeholder}: braces there are code
  const keep = []; // alt, aria-label and title values are prose
  let main = null;
  const sections = []; // every data-section element, in page order
  let footer = null;
  let media = 0;
  let rows = 0;
  let inHead = 0;
  const dir = path.dirname(path.resolve(file));
  tags.forEach((tag, n) => {
    notProse.push([tag.index, tag.end]);
    // A header ends at </thead>, at the first <tbody>, or with its table, as the browser closes it.
    if (tag.name === "thead") inHead = tag.close ? 0 : 1;
    if ((tag.name === "tbody" && !tag.close) || (tag.name === "table" && tag.close)) inHead = 0;
    if (tag.close) return;
    if (tag.name === "tr" && inHead === 0) rows += 1;
    if (!ELEMENTS.has(tag.name)) add(tag.index, `<${tag.name}> is not an element the templates use; pages take their layout from the shared style and stay static`);
    for (const [name, { value, index }] of tag.attrs) {
      if (!ATTRIBUTES.has(name) && !(SIZED.has(tag.name) && (name === "width" || name === "height"))) add(tag.index, `attribute "${name}" on <${tag.name}> is not allowed; pages take their look from the shared style and stay static`);
      else if (PAINT.has(name) && !/^(none|currentcolor)$/i.test(value.trim())) add(tag.index, `${name}="${value}" on <${tag.name}>; paint with currentColor or none and set the color with a tone-* class`);
      else if (PROSE_ATTRS.has(name)) keep.push([index, value]);
    }
    // Links go to a web page, an email address, an anchor or a relative file; nothing that could hide another scheme.
    const href = tag.attrs.get("href")?.value.trim();
    if (href !== undefined && !/^(https?:\/\/|mailto:)/i.test(href) && /[:&\s\x00-\x1f]/.test(href.split(/[/?#]/)[0])) add(tag.index, `href="${href}" is not an http(s), mailto, anchor or relative link`);
    const classes = (tag.attrs.get("class")?.value ?? "").split(/\s+/).filter(Boolean);
    for (const name of classes) if (!CLASSES.has(name)) add(tag.index, `class "${name}" is not in the shared style`);
    // Mermaid source is checked for style overrides and its labels are prose; other code and exact quotes are not prose.
    const mermaid = tag.name === "pre" && classes.includes("mermaid");
    const quoted = (["pre", "code", "q"].includes(tag.name) && !mermaid) || classes.includes("quote");
    if (mermaid) {
      const end = closing(tags, n);
      const source = body.slice(tag.end, end?.index ?? body.length);
      const override = mermaidOverride(source);
      if (override) add(tag.index, `Mermaid "${override}" overrides the host's theme; no style statements, theme config or colors, and mark a step in its label text instead`);
      // Braces in a diagram are node shapes, unless the whole body is one unfilled placeholder.
      if (end && !/^\s*\{[a-z][a-z0-9_]*\}\s*$/.test(source)) notSlot.push([tag.end, end.index]);
    }
    const isFooter = tag.attrs.get("id")?.value === "about-evidence";
    const end = quoted || isFooter ? closing(tags, n) : null;
    if (quoted && end) {
      notProse.push([tag.end, end.index]);
      const text = body.slice(tag.end, end.index).replace(/<[^>]*>/g, "").trim();
      if ((tag.name === "pre" || tag.name === "code") && !/^\{[a-z][a-z0-9_]*\}$/.test(text)) notSlot.push([tag.end, end.index]);
    }
    if (isFooter) footer = { tag, end };
    if (tag.name === "main") main = { index: tag.index, value: tag.attrs.get("data-persona")?.value, end: closing(tags, n)?.index ?? body.length };
    const section = tag.attrs.get("data-section")?.value;
    if (section !== undefined) sections.push({ id: section, index: tag.index, end: closing(tags, n)?.end ?? body.length });
    if (tag.name === "use" && !/^#[\w-]+$/.test(tag.attrs.get("href")?.value ?? "")) add(tag.index, "<use> may only reference a shape on this page (#id)");
    if (tag.name === "svg") {
      const width = Number((tag.attrs.get("viewbox")?.value ?? "").trim().split(/[\s,]+/)[2]);
      if (!(width >= 480)) add(tag.index, "svg viewBox needs a width of at least 480 so its 12 px labels stay readable at every screen size");
      if (tag.attrs.get("role")?.value !== "img" || !tag.attrs.get("aria-label")?.value.trim()) add(tag.index, 'svg needs role="img" and an aria-label saying what it shows');
      if (!classes.includes("diagram")) add(tag.index, 'svg needs class "diagram" so the shared style sizes and colors it');
      if (tag.attrs.has("transform")) add(tag.index, "transform on <svg> moves the drawing off the page; transform a <g> inside it");
    }
    if (!MEDIA.has(tag.name)) return;
    if (tag.name === "img" || tag.name === "video") media += 1;
    if (tag.name === "img" && !tag.attrs.get("alt")?.value.trim()) add(tag.index, "image without alt text describing what is on screen");
    if (tag.name === "video" && !tag.attrs.get("aria-label")?.value.trim()) add(tag.index, "video without aria-label describing what it shows");
    for (const name of ["src", "poster"]) {
      const src = tag.attrs.get(name)?.value;
      if (!src) continue;
      if (/^\s*data:/i.test(src)) {
        add(tag.index, `${name} is a data: URI; save the real file in media/ so it can be opened and checked`);
        continue;
      }
      if (/^\s*([a-z][a-z0-9+.-]*:|\/)/i.test(src)) {
        add(tag.index, `${name}="${src}" is not a relative path; copy the file into media/ beside the page`);
        continue;
      }
      let target;
      try {
        target = path.resolve(dir, decodeURI(src.split(/[?#]/)[0]));
      } catch {
        add(tag.index, `${name}="${src}" is not a valid URL path`);
        continue;
      }
      if (!target.startsWith(dir + path.sep)) add(tag.index, `${name}="${src}" leaves the page directory`);
      else if (!fs.existsSync(target)) add(tag.index, `${name}="${src}" does not exist`);
      else if (fs.statSync(target).size > MAX_MEDIA_BYTES) add(tag.index, `${name}="${src}" is over 15 MB`);
    }
  });

  const slots = blankRanges(body.replace(COMMENT, blank), notSlot);
  for (const m of slots.matchAll(/(?<!\$)\{([a-z][a-z0-9_]*)\}/g)) if (PLACEHOLDERS.has(m[1])) add(m.index, `unfilled placeholder ${m[0]}`);

  const title = /<title>([^<]*)<\/title>/.exec(body);
  const words = title?.[1].trim().split(/\s+/).filter(Boolean).length ?? 0;
  if (!title || words === 0) add(0, "missing <title>");
  else if (words > 6) add(title.index, `title has ${words} words; name the page in six or fewer, two to four reads best`);
  if (!footer) add(0, 'missing the id="about-evidence" fine print: what is real, what was set up, what is not shown');
  else {
    const text = body.slice(footer.tag.end, footer.end?.index ?? body.length).replace(/<[^>]*>/g, " ").trim();
    if (text.split(/\s+/).filter(Boolean).length < 8) add(footer.tag.index, "about-evidence fine print is empty; say what is real, what was set up and what is not shown");
  }
  // Everything but the title and <main> sits inside a section, so the persona's list is the whole page.
  const inSection = (index) => sections.some((s) => s.index <= index && index < s.end);
  let stray = 0;
  let titleSpan = [0, 0];
  tags.forEach((tag, n) => {
    if (tag.close || tag.index < stray || inSection(tag.index)) return;
    if (tag.name === "title") titleSpan = [tag.index, closing(tags, n)?.end ?? tag.end];
    if (tag.name === "title" || tag.name === "main") return;
    add(tag.index, `<${tag.name}> sits outside every section; put it inside one the persona lists`);
    stray = closing(tags, n)?.end ?? tag.end;
  });
  const loose = /\S/.exec(blankRanges(body.replace(COMMENT, blank), [titleSpan, ...sections.map((s) => [s.index, s.end])]).replace(/<[^>]*>/g, blank));
  if (loose) add(loose.index, "text sits outside every section; put it inside one the persona lists");
  // The persona file decides which sections the page shows, in what order, its limits and the words it avoids.
  const persona = PERSONAS.includes(main?.value) ? readPersona(main.value) : null;
  if (!persona) add(main?.index ?? 0, `<main> needs data-persona set to one of ${PERSONAS.join(", ")} (a file in personas/)`);
  else {
    for (const problem of persona.problems) add(main.index, `personas/${persona.name}.md: ${problem}`);
    const order = persona.sections.map((s) => s.id);
    let at = 0;
    for (const s of sections) {
      if (!SECTIONS.includes(s.id)) add(s.index, `data-section="${s.id}" is not in the section menu (personas/README.md)`);
      else if (!order.includes(s.id)) add(s.index, `section "${s.id}" is not in personas/${persona.name}.md; show only the sections it lists`);
      // Banner parts sit inside another section and keep their place there; page-level sections follow the persona's order.
      else if (!sections.some((o) => o.index < s.index && s.end <= o.end)) {
        if (order.indexOf(s.id) < at) add(s.index, `section "${s.id}" is out of order; personas/${persona.name}.md lists ${order.join(", ")}`);
        at = Math.max(at, order.indexOf(s.id));
      }
    }
    for (const s of persona.sections) {
      if (!s.optional && !sections.some((o) => o.id === s.id)) add(main.index, `section "${s.id}" is missing; personas/${persona.name}.md does not mark it optional`);
    }
    if (rows > (persona.limits.rows ?? Infinity)) add(main.index, `${persona.name} page has ${rows} table rows; personas/${persona.name}.md allows ${persona.limits.rows}`);
    if (media > (persona.limits.media ?? Infinity)) add(main.index, `${persona.name} page has ${media} pictures or videos; personas/${persona.name}.md allows ${persona.limits.media}`);
  }
  if (Buffer.byteLength(html) > MAX_PAGE_BYTES) add(0, "page is over 16 MB");

  let prose = blankRanges(body.replace(COMMENT, blank), notProse);
  for (const [index, value] of keep) prose = prose.slice(0, index) + value + prose.slice(index + value.length);
  for (const pattern of BANNED) {
    for (const m of prose.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))) add(m.index, `voice: "${m[0]}" (shared/WRITING.md delete-on-sight; em dashes are not used outside exact quotes)`);
  }
  // The persona's own words to avoid, outside exact quotes, code and the evidence footer.
  const own = footer ? blankRanges(prose, [[footer.tag.index, footer.end?.end ?? body.length]]) : prose;
  for (const word of persona?.avoid ?? []) {
    // The word as listed or with a plural ending: commit, commits; branch, branches.
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+").replaceAll("'", "(?:['\u2019]|&rsquo;|&#8217;|&#x2019;)");
    const pattern = new RegExp(`(?<![\\w-])${escaped}(?:e?s)?(?![\\w-])`, "gi");
    for (const m of own.matchAll(pattern)) add(m.index, `"${m[0]}" is in personas/${persona.name}.md Words to avoid; say it the way this reader would`);
  }
  const secret = SECRETS.exec(body);
  if (secret) add(secret.index, "text looks like a credential or key; remove it");
  return problems.sort((a, b) => a.line - b.line);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const [verb, ...args] = process.argv.slice(2);
  if (verb === "start" && args.length === 2) {
    const [name, out] = args;
    if (fs.existsSync(out)) {
      console.error(`${out} exists; start writes a new page and never overwrites one`);
      process.exit(1);
    }
    try {
      fs.writeFileSync(out, start(name));
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
    console.log(`wrote ${out} for personas/${name}.md`);
    process.exit(0);
  }
  const file = args[0];
  if (!["inline", "check", "standalone"].includes(verb) || !file || (verb !== "check" && args.length > 1)) {
    console.error("usage: page.mjs start <persona> <page.html> | inline|standalone <page.html> | check <page.html|slack.md>...");
    process.exit(2);
  }
  if (verb === "check") {
    let failed = false;
    for (const each of args) {
      if (!fs.existsSync(each)) {
        console.error(`${each}: missing`);
        failed = true;
        continue;
      }
      let text = fs.readFileSync(each, "utf8");
      // A shared style block that was retyped or trimmed is restored, not reported: it is never the writer's to change.
      const block = /\.md$/i.test(each) ? null : STYLE_BLOCK.exec(text);
      // Only a block of plain CSS: one that holds markup lost its end tag, and rewriting it would drop page content.
      if (block && block[1].trim() !== STYLE && !holdsMarkup(block[1])) {
        text = inline(text);
        fs.writeFileSync(each, text);
        console.log(`${each}: restored the shared style block from references/style.css`);
      }
      const problems = /\.md$/i.test(each) ? checkText(text) : check(text, each);
      for (const p of problems) console.error(`${each}:${p.line}: ${p.message}`);
      if (problems.length) failed = true;
      else console.log(`ok: ${each}`);
    }
    process.exit(failed ? 1 : 0);
  }
  const html = fs.readFileSync(file, "utf8");
  if (verb === "inline") {
    try {
      fs.writeFileSync(file, inline(html));
    } catch (error) {
      console.error(`${file}: ${error.message}`);
      process.exit(1);
    }
    console.log(`inlined shared style into ${file}`);
  } else if (verb === "standalone") {
    const out = file.replace(/\.html$/i, "") + ".standalone.html";
    fs.writeFileSync(out, standalone(html));
    console.log(`wrote ${out}`);
  }
}
