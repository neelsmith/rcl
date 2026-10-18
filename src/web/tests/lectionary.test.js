// Unit tests for src/web/lectionary.js. Run: node --test src/web/tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const R = require("../lectionary.js");

const DATA = path.join(__dirname, "..", "..", "..", "data", "rcl_readings.txt");
const rows = R.parseData(fs.readFileSync(DATA, "utf8"));
const dn = (s) => R.parseIsoDate(s);
const iso = R.isoDate;

/** "role:slug" for each observance on a date, e.g. ["primary:proper-24"]. */
function on(date) {
  return R.observancesOn(rows, dn(date)).map((o) => `${o.role}:${o.slug}`);
}
function primary(date) {
  return R.observancesOn(rows, dn(date)).filter((o) => o.role === "primary").map((o) => o.slug);
}

test("day numbers round-trip and weekdays", () => {
  assert.equal(iso(dn("2026-10-18")), "2026-10-18");
  assert.equal(R.dayOfWeek(dn("2026-10-18")), 0);
  assert.equal(R.dayOfWeek(dn("1970-01-01")), 4);
  assert.equal(R.dayOfWeek(dn("1969-12-28")), 0);
  assert.equal(R.parseIsoDate("2026-02-30"), null);
  assert.equal(R.parseIsoDate("nonsense"), null);
});

test("Easter dates", () => {
  const known = { 2008: "2008-03-23", 2011: "2011-04-24", 2024: "2024-03-31", 2025: "2025-04-20",
    2026: "2026-04-05", 2027: "2027-03-28", 2038: "2038-04-25", 2285: "2285-03-22" };
  for (const [y, d] of Object.entries(known)) assert.equal(iso(R.easter(+y)), d, y);
});

test("First Sunday of Advent", () => {
  assert.equal(iso(R.advent1(2022)), "2022-11-27");
  assert.equal(iso(R.advent1(2024)), "2024-12-01");
  assert.equal(iso(R.advent1(2025)), "2025-11-30");
  assert.equal(iso(R.advent1(2026)), "2026-11-29");
});

test("lectionary year letters", () => {
  assert.equal(R.yearLetter(dn("2025-11-29")), "C");
  assert.equal(R.yearLetter(dn("2025-11-30")), "A");
  assert.equal(R.yearLetter(dn("2026-10-18")), "A");
  assert.equal(R.yearLetter(dn("2026-11-29")), "B");
  assert.equal(R.yearLetter(dn("2027-12-25")), "C");
});

test("Sundays and seasons, 2026", () => {
  assert.deepEqual(primary("2026-01-04"), ["christmas-2"]);
  assert.deepEqual(primary("2026-01-06"), ["epiphany"]);
  assert.deepEqual(primary("2026-01-11"), ["epiphany-1"]);
  assert.deepEqual(primary("2026-02-15"), ["epiphany-last"]);
  assert.deepEqual(primary("2026-02-18"), ["ash-wednesday"]);
  assert.deepEqual(primary("2026-02-22"), ["lent-1"]);
  assert.deepEqual(primary("2026-03-29"), ["palm-sunday"]);
  assert.deepEqual(primary("2026-04-03"), ["good-friday"]);
  assert.deepEqual(primary("2026-04-05"), ["easter-day"]);
  assert.deepEqual(primary("2026-05-14"), ["ascension"]);
  assert.deepEqual(primary("2026-05-24"), ["pentecost"]);
  assert.deepEqual(primary("2026-05-31"), ["trinity"]);
  assert.deepEqual(primary("2026-06-07"), ["proper-5"]);
  assert.deepEqual(primary("2026-11-22"), ["proper-29"]);
  assert.deepEqual(primary("2026-11-29"), ["advent-1"]);
  assert.deepEqual(primary("2026-12-25"), ["christmas-day"]);
  assert.deepEqual(primary("2026-12-27"), ["christmas-1"]);
  assert.deepEqual(on("2026-10-16"), []);
});

