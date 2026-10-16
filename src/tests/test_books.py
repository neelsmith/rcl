import os
import unittest

from rcl.books import (
    books_in_readings,
    parse_book_lines,
    read_book_urns,
    validate_book_lines,
    versioned_urn,
    work_component,
)
from rcl.datafile import read_rows

DATA = os.path.join(os.path.dirname(__file__), "..", "..", "data")
BOOKS = os.path.join(DATA, "book_urns.txt")
READINGS = os.path.join(DATA, "rcl_readings.txt")
G = "urn:cts:compnov:bible.genesis:"
GV = "urn:cts:compnov:bible.genesis2:"


class ParseTests(unittest.TestCase):
    def test_parse(self):
        t = parse_book_lines(["book|urn", f"Genesis|{G}", f"Genesis|{GV}", "Luke|"])
        self.assertEqual(t, {"Genesis": [G, GV], "Luke": []})

    def test_work_component(self):
        self.assertEqual(work_component(G), ("bible", "genesis"))

    def test_versioned_urn(self):
        self.assertEqual(versioned_urn(G, "septuagint"),
                         "urn:cts:compnov:bible.genesis.septuagint:")
        with self.assertRaises(ValueError):
            versioned_urn("urn:cts:compnov:bible.genesis.septuagint:", "vulgate")

    def test_books_in_readings(self):
        rows = [{"first_reading": "Genesis 1:1-1:5 or Wisdom of Solomon 1:1",
                 "psalm": "Canticle 9", "second_reading": "1 John 1:1",
                 "gospel": "Luke 1:1"}]
        self.assertEqual(books_in_readings(rows),
                         {"Genesis", "Wisdom of Solomon", "1 John", "Luke"})


class ValidateTests(unittest.TestCase):
    def errors(self, *rows, required=()):
        return validate_book_lines(["book|urn", *rows], required)

    def test_good(self):
        self.assertEqual(self.errors(f"Genesis|{G}", f"Genesis|{GV}", "Luke|"), [])

    def test_bad(self):
        cases = [
            (f"Genesis|{G[:-1]}",),                       # missing final colon
            ("Genesis|urn:cts:compnov:bible.genesis.septuagint:",),  # has version
            (f"Genesis|{G}", f"Genesis|{G}"),             # duplicate
            (f"Genesis|{G}", f"Exodus|{G}"),              # one URN, two books
            (f"Genesis|{G}", "Genesis|"),                 # empty plus URN
            (f"|{G}",),                                    # empty book
            (f"Genesis|{G}|x",),                           # field count
        ]
        for rows in cases:
            with self.subTest(rows=rows):
                self.assertTrue(self.errors(*rows))

    def test_header_and_empty(self):
        self.assertTrue(validate_book_lines(["book,urn", f"Genesis|{G}"]))
        self.assertEqual(validate_book_lines([]), ["file is empty"])

    def test_required_books(self):
        errs = self.errors(f"Genesis|{G}", required={"Genesis", "Exodus"})
        self.assertEqual(len(errs), 1)
        self.assertIn("Exodus", errs[0])


@unittest.skipUnless(os.path.exists(BOOKS) and os.path.exists(READINGS), "data files not present")
class BookTableDataTests(unittest.TestCase):
    def setUp(self):
        with open(BOOKS, encoding="utf-8") as fh:
            self.lines = fh.read().splitlines()

    def test_table_is_valid_and_covers_readings(self):
        required = books_in_readings(read_rows(READINGS))
        self.assertEqual(validate_book_lines(self.lines, required), [])

    def test_no_extra_books(self):
        required = books_in_readings(read_rows(READINGS))
        self.assertEqual(set(read_book_urns(BOOKS)), required)

    def test_spot_checks(self):
        t = read_book_urns(BOOKS)
        self.assertIn(G, t["Genesis"])
        self.assertEqual(t["Psalm"], ["urn:cts:compnov:bible.psalms:"])
        self.assertEqual(t["Romans"], ["urn:cts:compnov:bible.rom:"])
        self.assertEqual(t["Daniel"], ["urn:cts:compnov:bible.daniel:",
                                       "urn:cts:compnov:bible.daniel2:"])
        self.assertEqual(t["Luke"], ["urn:cts:compnov:bible.luke:"])


if __name__ == "__main__":
    unittest.main()
