#!/usr/bin/env node
// Open a URL in headless Chromium through Playwright, run a JSON action list, and print the page's text
// snapshot after each action as JSON on stdout.
// Usage: node snapshot.mjs <url> [--actions <file.json>] [--screenshots <dir>]
// Exit 2 on bad arguments, 3 when Playwright is missing (stderr names the install command), 1 on a launch failure.
// SNAPSHOT_PLAYWRIGHT overrides the module name (tests point it at a stub).

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const INSTALL = "Playwright is not installed. Install it outside the project: P=$(mktemp -d) && echo \"$P\" && npm install --prefix \"$P\" playwright && \"$P/node_modules/.bin/playwright\" install chromium; then rerun with NODE_PATH=<printed directory>/node_modules (use the printed directory, not $P)";
const USAGE = "usage: snapshot.mjs <url> [--actions <file.json>] [--screenshots <dir>]";

function die(code, message) {
  console.error(message);
  process.exit(code);
}

function option(args, name) {
  const at = args.indexOf(name);
  return at === -1 ? null : args[at + 1] ?? die(2, USAGE);
}

function loadPlaywright() {
  const names = process.env.SNAPSHOT_PLAYWRIGHT ? [process.env.SNAPSHOT_PLAYWRIGHT] : ["playwright", "@playwright/test"];
  // Resolve from the project first (the caller's cwd), then from this script.
  for (const base of [path.join(process.cwd(), "noop.js"), import.meta.url]) {
    const require = createRequire(base);
    for (const name of names) {
      try {
        const loaded = require(name);
        if (!loaded.chromium) continue;
        // Locator.ariaSnapshot needs Playwright 1.49; skip an older copy and try the next base.
        let version = "";
        try { version = require(`${name}/package.json`).version; } catch {}
        const [major, minor] = version.split(".").map(Number);
        if (version && (major < 1 || (major === 1 && minor < 49))) continue;
        return loaded;
      } catch {}
    }
  }
  return die(3, INSTALL);
}

const args = process.argv.slice(2);
const url = args[0];
if (!url || url.startsWith("--")) die(2, USAGE);
const actionsFile = option(args, "--actions");
const shots = option(args, "--screenshots");
let actions = [];
if (actionsFile) {
  try {
    actions = JSON.parse(fs.readFileSync(actionsFile, "utf8"));
    if (!Array.isArray(actions)) throw new Error("not a list");
  } catch (error) {
    die(2, `--actions ${actionsFile}: ${error.message}; expected a JSON list of {action, ...}`);
  }
}

const { chromium } = loadPlaywright();
let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  die(1, `Chromium would not launch (${error.message.split("\n")[0]}); run: npx playwright install chromium`);
}
const page = await browser.newPage();
const snapshot = () => page.locator("body").ariaSnapshot();
const capture = async entry => {
  try { entry.snapshot = await snapshot(); } catch (error) { entry.snapshot_error = error.message.split("\n")[0]; }
};
const out = [];
try {
  await page.goto(url);
  const first = { step: 0, action: "open" };
  await capture(first);
  out.push(first);
  for (const [index, item] of actions.entries()) {
    const entry = { step: index + 1, action: item.action };
    try {
      if (item.action === "click") await page.click(item.selector);
      else if (item.action === "fill") await page.fill(item.selector, item.text ?? "");
      else if (item.action === "press") await page.keyboard.press(item.key);
      else if (item.action === "wait") await page.waitForLoadState("networkidle");
      else if (item.action === "screenshot") {
        if (!shots) throw new Error("screenshot needs --screenshots <dir>");
        fs.mkdirSync(shots, { recursive: true });
        await page.screenshot({ path: path.join(shots, `${item.name ?? `step-${index + 1}`}.png`) });
      } else throw new Error(`unknown action ${item.action}`);
    } catch (error) {
      entry.error = error.message.split("\n")[0];
    }
    await capture(entry);
    out.push(entry);
  }
} finally {
  await browser.close().catch(() => {});
  console.log(JSON.stringify(out, null, 2));
}
