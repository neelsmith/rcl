import os
import unittest

from rcl.books import read_book_urns
from rcl.datafile import read_rows
from rcl.passages import (
    INDEX_HEADER,
    covers,
    extract,
    index_rows,
    map_psalm,
    map_psalm_range,
    parse_corpus,
    parse_ref,
    resolve,
    selections,
)

W = 9999
CORPUS = """#!ctsdata
urn:cts:compnov:bible.psalms.masoretic:23.1|M23.1
urn:cts:compnov:bible.psalms.masoretic:23.2|M23.2
urn:cts:compnov:bible.psalms.masoretic:23.3|M23.3
urn:cts:compnov:bible.psalms.septuagint:22.1|G22.1
urn:cts:compnov:bible.psalms.septuagint:22.2|G22.2
urn:cts:compnov:bible.psalms.septuagint:22.3|G22.3
urn:cts:compnov:bible.genesis.masoretic:1.1|GenM1.1
urn:cts:compnov:bible.genesis.masoretic:1.2|GenM1.2
urn:cts:compnov:bible.genesis.masoretic:2.1|GenM2.1
urn:cts:compnov:bible.genesis.onkelos:1.1|GenO1.1
urn:cts:compnov:bible.esther2.septuagint:1.1|E1.1
urn:cts:compnov:bible.esther2.septuagint:1.1a|E1.1a
urn:cts:compnov:bible.esther2.septuagint:1.2|E1.2
""".splitlines()
BOOKS = {"Psalm": ["urn:cts:compnov:bible.psalms:"], "Genesis": ["urn:cts:compnov:bible.genesis:"],
         "Esther": ["urn:cts:compnov:bible.esther:", "urn:cts:compnov:bible.esther2:"],
         "Romans": ["urn:cts:compnov:bible.rom:"]}


class VersificationTests(unittest.TestCase):
    def test_map_psalm(self):
        cases = {(1, 1): (1, 1), (9, 5): (9, 5), (10, 1): (9, 22), (23, 1): (22, 1),
                 (113, 2): (112, 2), (114, 3): (113, 3), (115, 1): (113, 9), (116, 9): (114, 9),
                 (116, 10): (115, 1), (146, 4): (145, 4), (147, 11): (146, 11),
                 (147, 12): (147, 1), (148, 1): (148, 1), (150, 6): (150, 6)}
        for bcp, lxx in cases.items():
            with self.subTest(bcp=bcp):
                self.assertEqual(map_psalm(*bcp), lxx)

    def test_map_whole_psalms(self):
        self.assertEqual(map_psalm_range((23, 1, 23, W)), [(22, 1, 22, W)])
        self.assertEqual(map_psalm_range((116, 1, 116, W)), [(114, 1, 114, W), (115, 1, 115, W)])
        self.assertEqual(map_psalm_range((147, 1, 147, W)), [(146, 1, 146, W), (147, 1, 147, W)])
        self.assertEqual(map_psalm_range((10, 1, 10, W)), [(9, 22, 9, W)])
        self.assertEqual(map_psalm_range((115, 1, 115, W)), [(113, 9, 113, W)])

    def test_map_ranges_that_split(self):
        self.assertEqual(map_psalm_range((116, 1, 116, 17)), [(114, 1, 114, 9), (115, 1, 115, 8)])
        self.assertEqual(map_psalm_range((147, 13, 147, 21)), [(147, 2, 147, 10)])
        self.assertEqual(map_psalm_range((103, 1, 103, 13)), [(102, 1, 102, 13)])

    def test_parse_ref(self):
        self.assertEqual(parse_ref("122"), (122, 1, 122, W))
        self.assertEqual(parse_ref("50:6"), (50, 6, 50, 6))
        self.assertEqual(parse_ref("103:1-103:13"), (103, 1, 103, 13))
        self.assertEqual(parse_ref("6:8-7:2a"), (6, 8, 7, 2))
        with self.assertRaises(ValueError):
            parse_ref("x")