test("Propers are the Sundays closest to their dates", () => {
  assert.deepEqual(primary("2027-05-30"), ["proper-4"]); // Trinity 2027 is May 23
  assert.deepEqual(primary("2027-11-21"), ["proper-29"]);
  assert.deepEqual(primary("2024-05-26"), ["trinity"]);
  assert.deepEqual(primary("2024-06-02"), ["proper-4"]);
  assert.deepEqual(primary("2008-05-25"), ["proper-3"]); // Trinity 2008 is May 18
});

test("each Proper has two tracks; Christmas Day has three services", () => {
  const p = R.observancesOn(rows, dn("2026-10-18"))[0];
  assert.deepEqual(p.rows.map((r) => r.track), ["1", "2"]);
  const c = R.observancesOn(rows, dn("2026-12-25"))[0];
  assert.equal(c.rows.length, 3);
});

test("Principal Feast on a Sunday displaces the Sunday", () => {
  assert.deepEqual(on("2026-11-01"), ["primary:all-saints", "alternative:proper-26"]);
});

test("All Saints may be kept on the following Sunday", () => {
  assert.deepEqual(on("2027-11-07"), ["primary:proper-27", "alternative:all-saints"]);
});

test("Holy Name, Presentation and Transfiguration take precedence of a Sunday", () => {
  assert.deepEqual(on("2023-01-01"), ["primary:holy-name", "alternative:christmas-1"]);
  assert.deepEqual(on("2025-02-02"), ["primary:presentation", "alternative:epiphany-4"]);
  assert.deepEqual(on("2028-08-06"), ["primary:transfiguration", "alternative:proper-13"]);
});

test("other Major Feasts on a Sunday move to the next open day", () => {
  assert.deepEqual(on("2026-10-18"), ["primary:proper-24", "transferred:st-luke"]);
  assert.deepEqual(on("2026-10-19"), ["primary:st-luke"]);
  const moved = R.observancesOn(rows, dn("2026-10-19"))[0];
  assert.equal(iso(moved.otherDn), "2026-10-18");
  // St Stephen on Sunday Dec 26, 2021: St John and Holy Innocents keep their days.
  assert.deepEqual(primary("2021-12-27"), ["st-john"]);
  assert.deepEqual(primary("2021-12-28"), ["holy-innocents"]);
  assert.deepEqual(primary("2021-12-29"), ["st-stephen"]);
});

test("feasts on Ash Wednesday move to the next day", () => {
  assert.deepEqual(primary("2066-02-24"), ["ash-wednesday"]);
  assert.deepEqual(primary("2066-02-25"), ["st-matthias"]);
});

test("feasts in Holy Week and Easter Week move after the Second Sunday of Easter", () => {
  assert.deepEqual(on("2027-03-25"), ["primary:maundy-thursday", "transferred:annunciation"]);
  assert.deepEqual(primary("2027-04-05"), ["annunciation"]);
  // 2011: St Mark (Easter Monday) and SS Philip & James (Easter 2) keep their order.
  assert.deepEqual(primary("2011-05-02"), ["st-mark"]);
  assert.deepEqual(primary("2011-05-03"), ["st-philip-and-st-james"]);
});

test("Thanksgiving is the fourth Thursday of November", () => {
  assert.deepEqual(primary("2026-11-26"), ["thanksgiving"]);
  assert.deepEqual(primary("2027-11-25"), ["thanksgiving"]);
  assert.deepEqual(primary("2029-11-22"), ["thanksgiving"]);
});

test("every Sunday 2000-2100 has a primary observance with readings", () => {
  for (let d = dn("2000-01-02"); d < dn("2100-12-31"); d += 7) {
    const obs = R.observancesOn(rows, d).filter((o) => o.role === "primary");
    assert.ok(obs.length >= 1, `no observance on ${iso(d)}`);
    for (const o of obs) assert.ok(o.rows.length >= 1, `no readings for ${o.slug} ${o.letter} on ${iso(d)}`);
  }
});

