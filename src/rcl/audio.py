"""Recordings of chanted psalms: a catalog of audio files and a map from the
psalm selections in the readings to those files.

Files (pipe-delimited, in data/):

- `psalm_audio_files.txt`: `file|psalm|verses|artist|album|chants`
  One row per recording. `file` is relative to the music folder (configured
  separately, not stored here). `verses` is empty when the recording is the
  whole psalm, else a range such as `1-32` (Psalm 119 is recorded in parts).
- `psalm_audio_map.txt`: `selection|psalm|file|coverage`
  One row per psalm selection cited in the readings (from the reading columns
  and the notes, e.g. the Liturgy of the Palms psalm) and per matching
  recording. `selection` is in canonical citation form without the book name
  (`103:1-103:13`, `23`). `coverage` is `whole` when the recording is exactly
  the selection, `excerpt` when the recording contains more than the selection.

Command line (from the repository root):
    python3 src/rcl/audio.py                       # rebuild the map from the catalog
    python3 src/rcl/audio.py --catalog-from LIST   # rebuild the catalog from a listing, then the map

A listing has album headings ending in ":" (`Artist/Album:`) followed by file
names such as `01 Psalm 105 (Attwood, Deffell).m4a` or `9-01 Psalm 119, 1-32.m4a`.
"""
import os
import re
import sys

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rcl.datafile import READING_COLUMNS, read_rows  # noqa: E402
from rcl.passages import selections  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data")
CATALOG = os.path.join(DATA, "psalm_audio_files.txt")
MAP = os.path.join(DATA, "psalm_audio_map.txt")
CATALOG_HEADER = "file|psalm|verses|artist|album|chants"
MAP_HEADER = "selection|psalm|file|coverage"

_TRACK = re.compile(r"^[\d-]+ Psalm (\d+)(?:, (\d+)-(\d+))?(?: \((.*)\))?\.\w+$")
_SELECTION = re.compile(r"^(\d+)(?::(\d+)[a-z]?(?:-(\d+):(\d+)[a-z]?)?)?$")
_NOTE_PSALM = re.compile(r"\bPsalm ((?:\(?\d+(?::\d+[a-z]?(?:-\d+:\d+[a-z]?)?)?\)?(?:, (?=[(\d]))?)+)")
WHOLE = 10_000  # "to the end of the psalm"


# ------------------------------------------------------------------ catalog
def parse_listing(text):
    """Catalog rows (dicts) from a listing of album headings and file names."""
    rows, album = [], None
    for n, line in enumerate(text.splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        if line.endswith(":"):
            album = line[:-1]
            continue
        m = _TRACK.match(line)
        if not m or album is None:
            raise ValueError(f"line {n}: cannot read {line!r}")
        psalm, lo, hi, chants = m.groups()
        artist, _, album_name = album.partition("/")
        rows.append({"file": f"{album}/{line}", "psalm": psalm,
                     "verses": f"{lo}-{hi}" if lo else "",
                     "artist": artist, "album": album_name, "chants": chants or ""})
    return rows


def format_catalog(rows):
    return [CATALOG_HEADER] + ["|".join(r[c] for c in CATALOG_HEADER.split("|")) for r in rows]


def parse_catalog(lines):
    lines = [ln for ln in lines if ln.strip()]
    cols = CATALOG_HEADER.split("|")
    return [dict(zip(cols, ln.split("|"))) for ln in lines[1:]]


def recorded_range(row):
    """(first verse, last verse) covered by a catalog row; whole psalm = (1, WHOLE)."""
    if not row["verses"]:
        return 1, WHOLE
    lo, hi = row["verses"].split("-")
    return int(lo), int(hi)


# --------------------------------------------------------------- selections
def selection_range(selection):
    """'103:1-103:13' -> (103, 1, 13); '23' -> (23, 1, WHOLE). Cross-psalm ranges are rejected."""
    m = _SELECTION.match(selection)
    if not m:
        raise ValueError(f"not a psalm selection: {selection!r}")
    c, v1, c2, v2 = m.groups()
    if v1 is None:
        return int(c), 1, WHOLE
    if c2 is not None and c2 != c:
        raise ValueError(f"selection spans psalms: {selection!r}")
    return int(c), int(v1), int(v2) if v2 else int(v1)


def psalm_selections(reading_rows):
    """Every psalm selection cited in the readings (reading columns and notes)."""
    found = set()
    for row in reading_rows:
        for col in READING_COLUMNS:
            found.update(ref for book, ref in selections(row[col]) if book == "Psalm")
        for m in _NOTE_PSALM.finditer(row.get("notes", "")):
            found.update(ref for _, ref in selections("Psalm " + m.group(1)))
    return found


def match(selection, catalog):
    """[(catalog row, coverage)] for the recordings that contain any of the selection."""
    psalm, v1, v2 = selection_range(selection)
    out = []
    for row in catalog:
        if int(row["psalm"]) != psalm:
            continue
        lo, hi = recorded_range(row)
        if lo <= v2 and hi >= v1:
            out.append((row, "whole" if (lo, hi) == (v1, v2) else "excerpt"))
    return out


def sort_key(selection):
    psalm, v1, _ = selection_range(selection)
    return psalm, v1, selection


def build_map(reading_rows, catalog):
    """Map lines (header first). Raises ValueError if a selection has no recording."""
    lines, missing = [MAP_HEADER], []
    for sel in sorted(psalm_selections(reading_rows), key=sort_key):
        hits = match(sel, catalog)
        if not hits:
            missing.append(sel)
        for row, coverage in hits:
            lines.append(f"{sel}|{row['psalm']}|{row['file']}|{coverage}")
    if missing:
        raise ValueError("no recording for psalm selections: " + ", ".join(missing))
    return lines


def write(path, lines):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    try:
        if argv[:1] == ["--catalog-from"]:
            if len(argv) != 2:
                print(__doc__.strip(), file=sys.stderr)
                return 2
            with open(argv[1], encoding="utf-8") as fh:
                write(CATALOG, format_catalog(parse_listing(fh.read())))
        elif argv:
            print(__doc__.strip(), file=sys.stderr)
            return 2
        with open(CATALOG, encoding="utf-8") as fh:
            catalog = parse_catalog(fh.read().splitlines())
        lines = build_map(read_rows(os.path.join(DATA, "rcl_readings.txt")), catalog)
    except (OSError, ValueError) as exc:
        print(f"failed: {exc}", file=sys.stderr)
        return 1
    write(MAP, lines)
    cov = [ln.rsplit("|", 1)[1] for ln in lines[1:]]
    print(f"{len(catalog)} recordings; {len(lines) - 1} map rows "
          f"({cov.count('whole')} whole, {cov.count('excerpt')} excerpt)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
