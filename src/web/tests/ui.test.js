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

    await t.test("shows the version in the footer", async () => {
      const meta = await page.getAttribute('meta[name="version"]', "content");
      assert.match(meta, /^\d+\.\d+\.\d+/);
      assert.equal(await page.innerText("#app-version"), "v" + meta);
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

    await t.test("OT references show the chosen versions", async () => {
      await page.goto(url + "#2026-10-18");
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      // NT references are plain text; OT references are buttons.
      assert.equal(await page.locator('button.cite:has-text("Thessalonians")').count(), 0);
      const psalm = page.locator('button.cite:has-text("Psalm 99")');
      await psalm.click();
      assert.match(await page.innerText(".texts"), /Choose one or more versions/);
      await page.check("#ver-septuagint");
      await page.check("#ver-masoretic");
      // the open reference stays open when versions change
      assert.equal(await page.locator(".texts .vtext").count(), 2);
      assert.match(await page.innerText('.vtext[data-version="septuagint"] h5'), /Psalm 98:1/);
      assert.match(await page.innerText('.vtext[data-version="septuagint"]'), /numbered 98/);
      assert.equal(await page.getAttribute('.vtext[data-version="masoretic"] .vbody', "dir"), "rtl");
      await page.locator('button.cite:has-text("Psalm 99")').click();
      assert.equal(await page.locator(".texts").count(), 0);
      // the choice of versions is remembered
      await page.reload();
      assert.equal(await page.locator("#ver-septuagint").count(), 0); // chooser lives in the text panel
      await page.locator('button.cite:has-text("Exodus 33:12-23")').click();
      assert.equal(await page.isChecked("#ver-septuagint"), true);
      assert.match(await page.innerText('.vtext[data-version="septuagint"] h5'), /Exodus 33:12-23/);
    });

    await t.test("texts open in a full-width panel below calendar and readings", async () => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(url + "#2026-10-18");
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      assert.equal(await page.isHidden("#texts"), true);
      assert.match(await page.innerText("#readings"), /Click an underlined Old Testament reference/);
      await page.locator('button.cite:has-text("Exodus 33:12-23")').click();
      assert.equal(await page.isVisible("#texts"), true);
      assert.match(await page.innerText("#texts"), /Choose one or more versions/);
      await page.check("#texts #ver-vulgate");
      assert.equal(await page.evaluate(() => document.activeElement.id), "ver-vulgate");
      const cal = await page.locator(".calendar").boundingBox();
      const rd = await page.locator("#readings").boundingBox();
      const tx = await page.locator("#texts").boundingBox();
      assert.ok(Math.abs(cal.y - rd.y) < 2, "calendar and readings side by side");
      assert.ok(tx.y >= Math.max(cal.y + cal.height, rd.y + rd.height), "texts below both");
      assert.ok(Math.abs(tx.x - cal.x) < 2 && Math.abs(tx.x + tx.width - (rd.x + rd.width)) < 2, "texts span the page");
      assert.match(await page.innerText("#texts h2"), /Exodus 33:12-23/);
      assert.match(await page.innerText("#texts .texts-head .meta"), /Proper 24 · First reading · Track 1/);
      // re-rendering for a new version keeps it open; changing the date closes it
      await page.check("#ver-septuagint");
      assert.equal(await page.locator("#texts .vtext").count(), 2);
      await page.click('#texts button[aria-label="Close text"]');
      assert.equal(await page.isHidden("#texts"), true);
      assert.equal(await page.locator(".cite[aria-expanded=true]").count(), 0);
      await page.locator('button.cite:has-text("Psalm 99")').click();
      await page.fill("#date-input", "2026-10-25");
      await page.dispatchEvent("#date-input", "change");
      assert.equal(await page.isHidden("#texts"), true);
    });

    await t.test("the calendar folds to a slim bar and stays folded", async () => {
      await page.goto(url + "#2026-10-18");
      assert.equal(await page.isVisible("#grid"), true);
      const before = (await page.locator(".calendar").boundingBox()).height;
      await page.click("#cal-fold");
      assert.equal(await page.isHidden("#grid"), true);
      assert.equal(await page.innerText("#cal-fold"), "Show calendar");
      assert.match(await page.innerText("#month-title"), /Sunday, October 18, 2026/);
      const cal = await page.locator(".calendar").boundingBox();
      const rd = await page.locator("#readings").boundingBox();
      assert.ok(cal.height < before / 3, "folded calendar is short");
      assert.ok(rd.y > cal.y + cal.height - 1 && Math.abs(rd.width - cal.width) < 2, "readings full width below");
      // the date can still be changed while folded
      await page.click("#today");
      await page.reload();
      assert.equal(await page.isHidden("#grid"), true);
      await page.click("#cal-fold");
      assert.equal(await page.isVisible("#grid"), true);
      assert.equal(await page.getAttribute("#cal-fold", "aria-expanded"), "true");
      await page.reload();
      assert.equal(await page.isVisible("#grid"), true);
    });

    await t.test("psalm recordings are off until a music folder is chosen", async () => {
      const os = require("node:os");
      // A tiny valid WAV file, saved under the mapped names for Psalms 96 and 99.
      const wav = (() => {
        const n = 800, b = Buffer.alloc(44 + n);
        b.write("RIFF", 0); b.writeUInt32LE(36 + n, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16);
        b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28);
        b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write("data", 36); b.writeUInt32LE(n, 40);
        b.fill(128, 44); return b;
      })();
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "rcl-music-"));
      const music = path.join(root, "music");
      const album = path.join(music, "Compilations", "The Complete Psalms of David, Series 2, Volume 7");
      fs.mkdirSync(album, { recursive: true });
      fs.writeFileSync(path.join(album, "11 Psalm 99.m4a"), wav);
      fs.writeFileSync(path.join(album, "08 Psalm 96.m4a"), wav);

      await page.goto(url + "#2026-10-18");
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      assert.equal(await page.locator("button.play").count(), 0);
      assert.equal(await page.textContent("#audio-badge"), "off");
      assert.match(await page.textContent("#audio-map-status"), /Built-in mapping: 250 psalm selections/);

      // Choose the folder (the <input webkitdirectory> path used when showDirectoryPicker is unavailable).
      await page.locator("#audio-settings summary").click();
      await page.setInputFiles("#audio-folder-input", music);
      assert.equal(await page.textContent("#audio-badge"), "on");
      assert.match(await page.textContent("#audio-source-status"), /folder “music” \(2 files/);
      assert.equal(await page.locator("button.play").count(), 2); // Psalm 99 and Psalm 96 (both tracks)
      await page.click('button.play[data-alt^="Psalm 99"]');
      await page.waitForFunction(() => {
        const a = document.getElementById("player-audio");
        return a.src.startsWith("blob:") && a.readyState >= 1;
      });
      assert.match(await page.innerText("#player-title"), /Psalm 99/);
      assert.equal(await page.locator("button.play.playing").count(), 1);
      // Psalm 96:1-9, (96:10-13) is two selections of one recording: an excerpt.
      await page.click('button.play[data-alt^="Psalm 96"]');
      assert.match(await page.innerText("#player-meta"), /more than the appointed verses \(Psalm 96:1-9, 10-13\)/);
      await page.click("#player-close");
      assert.equal(await page.isHidden("#player"), true);

      // A folder path typed in is remembered; a missing file is reported.
      await page.fill("#audio-base", music);
      await page.click('#audio-base-form button[type="submit"]');
      assert.match(await page.textContent("#audio-source-status"), /Recordings from file:\/\//);
      await page.reload();
      assert.equal(await page.textContent("#audio-badge"), "on");
      await page.click('button.play[data-alt^="Psalm 99"]');
      await page.waitForFunction(() => document.getElementById("player-audio").readyState >= 1);
      await page.goto(url + "#2026-10-25"); // Proper 25: Psalm 90 / Psalm 1, not in the test folder
      await page.click('button.play[data-alt^="Psalm 1"]');
      await page.waitForSelector("#player-meta .warn");
      await page.click("#player-close");

      // A custom mapping file replaces the built-in one until reset.
      const mapFile = path.join(root, "my-map.txt");
      fs.writeFileSync(mapFile, "selection|file\n1|Compilations/The Complete Psalms of David, Series 2, Volume 7/11 Psalm 99.m4a\n");
      await page.setInputFiles("#audio-map-input", mapFile);
      await page.waitForFunction(() => /Custom/.test(document.getElementById("audio-map-status").textContent));
      assert.match(await page.textContent("#audio-map-status"), /Custom mapping “my-map.txt”: 1 psalm selection\./);
      assert.equal(await page.locator("button.play").count(), 1);
      await page.reload();
      assert.match(await page.textContent("#audio-map-status"), /my-map.txt/);
      await page.locator("#audio-settings summary").click();
      await page.click("#audio-map-reset");
      assert.match(await page.textContent("#audio-map-status"), /Built-in mapping/);
      // a file that is not a mapping is refused
      const junk = path.join(root, "junk.txt");
      fs.writeFileSync(junk, "hello\n");
      await page.setInputFiles("#audio-map-input", junk);
      await page.waitForFunction(() => /was not used/.test(document.getElementById("audio-map-status").textContent));
      assert.match(await page.textContent("#audio-map-status"), /was not used/);

      await page.click("#audio-off-btn");
      assert.equal(await page.locator("button.play").count(), 0);
      await page.reload();
      assert.equal(await page.textContent("#audio-badge"), "off");
    });

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