test("every observance 2000-2100 resolves to readings", () => {
  for (let y = 2000; y <= 2100; y++) {
    const days = R.calendarYear(rows, y);
    for (const [d, list] of Object.entries(days)) {
      for (const o of list) {
        assert.ok(R.rowsFor(rows, o.slug, o.letter).length, `${o.slug} ${o.letter} ${iso(+d)}`);
      }
      const prim = list.filter((o) => o.role === "primary");
      assert.ok(prim.length <= 1, `two primary observances on ${iso(+d)}: ${prim.map((o) => o.slug)}`);
    }
  }
});

test("next observance", () => {
  const n = R.nextObservance(rows, dn("2026-10-16"));
  assert.equal(iso(n.dn), "2026-10-18");
  assert.equal(n.observances[0].slug, "proper-24");
});

test("labels", () => {
  const lab = (date) => R.observancesOn(rows, dn(date)).map(R.shortLabel);
  assert.deepEqual(lab("2026-10-19"), ["St. Luke"]);
  assert.deepEqual(lab("2026-10-18"), ["Proper 24", "St. Luke"]);
  assert.deepEqual(lab("2027-02-02"), ["Presentation"]);
  assert.deepEqual(lab("2026-01-11"), ["Baptism of Our Lord"]);
});

test("citation compaction", () => {
  assert.equal(R.compactCitation("Psalm 103:1-103:13, 103:22"), "Psalm 103:1-13, 22");
  assert.equal(R.compactCitation("Acts 6:8-7:2a, 7:51c-7:60"), "Acts 6:8-7:2a, 51c-60");
  assert.equal(R.compactCitation("Isaiah 58:1-58:9a, (58:9b-58:12)"), "Isaiah 58:1-9a, (9b-12)");
  assert.equal(R.compactCitation("Psalm 42, 43"), "Psalm 42, 43");
  assert.equal(R.compactCitation("John 20:1-20:18 or Matthew 28:1-28:10"), "John 20:1-18 or Matthew 28:1-10");
  assert.equal(R.compactText("Liturgy of the Palms gospel: Luke 19:28-19:40."), "Liturgy of the Palms gospel: Luke 19:28-40.");
  assert.equal(R.compactText("Psalm: Psalm 118:1-118:2, 118:19-118:29."), "Psalm: Psalm 118:1-2, 19-29.");
  assert.equal(R.compactText("Psalm 9:9-9:20 goes with 1 Samuel 9:1-9:3."), "Psalm 9:9-20 goes with 1 Samuel 9:1-3.");
});

// ------------------------------------------------------------ Old Testament texts
const CEX = [
  "#!ctsdata",
  "urn:cts:compnov:bible.psalms.masoretic:23.1|M1",
  "urn:cts:compnov:bible.psalms.masoretic:23.2|M2",
  "urn:cts:compnov:bible.psalms.septuagint:22.1|G1",
  "urn:cts:compnov:bible.psalms.septuagint:22.2|G2",
  "urn:cts:compnov:bible.psalms.septuagint:22.3|G3",
].join("\n");
const INDEX = [
  "book|selection|version|first_urn|last_urn|note",
  "Psalm|23|masoretic|urn:cts:compnov:bible.psalms.masoretic:23.1|urn:cts:compnov:bible.psalms.masoretic:23.2|titles",
  "Psalm|23|septuagint|urn:cts:compnov:bible.psalms.septuagint:22.1|urn:cts:compnov:bible.psalms.septuagint:22.3|psalm=22 titles",
  "Malachi|4:1-4:2a|masoretic|||missing",
].join("\n");

test("parse texts and index", () => {
  const cex = R.parseCex(CEX);
  assert.equal(cex.text["urn:cts:compnov:bible.psalms.septuagint:22.2"], "G2");
  assert.equal(cex.order["bible.psalms.septuagint"].length, 3);
  const idx = R.parseIndex(INDEX);
  assert.deepEqual(idx["Psalm|23"][1].notes, ["psalm=22", "titles"]);
  assert.deepEqual(Object.keys(R.indexedBooks(idx)).sort(), ["Malachi", "Psalm"]);
});

