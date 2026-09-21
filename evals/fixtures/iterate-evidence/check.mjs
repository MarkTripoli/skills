import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.argv[2];
if (!url) throw new Error("Usage: node check.mjs URL");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url);
  await page.getByRole("button", { name: "Add one", exact: true }).click();
  assert.ok(Number(await page.locator("#count").textContent()) > 0, "Add one produces a positive count");
  console.log("Counter check passed");
} finally {
  await browser.close();
}
