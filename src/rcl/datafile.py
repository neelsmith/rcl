"""Read and validate `data/rcl_readings.txt` (pipe-delimited).

Command line:
    python3 src/rcl/datafile.py data/rcl_readings.txt            # validate
    python3 src/rcl/datafile.py --normalize data/rcl_readings.txt # rewrite citations in canonical form, then validate
"""
import os
import re
import sys

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rcl.citations import (  # noqa: E402
    CitationError,
    expand_citation,
    expand_citations_in_text,
    is_valid_citation,
    split_book,
)

DELIMITER = "|"
COLUMNS = [
    "id", "label", "year", "season", "track", "fixed_date",
    "first_reading", "psalm", "second_reading", "gospel", "notes", "source_url",
]
READING_COLUMNS = ["first_reading", "psalm", "second_reading", "gospel"]
YEARS = {"A", "B", "C", "ABC"}
SEASONS = {
    "advent", "christmas", "epiphany", "lent", "holy_week",
    "easter", "after_pentecost", "holy_day",
}
TRACKS = {"", "1", "2"}
_ID = re.compile(r"^(a|b|c|abc)-[a-z0-9]+(?:-[a-z0-9]+)*$")
_DATE = re.compile(r"^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$")


def parse_lines(lines):
    """Parse lines (header first) into a list of dicts keyed by COLUMNS."""
    lines = [ln for ln in lines if ln.strip()]
    if not lines:
        return []
    return [dict(zip(COLUMNS, ln.split(DELIMITER))) for ln in lines[1:]]


def read_rows(path):
    with open(path, encoding="utf-8") as fh:
        return parse_lines(fh.read().splitlines())


def validate_lines(lines):
    """Return a list of human-readable error strings (empty if valid)."""
    errors = []
    lines = [ln for ln in lines if ln.strip()]
    if not lines:
        return ["file is empty"]
    if lines[0].split(DELIMITER) != COLUMNS:
        errors.append(f"header must be: {DELIMITER.join(COLUMNS)}")
    seen = set()
    for n, line in enumerate(lines[1:], start=2):
        fields = line.split(DELIMITER)
        if len(fields) != len(COLUMNS):
            errors.append(f"line {n}: expected {len(COLUMNS)} fields, found {len(fields)}")
            continue
        row = dict(zip(COLUMNS, fields))
        rid = row["id"]
        where = f"line {n} ({rid})"
        if not _ID.match(rid):
            errors.append(f"{where}: malformed id")
        elif not rid.startswith(row["year"].lower() + "-"):
            errors.append(f"{where}: id prefix does not match year {row['year']!r}")
        if rid in seen:
            errors.append(f"{where}: duplicate id")
        seen.add(rid)
        if not row["label"]:
            errors.append(f"{where}: empty label")
        if row["year"] not in YEARS:
            errors.append(f"{where}: bad year {row['year']!r}")
        if row["season"] not in SEASONS:
            errors.append(f"{where}: bad season {row['season']!r}")
        if row["track"] not in TRACKS:
            errors.append(f"{where}: bad track {row['track']!r}")
        elif row["track"] and not rid.endswith(f"-t{row['track']}"):
            errors.append(f"{where}: id should end with -t{row['track']}")
        if row["fixed_date"] and not _DATE.match(row["fixed_date"]):
            errors.append(f"{where}: bad fixed_date {row['fixed_date']!r}")
        for col in READING_COLUMNS:
            if not is_valid_citation(row[col]):
                errors.append(f"{where}: {col} is not a canonical citation: {row[col]!r}")
        if not row["source_url"].startswith("https://"):
            errors.append(f"{where}: source_url must be an https URL")
    return errors


def normalize_lines(lines):
    """Rewrite reading columns (and citations in notes) in canonical form."""
    lines = [ln for ln in lines if ln.strip()]
    rows = [ln.split(DELIMITER) for ln in lines[1:]]
    idx = [COLUMNS.index(c) for c in READING_COLUMNS]
    books = set()
    for f in rows:
        for i in idx:
            f[i] = expand_citation(f[i])
            for alt in filter(None, f[i].split(" or ")):
                books.add(split_book(alt)[0])
    books.discard("Canticle")
    notes = COLUMNS.index("notes")
    for f in rows:
        f[notes] = expand_citations_in_text(f[notes], books)
    return [lines[0]] + [DELIMITER.join(f) for f in rows]


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    normalize = "--normalize" in argv
    paths = [a for a in argv if a != "--normalize"]
    if len(paths) != 1:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    path = paths[0]
    with open(path, encoding="utf-8") as fh:
        lines = fh.read().splitlines()
    if normalize:
        try:
            lines = normalize_lines(lines)
        except CitationError as exc:
            print(f"normalize failed: {exc}", file=sys.stderr)
            return 1
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
    errors = validate_lines(lines)
    for e in errors:
        print(e, file=sys.stderr)
    print(f"{path}: {len(lines) - 1} rows, {len(errors)} error(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