class CorpusTests(unittest.TestCase):
    def setUp(self):
        self.works = parse_corpus(CORPUS)

    def test_parse_corpus(self):
        self.assertEqual(self.works["bible.psalms.masoretic"][0], ("23.1", "M23.1"))
        self.assertEqual(len(self.works["bible.genesis.masoretic"]), 3)

    def test_resolve(self):
        g = self.works["bible.genesis.masoretic"]
        self.assertEqual(resolve(g, (1, 2, 2, 1)), ("1.2", "2.1"))
        self.assertEqual(resolve(g, (1, 1, 1, W)), ("1.1", "1.2"))
        self.assertIsNone(resolve(g, (5, 1, 5, 3)))
        # lettered sub-verses fall inside their verse
        e = self.works["bible.esther2.septuagint"]
        self.assertEqual(resolve(e, (1, 1, 1, 1)), ("1.1", "1.1a"))

    def test_covers(self):
        g = self.works["bible.genesis.masoretic"]
        self.assertTrue(covers(g, (1, 1, 1, 2)))
        self.assertFalse(covers(g, (1, 1, 1, 5)))
        self.assertTrue(covers(g, (1, 1, 1, W)))

    def test_selections(self):
        self.assertEqual(list(selections("Psalm 103:1-103:13, 103:22 or Psalm 23")),
                         [("Psalm", "103:1-103:13"), ("Psalm", "103:22"), ("Psalm", "23")])
        self.assertEqual(list(selections("Isaiah 58:1-58:9a, (58:9b-58:12)")),
                         [("Isaiah", "58:1-58:9a"), ("Isaiah", "58:9b-58:12")])
        self.assertEqual(list(selections("")), [])

    def test_index_rows(self):
        rows = index_rows("Psalm", "23:1-23:3", BOOKS, self.works)
        self.assertEqual([r[2] for r in rows], ["masoretic", "septuagint"])
        self.assertEqual(rows[0][3:5], ("urn:cts:compnov:bible.psalms.masoretic:23.1",
                                        "urn:cts:compnov:bible.psalms.masoretic:23.3"))
        self.assertEqual(rows[1][3], "urn:cts:compnov:bible.psalms.septuagint:22.1")
        self.assertIn("psalm=22", rows[1][5])
        self.assertIn("titles", rows[1][5])

    def test_index_rows_missing_and_partial(self):
        rows = index_rows("Genesis", "1:1-1:9", BOOKS, self.works)
        notes = {r[2]: r[5] for r in rows}
        self.assertIn("partial", notes["masoretic"])
        self.assertIn("partial", notes["onkelos"])
        rows = index_rows("Genesis", "1:1-1:2", BOOKS, self.works)
        self.assertEqual({r[2]: r[5] for r in rows}["masoretic"], "")
        rows = index_rows("Genesis", "7:1-7:3", BOOKS, self.works)
        self.assertTrue(all("missing" in r[5] and not r[3] for r in rows))

    def test_two_works_for_one_book(self):
        rows = index_rows("Esther", "1:1-1:2", BOOKS, self.works)
        self.assertEqual([(r[2], r[3].split(":")[3]) for r in rows],
                         [("septuagint", "bible.esther2.septuagint")])

    def test_nt_books_have_no_rows(self):
        self.assertEqual(index_rows("Romans", "1:1-1:7", BOOKS, self.works), [])

    def test_extract(self):
        reading = {"first_reading": "Genesis 1:2-2:1", "psalm": "Psalm 23:2",
                   "second_reading": "Romans 1:1-1:7", "gospel": "Genesis 1:2-2:1"}
        index, passages = extract([reading], BOOKS, self.works)
        self.assertEqual(index[0], INDEX_HEADER)
        self.assertEqual(passages[0], "#!ctsdata")
        self.assertEqual(passages[1:], [
            "urn:cts:compnov:bible.psalms.masoretic:23.2|M23.2",
            "urn:cts:compnov:bible.psalms.septuagint:22.2|G22.2",
            "urn:cts:compnov:bible.genesis.masoretic:1.2|GenM1.2",
            "urn:cts:compnov:bible.genesis.masoretic:2.1|GenM2.1",
        ])
        self.assertEqual(len(index) - 1, 4)  # Genesis x2 versions (deduplicated), Psalm x2


DATA = os.path.join(os.path.dirname(__file__), "..", "..", "data")
INDEX = os.path.join(DATA, "ot_index.txt")
PASSAGES = os.path.join(DATA, "ot_passages.cex")


@unittest.skipUnless(os.path.exists(INDEX) and os.path.exists(PASSAGES), "extracted texts not present")
class ExtractedDataTests(unittest.TestCase):
    """The committed extract must match the readings and refer only to included passages."""

    @classmethod
    def setUpClass(cls):
        with open(INDEX, encoding="utf-8") as fh:
            cls.index = fh.read().splitlines()
        with open(PASSAGES, encoding="utf-8") as fh:
            cls.urns = {ln.split("|", 1)[0] for ln in fh if ln.startswith("urn:")}

    def test_header(self):
        self.assertEqual(self.index[0], INDEX_HEADER)

    def test_urns_are_included(self):
        for line in self.index[1:]:
            f = line.split("|")
            self.assertEqual(len(f), 6, line)
            for urn in f[3:5]:
                if urn:
                    self.assertIn(urn, self.urns, line)

    def test_every_ot_selection_is_indexed(self):
        books = read_book_urns(os.path.join(DATA, "book_urns.txt"))
        ot_books = {ln.split("|")[0] for ln in self.index[1:]}
        indexed = {tuple(ln.split("|")[:2]) for ln in self.index[1:]}
        for row in read_rows(os.path.join(DATA, "rcl_readings.txt")):
            for col in ("first_reading", "psalm", "second_reading", "gospel"):
                for book, ref in selections(row[col]):
                    if book in ot_books:
                        self.assertIn((book, ref), indexed,
                                      "re-run python3 src/rcl/passages.py after editing readings")
        self.assertIn("Psalm", ot_books)
        self.assertNotIn("Romans", ot_books)
        self.assertTrue(books)


if __name__ == "__main__":
    unittest.main()
