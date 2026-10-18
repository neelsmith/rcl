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
    readings: document.getElementById("readings"),
    texts: document.getElementById("texts"),
    top: document.getElementById("top"),
    fold: document.getElementById("cal-fold")
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
    el.title.textContent = state.folded ? longDate(state.selected) : MONTHS[m - 1] + " " + y;
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
      var play = playButton(alt, shown);
      if (play) td.appendChild(play);
    });
    td.title = text;
    return td;
  }

  // ------------------------------------------------------------ recordings
  // Audio is optional and off until the user chooses where recordings are:
  //  - a folder picked with the File System Access API (remembered, Chromium browsers),
  //  - a folder picked with <input webkitdirectory> (other browsers; this visit only), or
  //  - a folder path / web address typed in (remembered).
  var A = window.RCLAudio;
  var AUDIO_KEYS = { base: "rcl.audio.base", map: "rcl.audio.map", mapName: "rcl.audio.mapName" };
  var BUILTIN_MAP = document.getElementById("audio-map").textContent;
  var audio = { source: null, pendingHandle: null, mapName: "", parsed: A.parseMap(BUILTIN_MAP),
    queue: [], pos: 0, objectUrl: null, playingAlt: null };
  var ael = {
    badge: document.getElementById("audio-badge"),
    sourceStatus: document.getElementById("audio-source-status"),
    folderBtn: document.getElementById("audio-folder-btn"),
    reconnectBtn: document.getElementById("audio-reconnect-btn"),
    offBtn: document.getElementById("audio-off-btn"),
    folderInput: document.getElementById("audio-folder-input"),
    baseForm: document.getElementById("audio-base-form"),
    base: document.getElementById("audio-base"),
    mapStatus: document.getElementById("audio-map-status"),
    mapBtn: document.getElementById("audio-map-btn"),
    mapReset: document.getElementById("audio-map-reset"),
    mapInput: document.getElementById("audio-map-input"),
    player: document.getElementById("player"),
    playerTitle: document.getElementById("player-title"),
    playerMeta: document.getElementById("player-meta"),
    playerAudio: document.getElementById("player-audio"),
    playerClose: document.getElementById("player-close")
  };

  function store(key, value) {
    try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (e) { /* unavailable */ }
  }
  function stored(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  // Remember a picked directory handle (Chromium) in IndexedDB.
  function idb(mode, fn) {
    return new Promise(function (resolve) {
      try {
        var req = indexedDB.open("rcl-audio", 1);
        req.onupgradeneeded = function () { req.result.createObjectStore("handles"); };
        req.onsuccess = function () {
          var tx = req.result.transaction("handles", mode), st = tx.objectStore("handles");
          var r = fn(st);
          tx.oncomplete = function () { resolve(r && r.result); };
          tx.onerror = tx.onabort = function () { resolve(null); };
        };
        req.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }
  function saveHandle(handle) { return idb("readwrite", function (st) { return handle ? st.put(handle, "music") : st.delete("music"); }); }
  function loadHandle() { return idb("readonly", function (st) { return st.get("music"); }); }

  function audioOn() { return !!audio.source; }

  function setSource(src) {
    audio.source = src;
    if (!src || src.kind !== "handle") saveHandle(null);
    if (!src || src.kind !== "url") store(AUDIO_KEYS.base, null);
    if (src && src.kind === "url") store(AUDIO_KEYS.base, src.base);
    if (src && src.kind === "handle") saveHandle(src.handle);
    if (!src) closePlayer();
    audio.pendingHandle = null;
    updateAudioSettings();
    renderReadings();
  }

  function updateAudioSettings() {
    var s = audio.source, msg;
    if (!s && audio.pendingHandle) {
      msg = "“" + audio.pendingHandle.name + "” needs your permission again. Click Reconnect.";
    } else if (!s) {
      msg = "Not set. Recordings are off.";
    } else if (s.kind === "url") {
      msg = "Recordings from " + s.base;
    } else if (s.kind === "handle") {
      msg = "Recordings from the folder “" + s.handle.name + "” (remembered).";
    } else {
      msg = "Recordings from the folder “" + s.name + "” (" + Object.keys(s.index).length +
        " files; choose it again on your next visit).";
    }
    ael.sourceStatus.textContent = msg;
    ael.sourceStatus.className = "status" + (!s && audio.pendingHandle ? " warn" : "");
    ael.reconnectBtn.hidden = !audio.pendingHandle;
    ael.offBtn.hidden = !s;
    ael.badge.textContent = s ? "on" : "off";
    ael.badge.className = "badge" + (s ? " on" : "");
    if (s && s.kind === "url") ael.base.value = s.base;
    var p = audio.parsed, name = audio.mapName;
    var count = Object.keys(p.map).length;
    ael.mapStatus.textContent = (name ? "Custom mapping “" + name + "”" : "Built-in mapping") +
      ": " + count + " psalm selection" + (count === 1 ? "" : "s") +
      (p.errors.length ? "; " + p.errors.length + " line" + (p.errors.length === 1 ? "" : "s") +
        " could not be read (" + p.errors[0] + ")" : ".");
    ael.mapStatus.className = "status" + (p.errors.length ? " warn" : "");
    ael.mapReset.hidden = !name;
  }

  function setMap(text, name) {
    var parsed = A.parseMap(text);
    if (name && !parsed.count) {
      ael.mapStatus.textContent = "“" + name + "” was not used: " + (parsed.errors[0] || "no psalm selections found.");
      ael.mapStatus.className = "status warn";
      return;
    }
    audio.parsed = parsed;
    audio.mapName = name || "";
    store(AUDIO_KEYS.map, name ? text : null);
    store(AUDIO_KEYS.mapName, name || null);
    updateAudioSettings();
    renderReadings();
  }

  /** URL for a recording, or null if it cannot be found. */
  function recordingUrl(file) {
    var s = audio.source;
    if (!s) return Promise.resolve(null);
    if (s.kind === "url") return Promise.resolve(A.joinUrl(s.base, file));
    if (s.kind === "picked") {
      var f = A.findPicked(s.index, file);
      return Promise.resolve(f ? URL.createObjectURL(f) : null);
    }
    // directory handle: walk the path
    var parts = file.split("/");
    return parts.slice(0, -1).reduce(function (p, name) {
      return p.then(function (dir) { return dir.getDirectoryHandle(name); });
    }, Promise.resolve(s.handle)).then(function (dir) {
      return dir.getFileHandle(parts[parts.length - 1]);
    }).then(function (fh) { return fh.getFile(); }).then(function (f) {
      return URL.createObjectURL(f);
    }).catch(function () { return null; });
  }

  function playButton(alt, shown) {
    var recs = A.recordingsFor(audio.parsed.map, alt, R.splitAlternative);
    if (!audioOn() || !recs.length) return null;
    var playing = audio.playingAlt === alt && !ael.player.hidden;
    return h("button", {
      type: "button", class: "play" + (playing ? " playing" : ""), "data-alt": alt,
      "aria-label": "Play a recording of " + shown, title: "Play a recording of " + shown, text: "▶",
      onclick: function () { playQueue(recs, alt, shown); }
    });
  }

  function markPlaying() {
    Array.prototype.forEach.call(document.querySelectorAll("button.play"), function (b) {
      b.classList.toggle("playing", !ael.player.hidden && b.getAttribute("data-alt") === audio.playingAlt);
    });
  }

  function playQueue(recs, alt, shown) {
    audio.queue = recs; audio.pos = 0; audio.playingAlt = alt; audio.shown = shown;
    playCurrent();
  }

  function playCurrent() {
    var rec = audio.queue[audio.pos];
    if (!rec) { closePlayer(); return; }
    var d = A.describe(rec.file);
    ael.player.hidden = false;
    document.body.classList.add("has-player");
    ael.playerTitle.textContent = audio.shown + (audio.queue.length > 1 ? " (" + (audio.pos + 1) + " of " + audio.queue.length + ")" : "");
    var meta = [d.title, d.album, d.artist].filter(Boolean).join(" · ");
    ael.playerMeta.textContent = meta;
    if (rec.coverage === "excerpt") {
      ael.playerMeta.appendChild(h("div", { text: "The recording has more than the appointed verses (" +
        R.compactCitation("Psalm " + rec.selections.join(", ")) + ")." }));
    }
    markPlaying();
    recordingUrl(rec.file).then(function (url) {
      if (audio.queue[audio.pos] !== rec) return;
      if (audio.objectUrl) { URL.revokeObjectURL(audio.objectUrl); audio.objectUrl = null; }
      if (!url) { showPlayerError("Not found in your music folder: " + rec.file); return; }
      if (url.indexOf("blob:") === 0) audio.objectUrl = url;
      ael.playerAudio.src = url;
      var p = ael.playerAudio.play();
      if (p && p.catch) p.catch(function () { /* autoplay refused or load error: handled by error event */ });
    });
  }

  function showPlayerError(text) {
    ael.playerMeta.appendChild(h("div", { class: "warn", text: text }));
  }

  function closePlayer() {
    ael.playerAudio.pause();
    ael.playerAudio.removeAttribute("src");
    ael.playerAudio.load();
    if (audio.objectUrl) { URL.revokeObjectURL(audio.objectUrl); audio.objectUrl = null; }
    ael.player.hidden = true;
    document.body.classList.remove("has-player");
    audio.queue = []; audio.playingAlt = null;
    markPlaying();
  }

  ael.playerAudio.addEventListener("ended", function () {
    if (audio.pos + 1 < audio.queue.length) { audio.pos++; playCurrent(); } else { markPlaying(); }
  });
  ael.playerAudio.addEventListener("error", function () {
    if (!ael.playerAudio.getAttribute("src")) return;
    var rec = audio.queue[audio.pos];
    showPlayerError("Could not load " + (rec ? rec.file : "the recording") + ". Check the music folder setting.");
  });
  ael.playerClose.addEventListener("click", closePlayer);

  ael.folderBtn.addEventListener("click", function () {
    if (window.showDirectoryPicker) {
      window.showDirectoryPicker({ id: "rcl-music", mode: "read" }).then(function (handle) {
        setSource({ kind: "handle", handle: handle });
      }).catch(function () { /* cancelled */ });
    } else {
      ael.folderInput.click();
    }
  });
  ael.folderInput.addEventListener("change", function () {
    var files = ael.folderInput.files;
    if (!files || !files.length) return;
    var first = files[0].webkitRelativePath || files[0].name;
    setSource({ kind: "picked", index: A.indexPicked(files), name: first.split("/")[0] });
    ael.folderInput.value = "";
  });
  ael.reconnectBtn.addEventListener("click", function () {
    var handle = audio.pendingHandle;
    if (!handle) return;
    handle.requestPermission({ mode: "read" }).then(function (state) {
      if (state === "granted") setSource({ kind: "handle", handle: handle });
    }).catch(function () { /* refused */ });
  });
  ael.offBtn.addEventListener("click", function () { setSource(null); });
  ael.baseForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var base = A.normalizeBase(ael.base.value);
    if (base === null) {
      ael.sourceStatus.textContent = "Enter a full path (starting with /) or a web address.";
      ael.sourceStatus.className = "status warn";
      return;
    }
    setSource(base ? { kind: "url", base: base } : null);
  });
  ael.mapBtn.addEventListener("click", function () { ael.mapInput.click(); });
  ael.mapInput.addEventListener("change", function () {
    var f = ael.mapInput.files && ael.mapInput.files[0];
    if (!f) return;
    f.text().then(function (text) { setMap(text, f.name); });
    ael.mapInput.value = "";
  });
  ael.mapReset.addEventListener("click", function () { setMap(BUILTIN_MAP, ""); });

  function initAudio() {
    var mapText = stored(AUDIO_KEYS.map), mapName = stored(AUDIO_KEYS.mapName);
    if (mapText && mapName) { audio.parsed = A.parseMap(mapText); audio.mapName = mapName; }
    var base = stored(AUDIO_KEYS.base);
    if (base) audio.source = { kind: "url", base: base };
    updateAudioSettings();
    if (audio.source || !window.indexedDB) return;
    loadHandle().then(function (handle) {
      if (!handle || audio.source) return;
      var q = handle.queryPermission ? handle.queryPermission({ mode: "read" }) : Promise.resolve("prompt");
      q.then(function (state) {
        if (state === "granted") { audio.source = { kind: "handle", handle: handle }; renderReadings(); }
        else audio.pendingHandle = handle;
        updateAudioSettings();
      });
    });
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

  /** The chosen versions that are offered for this alternative. */
  function shownVersions(alt) {
    var offered = R.offeredVersions(otIndex, alt).map(function (v) { return v.id; });
    return state.versions.filter(function (id) { return offered.indexOf(id) >= 0; });
  }

  function textsPanel(alt) {
    var parsed = R.splitAlternative(alt);
    var wrap = h("div", { class: "texts" });
    var versions = shownVersions(alt);
    if (!versions.length) {
      wrap.appendChild(h("p", { class: "note", text: "Choose one or more versions to show the text." }));
      return wrap;
    }
    parsed.selections.forEach(function (sel) {
      var group = h("div", { class: "selection" });
      if (parsed.selections.length > 1 || sel.optional) {
        group.appendChild(h("h4", { text: R.compactCitation(parsed.book + " " + sel.ref) +
          (sel.optional ? " (optional)" : "") }));
      }
      var grid = h("div", { class: "vgrid" });
      R.textsFor(cex, otIndex, parsed.book, sel.ref, versions).forEach(function (res) {
        grid.appendChild(versionBlock(res, parsed.book));
      });
      group.appendChild(grid);
      wrap.appendChild(group);
    });
    return wrap;
  }

  // The texts of the open reference are shown in their own full-width panel
  // below the calendar and the readings.
  function closeTexts() {
    el.texts.textContent = "";
    el.texts.hidden = true;
    Array.prototype.forEach.call(el.readings.querySelectorAll(".cite[aria-expanded=true]"), function (b) {
      b.setAttribute("aria-expanded", "false");
    });
  }

  /** "Proper 24 · Psalm · Track 2", from where the reference sits in the readings. */
  function citationContext(btn) {
    var parts = [], sec = btn.closest("section.obs"), tr = btn.closest("tr"), td = btn.closest("td");
    var title = sec && sec.querySelector("h3");
    if (title) parts.push(title.textContent);
    var service = btn.closest(".service");
    if (service && service.querySelector("h4")) parts.push(service.querySelector("h4").textContent);
    var th = tr && tr.querySelector("th[scope=row]");
    if (th) parts.push(th.textContent);
    var table = btn.closest("table"), head = table && table.querySelector("thead tr");
    if (head && td && td.colSpan === 1) {
      var col = Array.prototype.indexOf.call(tr.children, td);
      var hcell = head.children[col];
      if (hcell && hcell.textContent) parts.push(hcell.textContent.replace(/ \(.*\)$/, ""));
    }
    return parts.join(" \u00b7 ");
  }

  function openTexts(btn, opts) {
    closeTexts();
    var alt = btn.getAttribute("data-alt");
    el.texts.appendChild(h("div", { class: "texts-head" }, [
      h("div", {}, [
        h("h2", { text: R.compactCitation(alt) }),
        h("p", { class: "meta", text: longDate(state.selected) + " \u00b7 " + citationContext(btn) })
      ]),
      h("button", { class: "btn icon-btn", type: "button", "aria-label": "Close text", text: "\u00d7",
        onclick: function () { closeTexts(); state.open = null; } })
    ]));
    el.texts.appendChild(versionChooser(alt));
    el.texts.appendChild(textsPanel(alt));
    el.texts.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    state.open = btn.getAttribute("data-cite");
    if (!opts || !opts.quiet) {
      var r = el.texts.getBoundingClientRect();
      if (r.top > window.innerHeight - 120 || r.top < 0) {
        el.texts.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  function toggleTexts(btn) {
    if (btn.getAttribute("aria-expanded") === "true") {
      closeTexts();
      state.open = null;
    } else {
      openTexts(btn);
    }
  }

  // ------------------------------------------------------------ fold the calendar
  var FOLD_KEY = "rcl.calendarFolded";
  function setFolded(folded) {
    state.folded = folded;
    el.top.classList.toggle("folded", folded);
    el.fold.textContent = folded ? "Show calendar" : "Hide calendar";
    el.fold.setAttribute("aria-expanded", folded ? "false" : "true");
    try { localStorage.setItem(FOLD_KEY, folded ? "1" : "0"); } catch (e) { /* unavailable */ }
    renderCalendar();
  }
  el.fold.addEventListener("click", function () { setFolded(!state.folded); });

  function versionChooser(alt) {
    var box = h("fieldset", { class: "versions" }, [h("legend", { text: "Old Testament texts" })]);
    var offered = R.offeredVersions(otIndex, alt);
    offered.forEach(function (v) {
      var id = "ver-" + v.id;
      var input = h("input", { type: "checkbox", id: id, value: v.id });
      input.checked = state.versions.indexOf(v.id) >= 0;
      input.addEventListener("change", function () {
        // Versions not offered here (Onkelos outside the Torah) keep their saved setting.
        state.versions = R.VERSIONS.map(function (d) { return d.id; }).filter(function (x) {
          var box = document.getElementById("ver-" + x);
          return box ? box.checked : state.versions.indexOf(x) >= 0;
        });
        saveVersions(state.versions);
        // Re-render only the open text, keeping the chooser and focus in place.
        var btn = state.open && el.readings.querySelector('[data-cite="' + state.open + '"]');
        if (btn) openTexts(btn, { quiet: true });
        var again = document.getElementById(id);
        if (again) again.focus();
      });
      box.appendChild(h("label", { for: id }, [input, " " + v.label]));
    });
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
    closeTexts();
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
    if (shown.length && el.readings.querySelector(".cite")) {
      el.readings.insertBefore(h("p", { class: "hint", text:
        "Click an underlined Old Testament reference to read its text below." }),
        el.readings.children[1]);
    }
    if (state.open) {
      var btn = el.readings.querySelector('[data-cite="' + state.open + '"]');
      if (btn) openTexts(btn, { quiet: true }); else state.open = null;
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

  initAudio();
  var wasFolded = false;
  try { wasFolded = localStorage.getItem(FOLD_KEY) === "1"; } catch (e) { /* unavailable */ }
  state.folded = false;
  if (wasFolded) { state.folded = true; el.top.classList.add("folded"); el.fold.textContent = "Show calendar"; el.fold.setAttribute("aria-expanded", "false"); }
  var initial = R.parseIsoDate(location.hash.slice(1));
  select(initial !== null ? initial : todayDn(), { focus: false });
})();
