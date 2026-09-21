// Fixed interactions only. The subject owns recorder sessions, inspection, and conclusions.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const [url, directory] = process.argv.slice(2);
const evidence = process.env.EVIDENCE;
if (!url || !directory || !evidence) throw new Error("Usage: EVIDENCE=/path/evidence.py node capture.mjs URL SESSION");
const session = path.resolve(directory);
if (!fs.existsSync(session)) throw new Error("Start an external recorder session before capture");
if (fs.existsSync(path.join(session, "capture.json"))) throw new Error("Use a distinct recorder session for every capture");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const annotate = (...args) => execFileSync("python3", [evidence, "annotate", session, ...args], { encoding: "utf8" });
const browser = await chromium.launch();
let context;
try {
  context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: path.join(session, "video"), size: { width: 1280, height: 720 } } });
  const startedAt = Date.now() / 1000;
  const page = await context.newPage();
  fs.writeFileSync(path.join(session, "video-started-at"), String(startedAt));
  const servedResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/app.js");
  await page.goto(url);
  const served = await (await servedResponse).body();
  fs.writeFileSync(path.join(session, "served-app.js"), served);
  // Flush the initial paint before interactions; short captures otherwise lost this prefix.
  await page.screenshot();
  const actions = [];
  const mark = (flow) => actions.push({ flow, wallTime: Date.now() / 1000, videoTime: Date.now() / 1000 - startedAt });
  annotate("--type", "setup", "--message", "Fresh counters A-D at 1280 by 720");
  await page.waitForTimeout(3000);
  mark("initial");
  await page.waitForTimeout(1000); // hold initial-zero state for clean video frames before the first click
  for (const counter of ["A", "B", "C", "D"]) {
    annotate("--type", "test_start", "--message", `${counter}-increment: Add one from zero`);
    await page.locator(`#add-${counter}`).click();
    await page.waitForTimeout(1000);
    mark(`${counter}-increment`);
    annotate("--type", "assertion", "--result", "untested", "--message", `${counter}-increment recorded; pixel inspection pending`);
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(3000);
  for (const counter of ["A", "B", "C", "D"]) {
    annotate("--type", "test_start", "--message", `${counter}-reset: Reset from the current nonzero count`);
    await page.locator(`#reset-${counter}`).click();
    await page.waitForTimeout(1000);
    mark(`${counter}-reset`);
    annotate("--type", "assertion", "--result", "untested", "--message", `${counter}-reset recorded; pixel inspection pending`);
    await page.waitForTimeout(1000);
  }
  const video = page.video();
  await context.close();
  context = null;
  const videoPath = await video.path();
  const capture = { url, startedAt, startedAtMeaning: "Unix seconds sampled immediately before context.newPage(); capture reference only, not navigation time or first encoded video frame.", finishedAt: Date.now() / 1000, viewport: { width: 1280, height: 720 }, browserVersion: browser.version(), actions, servedScript: "served-app.js", servedSha256: sha256(served), video: path.relative(session, videoPath), videoSha256: sha256(fs.readFileSync(videoPath)), timingCaveat: "Action wallTime records the named mark() sample; videoTime is elapsed wall clock from startedAt, not a measured media coordinate. Exact navigation and first encoded-frame times are not retained. Inspect recorder alignment and raw pixels." };
  fs.writeFileSync(path.join(session, "capture.json"), `${JSON.stringify(capture, null, 2)}\n`);
  console.log(JSON.stringify({ session, video: videoPath, capture: path.join(session, "capture.json"), startedAt, startedAtMeaning: capture.startedAtMeaning, actions }));
} finally {
  if (context) await context.close();
  await browser.close();
}
