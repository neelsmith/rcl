"""Book-name to CTS URN table, `data/book_urns.txt` (pipe-delimited).

Each row maps a book name as used in `data/rcl_readings.txt` to one book-level
CTS URN in the compnov corpus, without a version identifier, e.g.

    Genesis|urn:cts:compnov:bible.genesis:

A book whose text is split across more than one work in the corpus has one row
per work (Daniel: `bible.daniel` and `bible.daniel2`).

A book with no text in the corpus has one row with an empty URN.
"Canticle" (BCP canticle numbers) is not a biblical book and is not listed.

Command line:
    python3 src/rcl/books.py data/book_urns.txt data/rcl_readings.txt
"""
import os
import re
import sys

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rcl.citations import split_book  # noqa: E402

HEADER = "book|urn"
NON_BOOKS = frozenset({"Canticle"})
BOOK_URN = re.compile(r"^urn:cts:compnov:bible\.[a-z0-9]+:$")


def parse_book_lines(lines):
    """Return {book: [urn, ...]} (empty list for books without a URN)."""
    table = {}
    for line in [ln for ln in lines if ln.strip()][1:]:
        book, urn = line.split("|")
        table.setdefault(book, [])
        if urn:
            table[book].append(urn)
    return table


def read_book_urns(path):
    with open(path, encoding="utf-8") as fh:
        return parse_book_lines(fh.read().splitlines())


def books_in_readings(rows):
    """Set of book names cited in reading rows (dicts from rcl.datafile)."""
    books = set()
    for row in rows:
        for col in ("first_reading", "psalm", "second_reading", "gospel"):
            for alt in filter(None, row[col].split(" or ")):
                books.add(split_book(alt)[0])
    return books - NON_BOOKS


def work_component(urn):
    """'urn:cts:compnov:bible.genesis:' -> ('bible', 'genesis')."""
    return tuple(urn.split(":")[3].split("."))


def versioned_urn(urn, version):
    """Add a version: ('urn:cts:compnov:bible.genesis:', 'septuagint') ->
    'urn:cts:compnov:bible.genesis.septuagint:'."""
    if not BOOK_URN.match(urn):
        raise ValueError(f"not a book-level URN: {urn!r}")
    return f"{urn[:-1]}.{version}:"


def validate_book_lines(lines, required_books=()):
    """Return a list of error strings (empty if valid)."""
    lines = [ln for ln in lines if ln.strip()]
    if not lines:
        return ["file is empty"]
    errors = []
    if lines[0] != HEADER:
        errors.append(f"header must be: {HEADER}")
    seen_pairs, seen_urns, books = set(), {}, {}
    for n, line in enumerate(lines[1:], start=2):
        fields = line.split("|")
        if len(fields) != 2:
            errors.append(f"line {n}: expected 2 fields, found {len(fields)}")
            continue
        book, urn = fields
        if not book:
            errors.append(f"line {n}: empty book name")
        books.setdefault(book, []).append(urn)
        if urn and not BOOK_URN.match(urn):
            errors.append(f"line {n}: malformed book-level URN {urn!r}")
        if (book, urn) in seen_pairs:
            errors.append(f"line {n}: duplicate row {line!r}")
        seen_pairs.add((book, urn))
        if urn:
            if urn in seen_urns and seen_urns[urn] != book:
                errors.append(f"line {n}: {urn} also mapped to {seen_urns[urn]!r}")
            seen_urns[urn] = book
    for book, urns in books.items():
        if "" in urns and len(urns) > 1:
            errors.append(f"{book}: has both an empty URN row and URN rows")
    for book in sorted(set(required_books) - set(books)):
        errors.append(f"{book}: cited in readings but missing from book table")
    return errors


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if len(argv) not in (1, 2):
        print(__doc__.strip(), file=sys.stderr)
        return 2
    with open(argv[0], encoding="utf-8") as fh:
        lines = fh.read().splitlines()
    required = ()
    if len(argv) == 2:
        from rcl.datafile import read_rows
        required = books_in_readings(read_rows(argv[1]))
    errors = validate_book_lines(lines, required)
    for e in errors:
        print(e, file=sys.stderr)
    table = parse_book_lines(lines)
    unmapped = sorted(b for b, u in table.items() if not u)
    print(f"{argv[0]}: {len(table)} books, {sum(map(len, table.values()))} URNs, "
          f"{len(errors)} error(s); no URN for: {', '.join(unmapped) or 'none'}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
