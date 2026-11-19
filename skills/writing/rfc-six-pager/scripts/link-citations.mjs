#!/usr/bin/env node
// Prints the RFC with each citation number linked to its source's first URL, for a published copy.
// Usage: node link-citations.mjs <rfc.md>
// "[4, 7]" becomes "[[4](https://a), [7](https://b)]". A source without a URL, or with an internal one such as
// a page in a workspace tool behind a sign-in, stays a plain number: the published RFC links only to external sources.
// The Sources section and code fences are left as they are; the working copy keeps plain [n] for check-rfc.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { needsLogin } from "./check-links.mjs";

export function sourceUrls(text) {
  const m = text.match(/^## Sources\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m);
  const urls = new Map();
  if (!m) return urls;
  for (const line of m[1].split("\n")) {
    const item = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (!item) continue;
    const url = item[2].match(/https?:\/\/[^\s,)\]]+/);
    if (url && !needsLogin(url[0])) urls.set(item[1], url[0]);
  }
  return urls;
}

export function linkCitations(text) {
  const urls = sourceUrls(text);
  let fenced = false;
  let inSources = false;
  return text.split("\n").map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return line; }
    if (/^## /.test(line)) inSources = /^## Sources\s*$/.test(line);
    if (fenced || inSources) return line;
    return line.replace(/\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g, (whole, list) =>
      `[${list.split(/\s*,\s*/).map((n) => (urls.has(n) ? `[${n}](${urls.get(n)})` : n)).join(", ")}]`);
  }).join("\n");
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error(`link-citations: no RFC at ${file ?? "(none)"}\nUsage: node link-citations.mjs <rfc.md>`);
    process.exit(2);
  }
  process.stdout.write(linkCitations(fs.readFileSync(file, "utf8")));
}