test("split an alternative into selections", () => {
  assert.deepEqual(R.splitAlternative("Psalm 103:1-103:13, 103:22"),
    { book: "Psalm", selections: [{ ref: "103:1-103:13", optional: false }, { ref: "103:22", optional: false }] });
  assert.deepEqual(R.splitAlternative("1 Samuel (17:1a, 17:4-17:11), 17:32-17:49").selections,
    [{ ref: "17:1a", optional: true }, { ref: "17:4-17:11", optional: true }, { ref: "17:32-17:49", optional: false }]);
  assert.deepEqual(R.splitAlternative("Isaiah 58:1-58:9a, (58:9b-58:12)").selections.map((s) => s.optional), [false, true]);
  assert.equal(R.splitAlternative("Psalm 42, 43").book, "Psalm");
  assert.equal(R.splitAlternative("nonsense"), null);
});

test("texts for a selection, in version order", () => {
  const cex = R.parseCex(CEX), idx = R.parseIndex(INDEX);
  const t = R.textsFor(cex, idx, "Psalm", "23", ["septuagint", "masoretic", "onkelos"]);
  assert.deepEqual(t.map((r) => r.version.id), ["masoretic", "onkelos", "septuagint"]);
  assert.deepEqual(t[0].parts[0].passages.map((p) => p.text), ["M1", "M2"]);
  assert.equal(t[1].available, false);
  assert.deepEqual(t[2].parts[0].passages.map((p) => p.ref), ["22.1", "22.2", "22.3"]);
  const m = R.textsFor(cex, idx, "Malachi", "4:1-4:2a", ["masoretic"]);
  assert.equal(m[0].available, true);
  assert.deepEqual(m[0].parts[0].passages, []);
  assert.deepEqual(m[0].parts[0].notes, ["missing"]);
  assert.match(R.explainNote("psalm=22"), /numbered 22/);
});

test("every OT selection in the real data resolves", () => {
  const cex = R.parseCex(fs.readFileSync(path.join(DATA, "..", "ot_passages.cex"), "utf8"));
  const idx = R.parseIndex(fs.readFileSync(path.join(DATA, "..", "ot_index.txt"), "utf8"));
  for (const [key, list] of Object.entries(idx)) {
    for (const r of list) {
      if (!r.first) continue;
      assert.ok(r.first in cex.pos && r.last in cex.pos, key);
      assert.ok(cex.pos[r.first] <= cex.pos[r.last], key);
    }
  }
  const ps = R.textsFor(cex, idx, "Psalm", "23", ["septuagint"])[0];
  assert.match(ps.parts[0].passages[0].text, /Κύριος ποιμαίνει με/);
});

test("Onkelos is offered only where it has the text (the Torah)", () => {
  const idx = R.parseIndex([
    "book|selection|version|first_urn|last_urn|note",
    "Genesis|1:1-1:5|masoretic|a|b|", "Genesis|1:1-1:5|onkelos|a|b|", "Genesis|1:1-1:5|septuagint|a|b|",
    "Isaiah|2:1-2:5|masoretic|a|b|", "Isaiah|2:1-2:5|vulgate|a|b|",
  ].join("\n"));
  const ids = (alt) => R.offeredVersions(idx, alt).map((v) => v.id);
  assert.deepEqual(ids("Genesis 1:1-1:5"), ["masoretic", "onkelos", "septuagint", "vulgate"]);
  assert.deepEqual(ids("Isaiah 2:1-2:5"), ["masoretic", "septuagint", "vulgate"]);
  assert.deepEqual(R.availableVersions(idx, "Isaiah 2:1-2:5"), ["masoretic", "vulgate"]);
  // with the real data
  const real = R.parseIndex(fs.readFileSync(path.join(DATA, "..", "ot_index.txt"), "utf8"));
  assert.ok(R.offeredVersions(real, "Exodus 33:12-33:23").some((v) => v.id === "onkelos"));
  assert.ok(!R.offeredVersions(real, "Psalm 99").some((v) => v.id === "onkelos"));
  assert.ok(!R.offeredVersions(real, "Isaiah 45:1-45:7").some((v) => v.id === "onkelos"));
});
