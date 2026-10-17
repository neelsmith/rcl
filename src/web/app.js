/* Calendar and readings UI. Depends on lectionary.js (global RCL). */
(function () {
  "use strict";
  var R = window.RCL;
  var rows = R.parseData(document.getElementById("rcl-data").textContent);
  var cex = R.parseCex(document.getElementById("ot-texts").textContent);
  var otIndex = R.parseIndex(document.getElementById("ot-index").textContent);
  var otBooks = R.indexedBooks(otIndex);
  var VERSIONS_KEY = "rcs.versions";

  var SEASONS = {
    advent: "Advent", christmas: "Christmas", epiphany: "Season after the Epiphany",
    lent: "Lent", holy_week: "Holy Week", easter: "Easter Season",
    after_pentecost: "Season after Pentecost", holy_day: "Holy Day"
  };
  var LESSONS = [
    ["first_reading", "First reading"], ["psalm", "Psalm"],
    ["second_reading", "Second reading"], ["gospel", "Gospel"]
  ];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  var el = {
    grid: document.getElementById("grid"), title: document.getElementById("month-title"),
    prev: document.getElementById("prev"), next: document.getElementById("next"),
    today: document.getElementById("today"), input: document.getElementById("date-input"),
    readings: document.getElementById("readings")
  };

  function todayDn() {
    var t = new Date();
    return R.dayNumber(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }
  function longDate(dn) {
    return new Date(dn * 86400000).toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC"
    });
  }
  function shortDate(dn) {
    return new Date(dn * 86400000).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", timeZone: "UTC"
    });
  }
  function h(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else if (k.indexOf("on") === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }

  function loadVersions() {
    try {
      var v = JSON.parse(localStorage.getItem(VERSIONS_KEY) || "[]");
      return Array.isArray(v) ? v.filter(function (x) {
        return R.VERSIONS.some(function (d) { return d.id === x; });
      }) : [];
    } catch (e) { return []; }
  }
  function saveVersions(v) {
    try { localStorage.setItem(VERSIONS_KEY, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
  }

  // `open` is the key of the citation whose texts are shown (stable for a given date).
  var state = { selected: todayDn(), viewY: 0, viewM: 0, versions: loadVersions(), open: null };
  var citeCounter = 0;

  function primaryOf(list) {
    for (var i = 0; i < list.length; i++) if (list[i].role === "primary") return list[i];
    return null;
  }

  // ------------------------------------------------------------ calendar
  function renderCalendar() {
    var y = state.viewY, m = state.viewM;
    el.title.textContent = MONTHS[m - 1] + " " + y;
    el.grid.textContent = "";
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(function (d, i) {
      el.grid.appendChild(h("div", { class: "dow" + (i === 0 ? " sun" : ""), role: "columnheader", text: d }));
    });
    var first = R.dayNumber(y, m, 1);
    var start = first - R.dayOfWeek(first);
    var last = R.dayNumber(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) - 1;
    var end = last + (6 - R.dayOfWeek(last));
    var today = todayDn();
    for (var dn = start; dn <= end; dn++) {
      var p = R.fromDayNumber(dn);
      var obs = primaryOf(R.observancesOn(rows, dn));
      var cls = "day";
      if (p.m !== m) cls += " out";
      if (obs) cls += " " + obs.rank;
      if (dn === today) cls += " today";
      if (dn === state.selected) cls += " selected";
      var label = obs ? R.shortLabel(obs) : "";
      var aria = longDate(dn) + (label ? ", " + label : "");
      el.grid.appendChild(h("button", {
        type: "button", class: cls, "data-dn": String(dn), "aria-label": aria, title: aria,
        "aria-pressed": dn === state.selected ? "true" : "false",
        tabindex: dn === state.selected ? "0" : "-1",
        onclick: (function (d) { return function () { select(d); }; })(dn)
      }, [h("span", { class: "num", text: String(p.d) }), h("span", { class: "lab", text: label })]));
    }
  }

  // ------------------------------------------------------------ readings
  function citationCell(text) {
    var td = h("td");
    if (!text) { td.textContent = "\u2014"; return td; }
    text.split(" or ").forEach(function (alt, i) {
      if (i) td.appendChild(h("span", { class: "or", text: " or " }));
      var shown = R.compactCitation(alt), parsed = R.splitAlternative(alt);
      if (parsed && otBooks[parsed.book]) {
        var key = "c" + (citeCounter++);
        td.appendChild(h("button", {
          type: "button", class: "cite", "data-cite": key, "data-alt": alt, "aria-expanded": "false",
          title: "Show the text of " + shown, text: shown,
          onclick: function (ev) { toggleTexts(ev.currentTarget); }
        }));
      } else {
        td.appendChild(document.createTextNode(shown));
      }
    });
    td.title = text;
    return td;
  }

  // ------------------------------------------------------------ OT texts
  function versionRange(passages) {
    if (!passages.length) return "";
    var a = passages[0].ref.split("."), b = passages[passages.length - 1].ref.split(".");
    if (passages.length === 1) return a[0] + ":" + a[1];
    return a[0] + ":" + a[1] + "-" + (a[0] === b[0] ? b[1] : b[0] + ":" + b[1]);
  }

  function versionBlock(result, book) {
    var v = result.version;
    var box = h("div", { class: "vtext", "data-version": v.id });
    var passages = [], notes = [];
    result.parts.forEach(function (part) {
      passages = passages.concat(part.passages);
      part.notes.forEach(function (n) { if (notes.indexOf(n) < 0) notes.push(n); });
    });
    var head = v.label;
    var ranges = result.parts.map(function (p) { return versionRange(p.passages); }).filter(Boolean);
    if (ranges.length) head += " \u00b7 " + book + " " + ranges.join(", ");
    box.appendChild(h("h5", { text: head }));
    if (!result.available) {
      box.appendChild(h("p", { class: "note", text: "Not in this version." }));
      return box;
    }
    var body = h("div", { class: "vbody", lang: v.lang, dir: v.dir });
    passages.forEach(function (p) {
      body.appendChild(h("p", { class: "verse" }, [
        h("sup", { text: p.ref.split(".")[1] }), " ", p.text
      ]));
    });
    box.appendChild(body);
    notes.forEach(function (n) { box.appendChild(h("p", { class: "note", text: R.explainNote(n) })); });
    return box;
  }

  function textsPanel(alt) {
    var parsed = R.splitAlternative(alt);
    var wrap = h("div", { class: "texts" });
    if (!state.versions.length) {
      wrap.appendChild(h("p", { class: "note", text: "Choose one or more versions above to show the text." }));
      return wrap;
    }
    parsed.selections.forEach(function (sel) {
      var group = h("div", { class: "selection" });
      if (parsed.selections.length > 1 || sel.optional) {
        group.appendChild(h("h4", { text: R.compactCitation(parsed.book + " " + sel.ref) +
          (sel.optional ? " (optional)" : "") }));
      }
      var grid = h("div", { class: "vgrid" });
      R.textsFor(cex, otIndex, parsed.book, sel.ref, state.versions).forEach(function (res) {
        grid.appendChild(versionBlock(res, parsed.book));
      });
      group.appendChild(grid);
      wrap.appendChild(group);
    });
    return wrap;
  }

  function closeTexts(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll("tr.texts-row"), function (tr) { tr.remove(); });
    Array.prototype.forEach.call(scope.querySelectorAll(".cite[aria-expanded=true]"), function (b) {
      b.setAttribute("aria-expanded", "false");
    });
  }

  function openTexts(btn) {
    closeTexts(el.readings);
    var tr = btn.closest("tr"), cols = 0;
    Array.prototype.forEach.call(tr.children, function (c) { cols += c.colSpan || 1; });
    var row = h("tr", { class: "texts-row" }, [h("td", { colspan: String(cols) },
      [textsPanel(btn.getAttribute("data-alt"))])]);
    tr.parentNode.insertBefore(row, tr.nextSibling);
    btn.setAttribute("aria-expanded", "true");
    state.open = btn.getAttribute("data-cite");
  }

  function toggleTexts(btn) {
    if (btn.getAttribute("aria-expanded") === "true") {
      closeTexts(el.readings);
      state.open = null;
    } else {
      openTexts(btn);
    }
  }

  function versionChooser() {
    var box = h("fieldset", { class: "versions" }, [h("legend", { text: "Old Testament texts" })]);
    R.VERSIONS.forEach(function (v) {
      var id = "ver-" + v.id;
      var input = h("input", { type: "checkbox", id: id, value: v.id });
      input.checked = state.versions.indexOf(v.id) >= 0;
      input.addEventListener("change", function () {
        state.versions = R.VERSIONS.map(function (d) { return d.id; }).filter(function (x) {
          return document.getElementById("ver-" + x).checked;
        });
        saveVersions(state.versions);
        renderReadings();
        var again = document.getElementById(id);
        if (again) again.focus();
      });
      box.appendChild(h("label", { for: id }, [input, " " + v.label]));
    });
    box.appendChild(h("p", { class: "hint", text: "Click an Old Testament reference to show its text." }));
    return box;
  }

  function lessonsTable(rs) {
    var tracked = rs.length > 1 && rs.every(function (r) { return r.track; });
    var table = h("table", { class: "lessons" });
    if (tracked) {
      table.appendChild(h("thead", {}, [h("tr", {}, [h("th", { text: "" })].concat(rs.map(function (r) {
        return h("th", { scope: "col", text: "Track " + r.track + (r.track === "1" ? " (semicontinuous)" : " (related)") });
      })))]));
    }
    var body = h("tbody");
    LESSONS.forEach(function (pair) {
      var key = pair[0], tr = h("tr", {}, [h("th", { scope: "row", text: pair[1] })]);
      var same = rs.every(function (r) { return r[key] === rs[0][key]; });
      if (tracked && !same) {
        rs.forEach(function (r) { tr.appendChild(citationCell(r[key])); });
      } else {
        var td = citationCell(rs[0][key]);
        if (tracked) td.colSpan = rs.length;
        tr.appendChild(td);
      }
      body.appendChild(tr);
    });
    table.appendChild(body);
    return table;
  }

  function notesFor(rs) {
    var out = [], seen = {};
    rs.forEach(function (r) {
      if (!r.notes || seen[r.notes]) return;
      seen[r.notes] = 1;
      var prefix = rs.length > 1 && r.track ? "Track " + r.track + ": " : "";
      out.push(h("p", { class: "note", text: prefix + R.compactText(r.notes) }));
    });
    return out;
  }

  function sourceLinks(rs) {
    var urls = [];
    rs.forEach(function (r) { if (r.source_url && urls.indexOf(r.source_url) < 0) urls.push(r.source_url); });
    var p = h("p", { class: "src" });
    urls.forEach(function (u, i) {
      if (i) p.appendChild(document.createTextNode(" \u00b7 "));
      p.appendChild(h("a", { href: u, target: "_blank", rel: "noopener",
        text: urls.length > 1 ? "Source text " + (i + 1) : "Source text" }));
    });
    return p;
  }

  function goButton(dn, text) {
    return h("button", { type: "button", class: "linkish", text: text, onclick: function () { select(dn); } });
  }

  function observanceSection(o) {
    var sec = h("section", { class: "obs " + o.role });
    var title = R.fullLabel(o);
    if (o.role === "transferred") {
      sec.appendChild(h("p", { class: "notice" }, [
        R.shortLabel(o) + " is transferred to ", goButton(o.otherDn, shortDate(o.otherDn)), "."
      ]));
      return sec;
    }
    if (o.role === "alternative") {
      sec.appendChild(h("p", { class: "meta" }, [h("span", { class: "tag", text: "Alternative" }),
        o.note || "These readings may be used instead."]));
    }
    sec.appendChild(h("h3", { text: title }));
    var season = o.rows.length ? SEASONS[o.rows[0].season] || "" : "";
    var meta = [o.rows.length && o.rows[0].year === "ABC" ? "All years" : "Year " + o.letter];
    if (season) meta.push(season);
    sec.appendChild(h("p", { class: "meta", text: meta.join(" \u00b7 ") }));
    if (o.note === "transferred-from") {
      sec.appendChild(h("p", { class: "notice" }, ["Transferred from ", goButton(o.otherDn, shortDate(o.otherDn)), "."]));
    }
    var christmas = o.slug === "christmas-day";
    if (christmas) {
      o.rows.forEach(function (r) {
        var svc = h("div", { class: "service" }, [h("h4", { text: r.label.replace(/^.*: /, "") }),
          lessonsTable([r]), sourceLinks([r])]);
        sec.appendChild(svc);
      });
    } else if (o.rows.length) {
      sec.appendChild(lessonsTable(o.rows));
    }
    notesFor(o.rows).forEach(function (n) { sec.appendChild(n); });
    if (o.rows.length && !christmas) sec.appendChild(sourceLinks(o.rows));
    return sec;
  }

  function renderReadings() {
    var dn = state.selected, list = R.observancesOn(rows, dn);
    citeCounter = 0;
    el.readings.textContent = "";
    el.readings.appendChild(h("h2", { class: "date", text: longDate(dn) }));
    var shown = list.filter(function (o) { return o.role !== "transferred"; });
    if (!shown.length) {
      var box = h("div", { class: "empty" }, [
        h("p", { class: "meta", text: "No Sunday or Major Holy Day readings are appointed for this date." })
      ]);
      var nxt = R.nextObservance(rows, dn);
      if (nxt) {
        box.appendChild(h("p", {}, ["Next: ", goButton(nxt.dn,
          shortDate(nxt.dn) + " \u2014 " + R.shortLabel(nxt.observances[0]))]));
      }
      el.readings.appendChild(box);
    }
    list.forEach(function (o) { el.readings.appendChild(observanceSection(o)); });
    if (shown.length) el.readings.insertBefore(versionChooser(), el.readings.children[1]);
    if (state.open) {
      var btn = el.readings.querySelector('[data-cite="' + state.open + '"]');
      if (btn) openTexts(btn); else state.open = null;
    }
  }

  // ------------------------------------------------------------ state
  function select(dn, opts) {
    var hadFocus = !!(document.activeElement && el.grid.contains(document.activeElement));
    if (dn !== state.selected) state.open = null;
    state.selected = dn;
    var p = R.fromDayNumber(dn);
    state.viewY = p.y; state.viewM = p.m;
    el.input.value = R.isoDate(dn);
    renderCalendar();
    renderReadings();
    try { history.replaceState(null, "", "#" + R.isoDate(dn)); } catch (e) { /* file:// in some browsers */ }
    if (hadFocus && (!opts || opts.focus !== false)) {
      var btn = el.grid.querySelector('[data-dn="' + dn + '"]');
      if (btn) btn.focus();
    }
  }
  function shiftMonth(delta) {
    var m = state.viewM + delta, y = state.viewY;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    state.viewY = y; state.viewM = m;
    renderCalendar();
  }

  el.prev.addEventListener("click", function () { shiftMonth(-1); });
  el.next.addEventListener("click", function () { shiftMonth(1); });
  el.today.addEventListener("click", function () { select(todayDn()); });
  el.input.addEventListener("change", function () {
    var dn = R.parseIsoDate(el.input.value);
    if (dn !== null) select(dn);
  });
  el.grid.addEventListener("keydown", function (ev) {
    var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key];
    if (step === undefined) return;
    ev.preventDefault();
    select(state.selected + step);
  });
  window.addEventListener("hashchange", function () {
    var dn = R.parseIsoDate(location.hash.slice(1));
    if (dn !== null && dn !== state.selected) select(dn, { focus: false });
  });

  var initial = R.parseIsoDate(location.hash.slice(1));
  select(initial !== null ? initial : todayDn(), { focus: false });
})();
