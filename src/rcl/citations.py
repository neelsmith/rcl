"""Scripture citation format used in `data/rcl_readings.txt`.

The canonical format (see `notes/citation-format.md`):

- alternatives are separated by " or ", each beginning with a book name;
- multiple selections within an alternative are separated by ", ";
- every verse reference carries an explicit chapter, on both ends of a range
  (e.g. "Psalm 103:1-103:13, 103:22");
- a whole chapter is a bare number ("Psalm 42, 43");
- optional verses are in parentheses ("Isaiah 58:1-58:9a, (58:9b-58:12)").

`expand_citation` converts the common abbreviated style (implicit chapters,
semicolons between chapters, "and") to the canonical form; `compact_citation`
goes the other way; `is_valid_citation` checks the canonical grammar.
"""
import re

__all__ = [
    "SINGLE_CHAPTER_BOOKS",
    "CitationError",
    "expand_citation",
    "compact_citation",
    "is_valid_citation",
    "split_book",
    "expand_citations_in_text",
]

SINGLE_CHAPTER_BOOKS = frozenset({"Obadiah", "Philemon", "2 John", "3 John", "Jude"})

_BOOK = re.compile(r"^(.*?[A-Za-z]) ([(\d].*)$")
_REF = re.compile(r"^(?:(\d+):)?(\d+[a-z]?)(?:-(?:(\d+):)?(\d+[a-z]?))?$")

# Canonical grammar.
# An alternative cites either whole chapters only ("Psalm 42, 43") or verse
# references only, so a bare number after a verse ("103:1-103:13, 22") is rejected
# as ambiguous.
_C = r"\d+"
_R = r"\d+:\d+[a-z]?(?:-\d+:\d+[a-z]?)?"
_I = rf"(?:{_R}|\({_R}(?:, {_R})*\))"
_BOOKNAME = r"(?:[123] )?[A-Z][A-Za-z]*(?: [A-Za-z]+)*"
_A = rf"{_BOOKNAME} (?:{_C}(?:, {_C})*|{_I}(?:, {_I})*)"
_FIELD = re.compile(rf"^{_A}(?: or {_A})*$")


class CitationError(ValueError):
    """Raised when a citation cannot be parsed."""


def split_book(alternative):
    """Split one alternative into (book, references), e.g. ("1 Samuel", "3:1-3:10")."""
    m = _BOOK.match(alternative.strip())
    if not m:
        raise CitationError(f"no book name or references in {alternative!r}")
    return m.group(1), m.group(2)


def _top_level_items(refs):
    items, depth, cur = [], 0, ""
    for ch in refs:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth < 0:
                raise CitationError(f"unbalanced parentheses in {refs!r}")
        if ch == "," and depth == 0:
            items.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if depth != 0:
        raise CitationError(f"unbalanced parentheses in {refs!r}")
    items.append(cur.strip())
    return items


def _expand_alternative(alternative):
    book, refs = split_book(alternative)
    if book in SINGLE_CHAPTER_BOOKS and ":" not in refs:
        refs = "1:" + refs
    refs = re.sub(r"(\d+):\(", r"(\1:", refs)  # "2:(1-7)" -> "(2:1-7)"
    refs = refs.replace(";", ",").replace(" and ", ", ")
    chapter = None

    def one(ref):
        nonlocal chapter
        m = _REF.match(ref.strip())
        if not m:
            raise CitationError(f"cannot parse reference {ref!r} in {alternative!r}")
        c1, v1, c2, v2 = m.groups()
        if c1 is None and chapter is None:  # whole chapter
            if v2 is not None:
                raise CitationError(f"chapter ranges are not supported: {alternative!r}")
            return v1
        if c1 is not None:
            chapter = c1
        start = f"{chapter}:{v1}"
        if v2 is None:
            return start
        if c2 is not None:
            chapter = c2
        return f"{start}-{chapter}:{v2}"

    out = []
    for item in _top_level_items(refs):
        if item.startswith("(") and item.endswith(")"):
            inner = ", ".join(one(r) for r in item[1:-1].split(","))
            out.append(f"({inner})")
        else:
            out.append(one(item))
    return f"{book} {', '.join(out)}"


def expand_citation(field):
    """Return `field` in canonical form. Empty strings are returned unchanged.

    >>> expand_citation("Psalm 103:1-13, 22")
    'Psalm 103:1-103:13, 103:22'
    """
    if not field:
        return field
    return " or ".join(_expand_alternative(a) for a in field.split(" or "))


def compact_citation(field):
    """Drop chapter numbers that repeat the current chapter (inverse of expand).

    >>> compact_citation("Acts 6:8-7:2a, 7:51c-7:60")
    'Acts 6:8-7:2a, 51c-60'
    """
    if not field:
        return field
    alternatives = []
    for alternative in field.split(" or "):
        book, refs = split_book(alternative)
        chapter, out = None, []
        for tok in re.findall(r"\(|\)|, |[^(),]+", refs):
            if tok in ("(", ")", ", "):
                out.append(tok)
                continue
            parts = []
            for p in tok.split("-"):
                if ":" in p:
                    c, v = p.split(":")
                    parts.append(v if c == chapter else p)
                    chapter = c
                else:
                    parts.append(p)
            out.append("-".join(parts))
        alternatives.append(f"{book} {''.join(out)}")
    return " or ".join(alternatives)


def is_valid_citation(field):
    """True if `field` is a non-empty citation in canonical form."""
    return bool(field) and _FIELD.match(field) is not None


def expand_citations_in_text(text, books):
    """Expand every citation of a known book found inside free text (e.g. notes)."""
    if not books:
        return text
    names = "|".join(sorted(map(re.escape, books), key=len, reverse=True))
    ref = r"\d+[a-z]?(?::\d+[a-z]?)?(?:-(?:\d+:)?\d+[a-z]?)?"
    pattern = re.compile(rf"\b((?:{names}) {ref}(?:, {ref})*)")
    return pattern.sub(lambda m: expand_citation(m.group(1)), text)
