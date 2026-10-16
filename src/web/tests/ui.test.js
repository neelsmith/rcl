// Browser test of the built page (dist/index.html) using Playwright.
// Skipped automatically when Playwright or the built page is unavailable.
//   python3 src/build_web.py && node --test src/web/tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const PAGE = path.join(__dirname, "..", "..", "..", "dist", "index.html");
let playwright = null;
try { playwright = require("playwright"); } catch (e) { /* not installed */ }
const skip = !playwright ? "playwright not installed" : !fs.existsSync(PAGE) ? "run python3 src/build_web.py first" : false;

test("calendar and readings UI", { skip }, async (t) => {
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const url = pathToFileURL(PAGE).href;
  const dn = (iso) => page.evaluate((s) => RCL.parseIsoDate(s), iso);
  try {
    await t.test("defaults to today", async () => {
      await page.goto(url);
      const today = await page.evaluate(() => {
        const d = new Date();
        return RCL.isoDate(RCL.dayNumber(d.getFullYear(), d.getMonth() + 1, d.getDate()));
      });
      assert.equal(await page.inputValue("#date-input"), today);
      assert.equal(await page.locator(".day.selected").count(), 1);
    });

    await t.test("a Sunday shows both tracks and a transferred feast", async () => {
      await page.goto(url + "#2026-10-18");
      assert.equal(await page.innerText("#month-title"), "October 2026");
      assert.match(await page.innerText("#readings h3"), /Proper 24/);
      const text = await page.innerText("#readings");
      assert.match(text, /Track 1/);
      assert.match(text, /Exodus 33:12-23/);
      assert.match(text, /Isaiah 45:1-7/);
      assert.match(text, /St\. Luke is transferred to Monday, October 19/);
    });

    await t.test("Sundays and feasts are labelled in the calendar", async () => {
      const sunday = page.locator(`[data-dn="${await dn("2026-10-25")}"]`);
      assert.match(await sunday.getAttribute("class"), /\bsunday\b/);
      assert.equal(await sunday.locator(".lab").innerText(), "Proper 25");
      const feast = page.locator(`[data-dn="${await dn("2026-10-28")}"]`);
      assert.match(await feast.getAttribute("class"), /\bmajorfeast\b/);
    });

    await t.test("clicking a day selects it", async () => {
      await page.click(`[data-dn="${await dn("2026-10-19")}"]`);
      assert.equal(await page.evaluate(() => location.hash), "#2026-10-19");
      assert.match(await page.innerText("#readings h3"), /Saint Luke/);
      assert.match(await page.innerText("#readings"), /Transferred from Sunday, October 18/);
    });

    await t.test("arrow keys move the selection", async () => {
      await page.keyboard.press("ArrowRight");
      assert.equal(await page.evaluate(() => location.hash), "#2026-10-20");
      await page.keyboard.press("ArrowUp");
      assert.equal(await page.evaluate(() => location.hash), "#2026-10-13");
    });

    await t.test("a day without readings offers the next one", async () => {
      assert.match(await page.innerText("#readings"), /No Sunday or Major Holy Day readings/);
      await page.click("#readings .linkish");
      assert.equal(await page.evaluate(() => location.hash), "#2026-10-18");
    });

    await t.test("month navigation and date input", async () => {
      await page.click("#next");
      assert.equal(await page.innerText("#month-title"), "November 2026");
      await page.fill("#date-input", "2026-12-25");
      await page.dispatchEvent("#date-input", "change");
      assert.equal(await page.locator("#readings .service").count(), 3);
    });

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
