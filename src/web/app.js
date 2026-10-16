/* Calendar and readings UI. Depends on lectionary.js (global RCL). */
(function () {
  "use strict";
  var R = window.RCL;
  var rows = R.parseData(document.getElementById("rcl-data").textContent);

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

  var state = { selected: todayDn(), viewY: 0, viewM: 0 };

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
    if (!text) { td.textContent = "—"; return td; }
    R.compactCitation(text).split(" or ").forEach(function (alt, i) {
      if (i) td.appendChild(h("span", { class: "or", text: " or " }));
      td.appendChild(document.createTextNode(alt));
    });
    td.title = text;
    return td;
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
    sec.appendChild(h("p", { class: "meta", text: meta.join(" · ") }));
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
          shortDate(nxt.dn) + " — " + R.shortLabel(nxt.observances[0]))]));
      }
      el.readings.appendChild(box);
    }
    list.forEach(function (o) { el.readings.appendChild(observanceSection(o)); });
  }

  // ------------------------------------------------------------ state
  function select(dn, opts) {
    var hadFocus = !!(document.activeElement && el.grid.contains(document.activeElement));
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
