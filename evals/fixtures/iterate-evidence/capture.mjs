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
// The continuation evaluator pauses only this capture entry, before any new video starts.
const pauseFile = process.env.ITERATE_EVIDENCE_CAPTURE_PAUSE;
if (pauseFile && fs.existsSync(pauseFile)) {
  const pause = JSON.parse(fs.readFileSync(pauseFile, "utf8"));
  const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (hash(path.join(pause.repo, "app.js")) !== pause.appSha256 && hash(path.join(pause.repo, "check.mjs")) !== pause.checkSha256 && !fs.existsSync(`${pauseFile}.released`)) {
    fs.writeFileSync(`${pauseFile}.waiting`, JSON.stringify({ session, pid: process.pid, at: new Date().toISOString() }));
    while (!fs.existsSync(`${pauseFile}.released`)) await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
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
  // recordVideo starts asynchronously. Wait for a real frame from this navigation,
  // not merely a loaded DOM or a fixed delay, before changing the visible state.
  let navigationStartedAt = Infinity;
  let resolveInitialFrame;
  const initialFrame = new Promise((resolve) => { resolveInitialFrame = resolve; });
  await page.screencast.start({ onFrame: ({ timestamp }) => {
    if (timestamp >= navigationStartedAt) resolveInitialFrame();
  } });
  navigationStartedAt = Date.now();
  await page.goto(url);
  const served = await (await servedResponse).body();
  fs.writeFileSync(path.join(session, "served-app.js"), served);
  await page.screenshot();
  let frameTimeout;
  try {
    await Promise.race([
      initialFrame,
      new Promise((_, reject) => {
        frameTimeout = setTimeout(() => reject(new Error("No post-navigation video frame before initial interaction")), 10000);
      }),
    ]);
  } finally {
    clearTimeout(frameTimeout);
    // This removes only the observation client; recordVideo continues unchanged.
    await page.screencast.stop();
  }
  const actions = [];
  const mark = (flow) => actions.push({ flow, wallTime: Date.now() / 1000, videoTime: Date.now() / 1000 - startedAt });
  annotate("--type", "setup", "--message", "Fresh counter page at 1280 by 720");
  await page.waitForTimeout(1000);
  mark("initial");
  annotate("--type", "test_start", "--message", "One Add one activation from zero");
  await page.getByRole("button", { name: "Add one", exact: true }).click();
  await page.waitForTimeout(1000);
  mark("increment");
  annotate("--type", "assertion", "--result", "untested", "--message", "Recorded increment state; pixel inspection pending");
  await page.waitForTimeout(1000);
  annotate("--type", "test_start", "--message", "Reset from the current nonzero count");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.waitForTimeout(1000);
  mark("reset");
  annotate("--type", "assertion", "--result", "untested", "--message", "Recorded Reset state; pixel inspection pending");
  await page.waitForTimeout(1000);
  const video = page.video();
  await context.close();
  context = null;
  const videoPath = await video.path();
  const capture = { url, startedAt, finishedAt: Date.now() / 1000, viewport: { width: 1280, height: 720 }, browserVersion: browser.version(), actions, servedScript: "served-app.js", servedSha256: sha256(served), video: path.relative(session, videoPath), videoSha256: sha256(fs.readFileSync(videoPath)), timingCaveat: "Action samples use wall clock relative to page creation; inspect recorder alignment and raw pixels, not timestamps alone." };
  fs.writeFileSync(path.join(session, "capture.json"), `${JSON.stringify(capture, null, 2)}\n`);
  console.log(JSON.stringify({ session, video: videoPath, capture: path.join(session, "capture.json"), startedAt, actions }));
} finally {
  if (context) await context.close();
  await browser.close();
}
