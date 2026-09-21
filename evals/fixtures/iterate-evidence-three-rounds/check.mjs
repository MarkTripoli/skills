import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.argv[2];
if (!url) throw new Error("Usage: node check.mjs URL");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url);
  for (const counter of ["A", "B", "C", "D"]) {
    await page.locator(`#add-${counter}`).click();
    assert.ok(Number(await page.locator(`#count-${counter}`).textContent()) > 0, `Counter ${counter}: Add one produces a positive count`);
  }
  console.log("Counter checks passed");
} finally {
  await browser.close();
}
