#!/usr/bin/env node
// Checks that every link in an RFC answers.
// Usage: node check-links.mjs <rfc.md>
// Prints one `<file>:<line>: dead-link: <status> <url>` per link that fails and one
// `<file>:<line>: login: <url>` per link behind a sign-in, which a person opens by hand.
// Exits 1 when a link is dead, 2 on a usage error, 0 otherwise.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Hosts of common workspace tools whose pages answer only after a sign-in, so a script cannot check them;
// a person opens these by hand. Any other host that redirects to a sign-in page is caught in status() below.
const LOGIN_HOSTS = /(^|\.)(notion\.so|notion\.com|slack\.com|atlassian\.net|docs\.google\.com|drive\.google\.com)$/i;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
};

// Returns [{ url, line }] for each distinct link, with trailing punctuation removed.
export function extractLinks(text) {
  const seen = new Map();
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/https?:\/\/[^\s<>()`"|\]]+/g)) {
      const url = m[0].replace(/[.,;:!?'*_]+$/, "");
      if (!seen.has(url)) seen.set(url, i + 1);
    }
  });
  return [...seen].map(([url, line]) => ({ url, line }));
}

export const needsLogin = (url) => LOGIN_HOSTS.test(new URL(url).hostname);

async function status(url) {
  for (const method of ["HEAD", "GET"]) {
    try {
      const res = await fetch(url, { method, headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(20000) });
      if (res.ok && /\/(users\/)?sign_?in\b|\/login\b/i.test(new URL(res.url).pathname)) return "login";
      if (res.ok) return res.status;
      if (method === "GET") return res.status;
    } catch (err) {
      if (method === "GET") return err.name === "TimeoutError" ? "timeout" : "no answer";
    }
  }
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error(`check-links: ${file ? `no file at ${file}` : "no file given"}\nUsage: node check-links.mjs <rfc.md>`);
    process.exit(2);
  }
  const links = extractLinks(fs.readFileSync(file, "utf8"));
  let dead = 0;
  const results = await Promise.all(links.map(async (l) => ({ ...l, login: needsLogin(l.url), code: needsLogin(l.url) ? null : await status(l.url) })));
  for (const r of results) {
    if (r.code === "login") r.login = true;
    if (r.login) console.log(`${file}:${r.line}: login: ${r.url}`);
    else if (typeof r.code !== "number" || r.code >= 400) {
      dead++;
      console.log(`${file}:${r.line}: dead-link: ${r.code} ${r.url}`);
    }
  }
  console.log(`${file}: ${links.length} links, ${dead} dead, ${results.filter((r) => r.login).length} behind a login`);
  process.exit(dead ? 1 : 0);
}
