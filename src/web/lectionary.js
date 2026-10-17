/*
 * Liturgical calendar for the Revised Common Lectionary (Episcopal use).
 *
 * Pure functions, no DOM: works in the browser (exposed as `RCL`) and in Node
 * (`require("./lectionary.js")`) so it can be unit tested.
 *
 * Dates are handled as "day numbers": whole days since 1970-01-01 (UTC), so
 * there are no time-zone or daylight-saving surprises.
 *
 * Precedence follows the Book of Common Prayer (1979), pp. 15-18:
 *  - Principal Feasts (Easter Day, Ascension, Pentecost, Trinity Sunday,
 *    All Saints' Day, Christmas Day, the Epiphany) take precedence over any day.
 *  - Sundays take precedence over other fixed feasts, except the Holy Name,
 *    the Presentation and the Transfiguration, which replace the Sunday
 *    (the Sunday's readings are listed as an alternative).
 *  - Other Major Feasts falling on a Sunday, a Principal Feast or Ash Wednesday
 *    are transferred to the next open weekday.
 *  - Feasts falling in Holy Week or Easter Week are transferred, in order, to
 *    the week following the Second Sunday of Easter.
 *  - All Saints' Day may also be observed on the Sunday following November 1
 *    (listed as an alternative on that Sunday).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.RCL = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var COLUMNS = ["id", "label", "year", "season", "track", "fixed_date",
    "first_reading", "psalm", "second_reading", "gospel", "notes", "source_url"];

  // ------------------------------------------------------------- dates
  function dayNumber(y, m, d) {
    return Math.round(Date.UTC(y, m - 1, d) / 86400000);
  }
  function fromDayNumber(dn) {
    var t = new Date(dn * 86400000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  function dayOfWeek(dn) { // 0 = Sunday
    return (((dn + 4) % 7) + 7) % 7;
  }
  function isoDate(dn) {
    var p = fromDayNumber(dn);
    return p.y + "-" + String(p.m).padStart(2, "0") + "-" + String(p.d).padStart(2, "0");
  }
  function parseIsoDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    if (!m) return null;
    var dn = dayNumber(+m[1], +m[2], +m[3]);
    return isoDate(dn) === s ? dn : null;
  }
  /** First Sunday on or after dn. */
  function sundayOnOrAfter(dn) { return dn + ((7 - dayOfWeek(dn)) % 7); }

  /** Easter Day (Gregorian calendar), anonymous algorithm. */
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100,
      d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7,
      m = Math.floor((a + 11 * h + 22 * l) / 451),
      month = Math.floor((h + l - 7 * m + 114) / 31),
      day = ((h + l - 7 * m + 114) % 31) + 1;
    return dayNumber(y, month, day);
  }
  /** First Sunday of Advent: the Sunday nearest November 30 (Nov 27 - Dec 3). */
  function advent1(y) { return sundayOnOrAfter(dayNumber(y, 11, 27)); }

  /** Lectionary year letter (A, B, C) for a date. Year A begins Advent 2025, 2028, ... */
  function yearLetter(dn) {
    var y = fromDayNumber(dn).y;
    var ends = dn >= advent1(y) ? y + 1 : y;
    return ["C", "A", "B"][((ends % 3) + 3) % 3];
  }

  // -------------------------------------------------------------- data
  function parseData(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    var header = lines[0].split("|");
    return lines.slice(1).map(function (line) {
      var f = line.split("|"), row = {};
      header.forEach(function (h, i) { row[h] = f[i] || ""; });
      return row;
    });
  }

  /** Rows for an observance slug in a given year letter (e.g. "proper-11", "A"). */
  function rowsFor(rows, slug, letter) {
    var y = letter.toLowerCase() + "-" + slug, abc = "abc-" + slug;
    var found = rows.filter(function (r) {
      return r.id === y || r.id.indexOf(y + "-t") === 0;
    });
    if (found.length) return found;
    return rows.filter(function (r) {
      return r.id === abc || (slug === "christmas-day" && r.id.indexOf("abc-christmas-day-") === 0);
    });
  }

  // ---------------------------------------------------------- calendar
  var PRINCIPAL = "principal", SUNDAY = "sunday", LORD = "lordfeast",
    MAJOR = "majorfeast", FAST = "holyday", OTHER = "other";
  var LORD_FEASTS = { "holy-name": 1, "presentation": 1, "transfiguration": 1 };
  var PRINCIPAL_FIXED = { "christmas-day": 1, "epiphany": 1 };

  /** Fixed-date holy days from the data: [{slug, month, day}] (excluding principal feasts). */
  function fixedFeasts(rows) {
    var seen = {}, out = [];
    rows.forEach(function (r) {
      if (!r.fixed_date || r.year !== "ABC") return;
      var slug = r.id.replace(/^abc-/, "").replace(/-\d$/, "");
      if (slug.indexOf("christmas-day") === 0) slug = "christmas-day";
      if (PRINCIPAL_FIXED[slug] || seen[slug]) return;
      seen[slug] = 1;
      var md = r.fixed_date.split("-");
      out.push({ slug: slug, month: +md[0], day: +md[1] });
    });
    return out;
  }

  var cache = {};

  /**
   * All observances in calendar year y: object mapping day number ->
   * array of {slug, letter, rank, role, note, otherDn}. `role` is "primary",
   * "alternative" (may be used instead) or "transferred" (moved to otherDn).
   * For transferred feasts `note` is "transferred-from" / "transferred-to" and
   * `otherDn` is the day it moved from / to.
   */
  function calendarYear(rows, y) {
    if (cache[y] && cache[y].rows === rows) return cache[y].days;
    var days = {}, blocked = {}, E = easter(y), adv = advent1(y);

    function add(dn, slug, rank, role, note, otherDn) {
      (days[dn] = days[dn] || []).push({
        slug: slug, letter: yearLetter(dn), rank: rank, role: role || "primary", note: note || "",
        otherDn: otherDn === undefined ? null : otherDn
      });
    }
    function displaceSundays(dn, why) {
      (days[dn] || []).forEach(function (o) {
        if (o.rank === SUNDAY && o.role === "primary") {
          o.role = "alternative";
          o.note = "Readings of the Sunday, displaced by " + why + ".";
        }
      });
    }
    function block(dn, why) { blocked[dn] = why; }

    // Christmas season (start of the calendar year)
    var jan1 = dayNumber(y, 1, 1);
    if (dayOfWeek(jan1) === 0) add(jan1, "christmas-1", SUNDAY);
    for (var d = 2; d <= 5; d++) {
      if (dayOfWeek(dayNumber(y, 1, d)) === 0) add(dayNumber(y, 1, d), "christmas-2", SUNDAY);
    }
    // Epiphany and the Sundays after
    var epiphany = dayNumber(y, 1, 6);
    add(epiphany, "epiphany", PRINCIPAL); block(epiphany, "principal");
    var lastEpi = E - 49, n = 1;
    for (var s = sundayOnOrAfter(epiphany + 1); s < lastEpi; s += 7, n++) {
      add(s, "epiphany-" + n, SUNDAY);
    }
    add(lastEpi, "epiphany-last", SUNDAY);
    // Lent, Holy Week, Easter
    add(E - 46, "ash-wednesday", FAST); block(E - 46, "ash-wednesday");
    for (n = 1; n <= 5; n++) add(E - 49 + 7 * n, "lent-" + n, SUNDAY);
    add(E - 7, "palm-sunday", SUNDAY); block(E - 7, "holy-week");
    ["holy-monday", "holy-tuesday", "holy-wednesday", "maundy-thursday", "good-friday", "holy-saturday"]
      .forEach(function (slug, i) { add(E - 6 + i, slug, FAST); block(E - 6 + i, "holy-week"); });
    add(E, "easter-day", PRINCIPAL);
    for (d = 0; d <= 6; d++) block(E + d, "holy-week");
    for (n = 2; n <= 7; n++) add(E + 7 * (n - 1), "easter-" + n, SUNDAY);
    add(E + 39, "ascension", PRINCIPAL); block(E + 39, "principal");
    add(E + 49, "pentecost", PRINCIPAL); block(E + 49, "principal");
    add(E + 56, "trinity", PRINCIPAL); block(E + 56, "principal");
    // Season after Pentecost: Proper n is the Sunday closest to May 25 + 7(n-3)
    var may25 = dayNumber(y, 5, 25);
    for (s = E + 63; s < adv; s += 7) {
      add(s, "proper-" + (3 + Math.round((s - may25) / 7)), SUNDAY);
    }
    // All Saints' Day; Thanksgiving Day (fourth Thursday of November)
    var nov1 = dayNumber(y, 11, 1);
    displaceSundays(nov1, "All Saints\u2019 Day");
    add(nov1, "all-saints", PRINCIPAL); block(nov1, "principal");
    if (dayOfWeek(nov1) !== 0) {
      add(sundayOnOrAfter(nov1), "all-saints", PRINCIPAL, "alternative",
        "All Saints’ Day may also be observed on the Sunday following November 1.");
    }
    var firstThursday = nov1 + ((4 - dayOfWeek(nov1) + 7) % 7);
    add(firstThursday + 21, "thanksgiving", OTHER);
    // Advent and Christmas
    for (n = 1; n <= 4; n++) add(adv + 7 * (n - 1), "advent-" + n, SUNDAY);
    var xmas = dayNumber(y, 12, 25);
    add(xmas, "christmas-day", PRINCIPAL); block(xmas, "principal");
    for (s = xmas + 1; s <= dayNumber(y, 12, 31); s++) {
      if (dayOfWeek(s) === 0) add(s, "christmas-1", SUNDAY);
    }

    // Fixed feasts: place on their own day when possible, then transfer the rest.
    var occupied = {}, pending = [], easterWeekQueue = [];
    fixedFeasts(rows).forEach(function (f) {
      var dn = dayNumber(y, f.month, f.day);
      var lord = !!LORD_FEASTS[f.slug];
      var isSunday = dayOfWeek(dn) === 0;
      if (blocked[dn] === "holy-week") {
        easterWeekQueue.push({ f: f, dn: dn });
      } else if (blocked[dn]) {
        pending.push({ f: f, dn: dn });
      } else if (isSunday && lord) {
        displaceSundays(dn, "the feast");
        add(dn, f.slug, LORD); occupied[dn] = 1;
      } else if (isSunday) {
        pending.push({ f: f, dn: dn });
      } else {
        add(dn, f.slug, lord ? LORD : MAJOR); occupied[dn] = 1;
      }
    });
    function isOpen(dn) {
      return dayOfWeek(dn) !== 0 && !blocked[dn] && !occupied[dn];
    }
    function transfer(item, start) {
      var to = start;
      while (!isOpen(to)) to++;
      occupied[to] = 1;
      var rank = LORD_FEASTS[item.f.slug] ? LORD : MAJOR;
      add(to, item.f.slug, rank, "primary", "transferred-from", item.dn);
      add(item.dn, item.f.slug, rank, "transferred", "transferred-to", to);
    }
    // Transfer in order of original date; Holy Week / Easter Week feasts start
    // looking on the Monday after the Second Sunday of Easter.
    easterWeekQueue.forEach(function (item) { item.start = E + 8; });
    pending.forEach(function (item) { item.start = item.dn + 1; });
    pending.concat(easterWeekQueue)
      .sort(function (a, b) { return a.dn - b.dn; })
      .forEach(function (item) { transfer(item, Math.max(item.start, item.dn + 1)); });

    cache[y] = { rows: rows, days: days };
    return days;
  }

  var RANK_ORDER = { principal: 0, lordfeast: 1, sunday: 2, holyday: 3, majorfeast: 4, other: 5 };
  var ROLE_ORDER = { primary: 0, alternative: 1, transferred: 2 };

  /** Observances on a day, with their readings rows attached, primary first. */
  function observancesOn(rows, dn) {
    var list = (calendarYear(rows, fromDayNumber(dn).y)[dn] || []).map(function (o) {
      return {
        slug: o.slug, letter: o.letter, rank: o.rank, role: o.role, note: o.note,
        otherDn: o.otherDn, rows: rowsFor(rows, o.slug, o.letter)
      };
    });
    return list.sort(function (a, b) {
      return (ROLE_ORDER[a.role] - ROLE_ORDER[b.role]) || (RANK_ORDER[a.rank] - RANK_ORDER[b.rank]);
    });
  }

  /** The next day after dn (within ~400 days) with a primary observance. */
  function nextObservance(rows, dn) {
    for (var d = dn + 1; d < dn + 400; d++) {
      var obs = observancesOn(rows, d).filter(function (o) { return o.role === "primary"; });
      if (obs.length) return { dn: d, observances: obs };
    }
    return null;
  }

  // ---------------------------------------------------------- labels
  var SHORT = {
    "christmas-day": "Christmas Day", "epiphany": "Epiphany", "epiphany-1": "Baptism of Our Lord",
    "epiphany-last": "Last Epiphany", "ash-wednesday": "Ash Wednesday", "palm-sunday": "Palm Sunday",
    "holy-monday": "Holy Monday", "holy-tuesday": "Holy Tuesday", "holy-wednesday": "Holy Wednesday",
    "maundy-thursday": "Maundy Thursday", "good-friday": "Good Friday", "holy-saturday": "Holy Saturday",
    "easter-day": "Easter Day", "ascension": "Ascension", "pentecost": "Pentecost",
    "trinity": "Trinity Sunday", "all-saints": "All Saints", "thanksgiving": "Thanks\u00adgiving"
  };
  function shortLabel(obs) {
    var s = obs.slug, m;
    if (SHORT[s]) return SHORT[s];
    if ((m = /^(advent|lent|easter|christmas|epiphany|proper)-(\d+)$/.exec(s))) {
      return m[1].charAt(0).toUpperCase() + m[1].slice(1) + " " + m[2];
    }
    var label = obs.rows.length ? obs.rows[0].label : s;
    return label.replace(/^The /, "").replace(/ of Our Lord.*$/, "")
      .replace(/ of the Blessed Virgin Mary$/, "").replace(/,.*$/, "")
      .replace(/ the (Apostle|Evangelist)$/, "").replace(/Saint /g, "St. ");
  }
  function fullLabel(obs) {
    if (!obs.rows.length) return shortLabel(obs);
    return obs.rows[0].label.replace(/: Christmas Day I+$/, ": Christmas Day");
  }

  // ------------------------------------------------------- citations
  /** "Psalm 103:1-103:13, 103:22" -> "Psalm 103:1-13, 22" (drops repeated chapters). */
  function compactCitation(field) {
    if (!field) return field;
    return field.split(" or ").map(function (alt) {
      var m = /^(.*?[A-Za-z]) ([(\d].*)$/.exec(alt);
      if (!m) return alt;
      var chapter = null;
      var refs = m[2].replace(/[^(),\s]+/g, function (tok) {
        return tok.split("-").map(function (p) {
          var cv = p.split(":");
          if (cv.length !== 2) return p;
          var out = cv[0] === chapter ? cv[1] : p;
          chapter = cv[0];
          return out;
        }).join("-");
      });
      return m[1] + " " + refs;
    }).join(" or ");
  }
  /**
   * Compact citations inside free text (notes): a chapter is dropped when it
   * repeats the chapter of the preceding reference in the same citation.
   * Any letters between references start a new citation.
   */
  function compactText(text) {
    var chapter = null, last = 0;
    return (text || "").replace(/(\d+):(\d+[a-z]?)/g, function (all, c, v, offset, whole) {
      if (/[A-Za-z]/.test(whole.slice(last, offset))) chapter = null;
      last = offset + all.length;
      var out = c === chapter ? v : all;
      chapter = c;
      return out;
    });
  }

  // ------------------------------------------------- Old Testament texts
  var VERSIONS = [
    { id: "masoretic", label: "Masoretic", lang: "he", dir: "rtl" },
    { id: "onkelos", label: "Onkelos", lang: "arc", dir: "rtl" },
    { id: "septuagint", label: "Septuagint", lang: "grc", dir: "ltr" },
    { id: "vulgate", label: "Vulgate", lang: "la", dir: "ltr" }
  ];

  /** Parse a #!ctsdata block: {text: {urn: text}, order: {work: [urn, ...]}, pos: {urn: index}}. */
  function parseCex(text) {
    var out = { text: {}, order: {}, pos: {} };
    (text || "").split(/\r?\n/).forEach(function (line) {
      if (line.indexOf("urn:") !== 0) return;
      var bar = line.indexOf("|");
      var urn = line.slice(0, bar), work = urn.split(":")[3];
      out.text[urn] = line.slice(bar + 1);
      var list = out.order[work] = out.order[work] || [];
      out.pos[urn] = list.length;
      list.push(urn);
    });
    return out;
  }

  /** Parse ot_index.txt: {"Book|selection": [{version, first, last, notes: [...]}, ...]}. */
  function parseIndex(text) {
    var out = {};
    (text || "").split(/\r?\n/).slice(1).forEach(function (line) {
      if (!line.trim()) return;
      var f = line.split("|"), key = f[0] + "|" + f[1];
      (out[key] = out[key] || []).push({
        version: f[2], first: f[3], last: f[4], notes: f[5] ? f[5].split(" ") : []
      });
    });
    return out;
  }

  /** Books that have Old Testament text in the index. */
  function indexedBooks(index) {
    var books = {};
    Object.keys(index).forEach(function (k) { books[k.split("|")[0]] = 1; });
    return books;
  }

  /** "Psalm 103:1-103:13, (103:22)" -> {book, selections: [{ref, optional}]}. */
  function splitAlternative(alt) {
    var m = /^(.*?[A-Za-z]) ([(\d].*)$/.exec(alt);
    if (!m) return null;
    var sels = [], depth = 0, cur = "", optional = false;
    function push() {
      var r = cur.trim();
      if (r) sels.push({ ref: r, optional: optional || depth > 0 });
      cur = "";
    }
    for (var i = 0; i < m[2].length; i++) {
      var ch = m[2][i];
      if (ch === "(") { depth++; optional = true; continue; }
      if (ch === ")") { push(); depth--; optional = false; continue; }
      if (ch === "," && depth >= 0) { push(); if (!depth) optional = false; continue; }
      cur += ch;
    }
    push();
    return { book: m[1], selections: sels };
  }

  /**
   * Texts for one selection in the chosen versions:
   * [{version, parts: [{passages: [{urn, ref, text}], notes}]}], in VERSIONS order.
   */
  function textsFor(cex, index, book, ref, versionIds) {
    var rows = index[book + "|" + ref] || [];
    return VERSIONS.filter(function (v) { return versionIds.indexOf(v.id) >= 0; }).map(function (v) {
      var parts = rows.filter(function (r) { return r.version === v.id; }).map(function (r) {
        var passages = [];
        if (r.first && r.first in cex.pos) {
          var work = r.first.split(":")[3], list = cex.order[work];
          for (var i = cex.pos[r.first]; i <= cex.pos[r.last]; i++) {
            passages.push({ urn: list[i], ref: list[i].split(":")[4], text: cex.text[list[i]] });
          }
        }
        return { passages: passages, notes: r.notes };
      });
      return { version: v, available: rows.some(function (r) { return r.version === v.id; }), parts: parts };
    });
  }

  /** Human-readable explanation of an index note code. */
  function explainNote(code) {
    var m = /^psalm=(\d+)$/.exec(code);
    if (m) return "This psalm is numbered " + m[1] + " in this version.";
    return {
      titles: "Verse numbers follow this version, which may count the psalm\u2019s title as verse 1 or 2.",
      missing: "No text at this reference in this version\u2019s numbering.",
      partial: "Only part of the reference exists in this version\u2019s numbering."
    }[code] || code;
  }

  return {
    COLUMNS: COLUMNS, VERSIONS: VERSIONS,
    parseCex: parseCex, parseIndex: parseIndex, indexedBooks: indexedBooks,
    splitAlternative: splitAlternative, textsFor: textsFor, explainNote: explainNote,
    dayNumber: dayNumber, fromDayNumber: fromDayNumber, dayOfWeek: dayOfWeek,
    isoDate: isoDate, parseIsoDate: parseIsoDate, sundayOnOrAfter: sundayOnOrAfter,
    easter: easter, advent1: advent1, yearLetter: yearLetter,
    parseData: parseData, rowsFor: rowsFor, fixedFeasts: fixedFeasts,
    calendarYear: calendarYear, observancesOn: observancesOn, nextObservance: nextObservance,
    shortLabel: shortLabel, fullLabel: fullLabel,
    compactCitation: compactCitation, compactText: compactText
  };
});
