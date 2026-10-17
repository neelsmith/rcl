"""Extract the Old Testament passages cited in the readings from the compnov corpus.

Writes two files used by the web app:

- `data/ot_passages.cex`: a `#!ctsdata` block with only the cited verses
  (`urn|text`), in corpus order, for every available version
  (masoretic, onkelos, septuagint, vulgate).
- `data/ot_index.txt`: `book|selection|version|first_urn|last_urn|note`.
  One row per selection, such as `Psalm|103:1-103:13`, and per version. A
  selection covers the passages from first_urn to last_urn in corpus order;
  some selections need several rows (e.g. BCP Psalm 116 is Septuagint 114 and
  115). `note` holds space-separated codes: `psalm=N` (the BCP psalm is
  numbered N in this version), `titles` (verse numbers may count a psalm's
  title), `missing` (no text at this reference in this version) and `partial`
  (only part of the reference exists in this version).

Numbering: the readings use BCP/English numbering. Psalm numbers are converted
to Septuagint/Vulgate numbering (BCP 23 = LXX 22, and so on). Other
differences in versification are not mapped yet. For example, the Masoretic,
Septuagint and Vulgate count psalm titles as verses, and Malachi 4 = Masoretic
3:19-24. In those cases the lookup uses the same numbers, and the index row
carries a note code.

Command line:
    python3 src/rcl/passages.py [CORPUS]    # path or URL to compnov.cex
"""
import os
import re
import sys
import urllib.request

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rcl.books import read_book_urns  # noqa: E402
from rcl.citations import split_book  # noqa: E402
from rcl.datafile import READING_COLUMNS, read_rows  # noqa: E402

CORPUS_URL = "https://raw.githubusercontent.com/neelsmith/compnov/refs/heads/main/corpus/compnov.cex"
OT_VERSIONS = ("masoretic", "onkelos", "septuagint", "vulgate")
URN_BASE = "urn:cts:compnov:"
INDEX_HEADER = "book|selection|version|first_urn|last_urn|note"

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data")

_PASSAGE = re.compile(r"^(\d+)\.(\d+)([a-z]*)$")
_REF = re.compile(r"^(\d+)(?::(\d+)[a-z]?(?:-(\d+):(\d+)[a-z]?)?)?$")

# Note codes in the index's `note` column (space-separated); the app explains them.
#   psalm=N   the BCP psalm is numbered N in this version
#   titles    verse numbers may count the psalm's title as verse 1 or 2
#   missing   no text at this reference in this version's numbering
#   partial   only part of the reference exists in this version's numbering
NOTE_CODES = ("psalm=", "titles", "missing", "partial")


# ------------------------------------------------------------------- corpus
def parse_corpus(lines):
    """{work: [(passage, text), ...]} in corpus order, from `#!ctsdata` lines."""
    works = {}
    for line in lines:
        if not line.startswith(URN_BASE):
            continue
        urn, _, text = line.rstrip("\n").partition("|")
        parts = urn.split(":")
        if len(parts) != 5:
            continue
        works.setdefault(parts[3], []).append((parts[4], text))
    return works


def load_corpus(source=CORPUS_URL):
    """Read compnov.cex from a local path or an http(s) URL."""
    if re.match(r"^https?://", source):
        with urllib.request.urlopen(source) as resp:
            text = resp.read().decode("utf-8")
    else:
        with open(source, encoding="utf-8") as fh:
            text = fh.read()
    return parse_corpus(text.splitlines())


def passage_key(passage):
    m = _PASSAGE.match(passage)
    return (int(m.group(1)), int(m.group(2))) if m else None


# ------------------------------------------------------------- versification
def _whole(c):
    return (c, 1, c, 9999)


def map_psalm(c, v):
    """BCP (Hebrew) psalm c, verse v -> (chapter, verse) in Septuagint/Vulgate numbering."""
    if c <= 9 or c >= 148:
        return c, v
    if c == 10:
        return 9, v + 21
    if c <= 113:
        return c - 1, v
    if c == 114:
        return 113, v
    if c == 115:
        return 113, v + 8
    if c == 116:
        return (114, v) if v <= 9 else (115, v - 9)
    if c <= 146:
        return c - 1, v
    # c == 147
    return (146, v) if v <= 11 else (147, v - 11)


def map_psalm_range(rng):
    """Map a BCP psalm range (c1, v1, c2, v2) to a list of LXX/Vulgate ranges."""
    c1, v1, c2, v2 = rng
    whole = v1 == 1 and v2 == 9999 and c1 == c2
    if whole:
        special = {10: [(9, 22, 9, 9999)], 114: [(113, 1, 113, 8)], 115: [(113, 9, 113, 9999)],
                   116: [_whole(114), _whole(115)], 147: [_whole(146), _whole(147)]}
        if c1 in special:
            return special[c1]
        m, _ = map_psalm(c1, 1)
        return [_whole(m)]
    # Split a range at the BCP psalms whose verses move to another LXX psalm.
    out = []
    for c in range(c1, c2 + 1):
        lo = v1 if c == c1 else 1
        hi = v2 if c == c2 else 9999
        cuts = {116: 9, 147: 11}.get(c)
        pieces = [(lo, hi)]
        if cuts and lo <= cuts < hi:
            pieces = [(lo, cuts), (cuts + 1, hi)]
        for a, b in pieces:
            ma = map_psalm(c, a)
            mb = map_psalm(c, b) if b != 9999 else (map_psalm(c, a)[0], 9999)
            if c == 10 and b == 9999:
                mb = (9, 9999)
            out.append((ma[0], ma[1], mb[0], mb[1]))
    return out


