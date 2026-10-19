// Unit tests for src/web/audio.js. Run: node --test src/web/tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const A = require("../audio.js");
const R = require("../lectionary.js");

const MAP = [
  "selection|psalm|file|coverage",
  "23|23|Choir B/Album/04 Psalm 23.m4a|whole",
  "103:1-103:13|103|Comp/Vol 7/15 Psalm 103.m4a|excerpt",
  "103:22|103|Comp/Vol 7/15 Psalm 103.m4a|excerpt",
  "42|42|Comp/Vol 3/06 Psalm 42.m4a|whole",
  "43|43|Comp/Vol 3/07 Psalm 43.m4a|whole",
].join("\n");

test("parse a mapping file", () => {
  const m = A.parseMap(MAP);
  assert.equal(m.count, 5);
  assert.deepEqual(m.errors, []);
  assert.deepEqual(m.map["23"], [{ file: "Choir B/Album/04 Psalm 23.m4a", coverage: "whole" }]);
});

test("mapping files: minimal columns, any order, and errors", () => {
  const m = A.parseMap("file|selection\nx/Psalm 1.mp3|1\n");
  assert.deepEqual(m.map["1"], [{ file: "x/Psalm 1.mp3", coverage: "" }]);
  assert.match(A.parseMap("").errors[0], /empty/);
  assert.match(A.parseMap("a|b\n1|2").errors[0], /selection/);
  const bad = A.parseMap("selection|file\nPsalm 23|x.m4a\n23|y.m4a");
  assert.equal(bad.count, 1);
  assert.match(bad.errors[0], /Line 2/);
});

test("recordings for a citation alternative", () => {
  const { map } = A.parseMap(MAP);
  const r = (alt) => A.recordingsFor(map, alt, R.splitAlternative);
  assert.deepEqual(r("Psalm 23").map((x) => [x.file, x.coverage]), [["Choir B/Album/04 Psalm 23.m4a", "whole"]]);
  const p103 = r("Psalm 103:1-103:13, 103:22");
  assert.equal(p103.length, 1);
  assert.deepEqual(p103[0].selections, ["103:1-103:13", "103:22"]);
  assert.equal(p103[0].coverage, "excerpt");
  assert.deepEqual(r("Psalm 42, 43").map((x) => x.file.split("/").pop()), ["06 Psalm 42.m4a", "07 Psalm 43.m4a"]);
  assert.deepEqual(r("Canticle 9"), []);
  assert.deepEqual(r("Isaiah 2:1-2:5"), []);
  assert.deepEqual(r("Psalm 150"), []);
});

test("URLs and base folders", () => {
  assert.equal(A.joinUrl("file:///Users/me/music/", "Comp/Vol. 3 - Psalms/06 Psalm 42.m4a"),
    "file:///Users/me/music/Comp/Vol.%203%20-%20Psalms/06%20Psalm%2042.m4a");
  assert.equal(A.joinUrl("https://x.org/a", "b c/d#e.m4a"), "https://x.org/a/b%20c/d%23e.m4a");
  assert.equal(A.normalizeBase(" /Users/me/music "), "file:///Users/me/music");
  assert.equal(A.normalizeBase("C:\\Music\\Psalms"), "file:///C:/Music/Psalms");
  assert.equal(A.normalizeBase("https://example.org/psalms/"), "https://example.org/psalms/");
  assert.equal(A.normalizeBase("music"), null);
  assert.equal(A.normalizeBase(""), "");
});

test("files picked from a folder", () => {
  const files = [
    { webkitRelativePath: "music/Comp/Vol 3/06 Psalm 42.m4a" },
    { webkitRelativePath: "music/Comp/Vol 3/07 Psalm 43.m4a" },
  ];
  const idx = A.indexPicked(files);
  assert.deepEqual(Object.keys(idx), ["Comp/Vol 3/06 Psalm 42.m4a", "Comp/Vol 3/07 Psalm 43.m4a"]);
  assert.equal(A.findPicked(idx, "Comp/Vol 3/06 Psalm 42.m4a"), files[0]);
  // the user picked the folder one level up ("ns-personal") or one level down ("Comp")
  assert.equal(A.findPicked({ "music/Comp/Vol 3/06 Psalm 42.m4a": 1 }, "Comp/Vol 3/06 Psalm 42.m4a"), 1);
  assert.equal(A.findPicked({ "Vol 3/06 Psalm 42.m4a": 2 }, "Comp/Vol 3/06 Psalm 42.m4a"), 2);
  assert.equal(A.findPicked(idx, "Comp/Vol 3/08 Psalm 44.m4a"), null);
  assert.equal(A.findPicked({ "xComp/Vol 3/06 Psalm 42.m4a": 3 }, "Comp/Vol 3/06 Psalm 42.m4a"), null);
});

test("describe a recording from its path", () => {
  assert.deepEqual(A.describe("Choir Of Worcester Cathedral _ Chirstopher Allsop _ Peter Nardone/Vol. 8/01 Psalm 105 (Attwood, Deffell).m4a"),
    { title: "Psalm 105 (Attwood, Deffell)", album: "Vol. 8", artist: "Choir Of Worcester Cathedral, Chirstopher Allsop, Peter Nardone" });
  assert.deepEqual(A.describe("Compilations/Vol. 4/02 Psalm 51.m4a"), { title: "Psalm 51", album: "Vol. 4", artist: "" });
  assert.equal(A.describe("9-01 Psalm 119, 1-32.m4a").title, "Psalm 119, 1-32");
});

test("the built-in mapping covers every psalm citation in the readings", () => {
  const data = path.join(__dirname, "..", "..", "..", "data");
  const { map, errors } = A.parseMap(fs.readFileSync(path.join(data, "psalm_audio_map.txt"), "utf8"));
  assert.deepEqual(errors, []);
  const rows = R.parseData(fs.readFileSync(path.join(data, "rcl_readings.txt"), "utf8"));
  for (const row of rows) {
    for (const alt of row.psalm.split(" or ")) {
      if (!alt.startsWith("Psalm ")) continue;
      assert.ok(A.recordingsFor(map, alt, R.splitAlternative).length, `${row.id}: ${alt}`);
    }
  }
});

test("parse the recordings catalog", () => {
  const cat = A.parseCatalog([
    "file|psalm|verses|artist|album|chants",
    "Choir A/Album/01 Psalm 1.m4a|1||Choir A|Album|",
    "Compilations/Vol 4/02 Psalm 51.m4a|51||Compilations|Vol 4|",
  ].join("\n"));
  assert.equal(cat["Choir A/Album/01 Psalm 1.m4a"].artist, "Choir A");
  assert.equal(cat["Compilations/Vol 4/02 Psalm 51.m4a"].album, "Vol 4");
  assert.deepEqual(A.parseCatalog(""), {});
  assert.deepEqual(A.parseCatalog("a|b\n1|2"), {});
  const real = A.parseCatalog(fs.readFileSync(path.join(__dirname, "..", "..", "..", "data", "psalm_audio_files.txt"), "utf8"));
  assert.equal(Object.keys(real).length, 154);
});
