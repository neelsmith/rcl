/*
 * Psalm recordings: pure helpers (no DOM), shared by the browser (`RCLAudio`)
 * and Node tests.
 *
 * A mapping file is pipe-delimited with a header that includes `selection`
 * and `file` (and optionally `psalm`, `coverage`), as in
 * data/psalm_audio_map.txt:
 *
 *   selection|psalm|file|coverage
 *   103:1-103:13|103|Compilations/.../15 Psalm 103.m4a|excerpt
 *
 * `selection` is a psalm selection in canonical form without the book name;
 * `file` is relative to the user's music folder.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RCLAudio = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /**
   * Parse a mapping file. Returns {map: {selection: [{file, coverage}]}, count, errors}.
   * A file with errors in its header returns an empty map.
   */
  function parseMap(text) {
    var lines = (text || "").split(/\r?\n/).filter(function (l) { return l.trim(); });
    var out = { map: {}, count: 0, errors: [] };
    if (!lines.length) { out.errors.push("The mapping file is empty."); return out; }
    var header = lines[0].split("|").map(function (h) { return h.trim(); });
    var iSel = header.indexOf("selection"), iFile = header.indexOf("file"), iCov = header.indexOf("coverage");
    if (iSel < 0 || iFile < 0) {
      out.errors.push("The first line must name the columns, including \u201cselection\u201d and \u201cfile\u201d.");
      return out;
    }
    lines.slice(1).forEach(function (line, i) {
      var f = line.split("|");
      var sel = (f[iSel] || "").trim(), file = (f[iFile] || "").trim();
      if (!/^\d+(:\d+[a-z]?(-\d+:\d+[a-z]?)?)?$/.test(sel) || !file) {
        out.errors.push("Line " + (i + 2) + " is not a psalm selection and file.");
        return;
      }
      (out.map[sel] = out.map[sel] || []).push({ file: file, coverage: iCov >= 0 ? (f[iCov] || "").trim() : "" });
      out.count++;
    });
    return out;
  }

  /**
   * Recordings for one alternative of a psalm citation, in order, without
   * repeating a file: [{file, coverage, selections: [...]}]. `alt` is canonical,
   * e.g. "Psalm 103:1-103:13, 103:22"; anything but a psalm returns [].
   * `split` is RCL.splitAlternative.
   */
  function recordingsFor(map, alt, split) {
    var parsed = split(alt);
    if (!parsed || parsed.book !== "Psalm") return [];
    var out = [], byFile = {};
    parsed.selections.forEach(function (s) {
      (map[s.ref] || []).forEach(function (r) {
        if (byFile[r.file]) {
          byFile[r.file].selections.push(s.ref);
          if (r.coverage !== "whole") byFile[r.file].coverage = "excerpt";
          return;
        }
        var rec = { file: r.file, coverage: r.coverage, selections: [s.ref] };
        byFile[r.file] = rec;
        out.push(rec);
      });
    });
    // Several selections from one recording are always an excerpt of it.
    out.forEach(function (r) { if (r.selections.length > 1) r.coverage = "excerpt"; });
    return out;
  }

  /**
   * Parse the recordings catalog (data/psalm_audio_files.txt):
   * {file: {file, psalm, verses, artist, album, chants}}. Unknown columns are kept too.
   */
  function parseCatalog(text) {
    var lines = (text || "").split(/\r?\n/).filter(function (l) { return l.trim(); });
    var out = {};
    if (!lines.length) return out;
    var header = lines[0].split("|");
    if (header.indexOf("file") < 0) return out;
    lines.slice(1).forEach(function (line) {
      var f = line.split("|"), row = {};
      header.forEach(function (h, i) { row[h] = (f[i] || "").trim(); });
      if (row.file) out[row.file] = row;
    });
    return out;
  }

  /** Join a base URL and a relative path, escaping each path segment. */
  function joinUrl(base, path) {
    var b = (base || "").replace(/\/+$/, "");
    return b + "/" + path.split("/").map(encodeURIComponent).join("/");
  }

  /** Accept "file:///…", "http(s)://…" or an absolute path ("/Users/…", "C:\…"). */
  function normalizeBase(input) {
    var s = (input || "").trim();
    if (!s) return "";
    if (/^(https?|file):\/\//i.test(s)) return s;
    if (/^[A-Za-z]:[\\/]/.test(s)) return "file:///" + s.replace(/\\/g, "/");
    if (s.charAt(0) === "/") return "file://" + s;
    return null;
  }

  /**
   * Index files picked with <input webkitdirectory>: {relativePath: file}.
   * Paths are made relative to the chosen folder (its own name is dropped).
   */
  function indexPicked(files) {
    var index = {};
    Array.prototype.forEach.call(files, function (f) {
      var rel = (f.webkitRelativePath || f.name).split("/").slice(1).join("/");
      if (rel) index[rel] = f;
    });
    return index;
  }

  /**
   * Find a mapped path in an index of picked files. Exact match first, then a
   * match where one path ends with the other (the user chose a folder one level
   * above or below the one the mapping is relative to).
   */
  function findPicked(index, path) {
    if (index[path]) return index[path];
    var keys = Object.keys(index);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.length > path.length ? k.slice(-path.length - 1) === "/" + path
        : path.slice(-k.length - 1) === "/" + k) return index[k];
    }
    return null;
  }

  /** Short description of a recording from its path: {title, album}. */
  function describe(path) {
    var parts = path.split("/");
    var name = parts[parts.length - 1].replace(/\.[^.]+$/, "").replace(/^[\d-]+\s+/, "");
    var album = parts.length > 1 ? parts[parts.length - 2] : "";
    var artist = parts.length > 2 ? parts[parts.length - 3] : "";
    if (artist === "Compilations") artist = "";
    return { title: name, album: album, artist: artist.replace(/_/g, ",").replace(/\s+,/g, ",") };
  }

  return {
    parseMap: parseMap, parseCatalog: parseCatalog, recordingsFor: recordingsFor, joinUrl: joinUrl,
    normalizeBase: normalizeBase, indexPicked: indexPicked, findPicked: findPicked, describe: describe
  };
});