def parse_ref(ref):
    """'103:1-103:13' -> (103, 1, 103, 13); '122' -> whole chapter; '50:6' -> single verse."""
    m = _REF.match(ref)
    if not m:
        raise ValueError(f"cannot parse reference {ref!r}")
    c, v, c2, v2 = m.groups()
    if v is None:
        return _whole(int(c))
    if c2 is None:
        return (int(c), int(v), int(c), int(v))
    return (int(c), int(v), int(c2), int(v2))


def resolve(passages, rng):
    """First and last passage ids within range rng = (c1, v1, c2, v2), or None."""
    lo, hi = (rng[0], rng[1]), (rng[2], rng[3])
    hits = [p for p, _ in passages if (k := passage_key(p)) and lo <= k <= hi]
    return (hits[0], hits[-1]) if hits else None


def covers(passages, rng):
    """True if both ends of rng exist in this version (whole chapters always count)."""
    keys = {passage_key(p) for p, _ in passages}
    start_ok = (rng[0], rng[1]) in keys
    end_ok = rng[3] == 9999 or (rng[2], rng[3]) in keys
    return start_ok and end_ok


# ---------------------------------------------------------------- selections
def selections(citation):
    """Yield (book, ref) for every selection in a canonical citation field."""
    for alt in filter(None, citation.split(" or ")):
        book, refs = split_book(alt)
        for item in re.split(r",\s*", refs.replace("(", "").replace(")", "")):
            if item:
                yield book, item


def version_works(book_urn, works):
    """[(version, work id)] available in the corpus for a versionless book URN."""
    base = book_urn.split(":")[3]
    return [(v, f"{base}.{v}") for v in OT_VERSIONS if f"{base}.{v}" in works]


def index_rows(book, ref, book_urns, works):
    """Index rows for one selection: [(book, ref, version, first_urn, last_urn, note)]."""
    rows = []
    rng = parse_ref(ref)
    for urn in book_urns.get(book, []):
        for version, work in version_works(urn, works):
            psalms = book == "Psalm"
            if psalms and version in ("septuagint", "vulgate"):
                ranges = map_psalm_range(rng)
            else:
                ranges = [rng]
            for r in ranges:
                notes = []
                if psalms and r[0] != rng[0]:
                    notes.append(f"psalm={r[0]}")
                if psalms and version != "onkelos":
                    notes.append("titles")
                hit = resolve(works[work], r)
                if hit is None:
                    notes.append("missing")
                    first = last = ""
                else:
                    first, last = (f"{URN_BASE}{work}:{p}" for p in hit)
                    if not covers(works[work], r):
                        notes.append("partial")
                rows.append((book, ref, version, first, last, " ".join(notes)))
    return rows


def extract(reading_rows, book_urns, works):
    """Return (index lines, passages lines) for every OT selection cited in the readings."""
    seen, index, needed = set(), [INDEX_HEADER], {}
    for row in reading_rows:
        for col in READING_COLUMNS:
            for book, ref in selections(row[col]):
                if (book, ref) in seen:
                    continue
                seen.add((book, ref))
                for r in index_rows(book, ref, book_urns, works):
                    index.append("|".join(r))
                    if r[3]:
                        work = r[3].split(":")[3]
                        first, last = r[3].split(":")[4], r[4].split(":")[4]
                        ids = [p for p, _ in works[work]]
                        needed.setdefault(work, set()).update(ids[ids.index(first):ids.index(last) + 1])
    passages = ["#!ctsdata"]
    for work, plist in works.items():
        want = needed.get(work)
        if want:
            passages.extend(f"{URN_BASE}{work}:{p}|{t}" for p, t in plist if p in want)
    return index, passages


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    source = argv[0] if argv else CORPUS_URL
    works = load_corpus(source)
    works = {w: p for w, p in works.items() if w.split(".")[-1] in OT_VERSIONS}
    index, passages = extract(read_rows(os.path.join(DATA, "rcl_readings.txt")),
                              read_book_urns(os.path.join(DATA, "book_urns.txt")), works)
    for name, lines in (("ot_index.txt", index), ("ot_passages.cex", passages)):
        with open(os.path.join(DATA, name), "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
    found = sum(1 for ln in index[1:] if ln.split("|")[3])
    print(f"ot_index.txt: {len(index) - 1} rows ({found} with text); "
          f"ot_passages.cex: {len(passages) - 1} passages")
    return 0


if __name__ == "__main__":
    sys.exit(main())
