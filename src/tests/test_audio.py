import os
import unittest

from rcl.audio import (
    CATALOG_HEADER,
    MAP_HEADER,
    WHOLE,
    build_map,
    format_catalog,
    match,
    parse_catalog,
    parse_listing,
    psalm_selections,
    recorded_range,
    selection_range,
)
from rcl.datafile import read_rows

LISTING = """
Choir A/Album One:
9-01 Psalm 119, 1-32.m4a
9-02 Psalm 119, 33-72.m4a

Choir B/Album Two:
01 Psalm 23 (Smith; Jones).m4a
02 Psalm 118.m4a
"""


def reading(**kw):
    row = {"first_reading": "", "psalm": "", "second_reading": "", "gospel": "", "notes": ""}
    row.update(kw)
    return row


class ListingTests(unittest.TestCase):
    def test_parse_listing(self):
        rows = parse_listing(LISTING)
        self.assertEqual(len(rows), 4)
        self.assertEqual(rows[0], {"file": "Choir A/Album One/9-01 Psalm 119, 1-32.m4a", "psalm": "119",
                                   "verses": "1-32", "artist": "Choir A", "album": "Album One", "chants": ""})
        self.assertEqual(rows[2]["chants"], "Smith; Jones")
        self.assertEqual(rows[2]["verses"], "")

    def test_bad_listing(self):
        with self.assertRaises(ValueError):
            parse_listing("01 Psalm 1.m4a")            # no album heading
        with self.assertRaises(ValueError):
            parse_listing("A/B:\nnot a track.m4a")

    def test_catalog_round_trip(self):
        rows = parse_listing(LISTING)
        lines = format_catalog(rows)
        self.assertEqual(lines[0], CATALOG_HEADER)
        self.assertEqual(parse_catalog(lines), rows)


class MatchTests(unittest.TestCase):
    def setUp(self):
        self.catalog = parse_listing(LISTING)

    def test_ranges(self):
        self.assertEqual(selection_range("23"), (23, 1, WHOLE))
        self.assertEqual(selection_range("103:1-103:13"), (103, 1, 13))
        self.assertEqual(selection_range("147:21c"), (147, 21, 21))
        self.assertEqual(recorded_range(self.catalog[1]), (33, 72))
        self.assertEqual(recorded_range(self.catalog[2]), (1, WHOLE))
        with self.assertRaises(ValueError):
            selection_range("9:1-10:3")

    def test_match(self):
        cov = lambda sel: [(r["file"].split("/")[-1], c) for r, c in match(sel, self.catalog)]
        self.assertEqual(cov("23"), [("01 Psalm 23 (Smith; Jones).m4a", "whole")])
        self.assertEqual(cov("23:1-23:3"), [("01 Psalm 23 (Smith; Jones).m4a", "excerpt")])
        self.assertEqual(cov("119:1-119:8"), [("9-01 Psalm 119, 1-32.m4a", "excerpt")])
        self.assertEqual(cov("119:1-119:32"), [("9-01 Psalm 119, 1-32.m4a", "whole")])
        self.assertEqual([f for f, _ in cov("119:30-119:40")],
                         ["9-01 Psalm 119, 1-32.m4a", "9-02 Psalm 119, 33-72.m4a"])
        self.assertEqual(cov("50"), [])

    def test_selections_include_notes(self):
        rows = [reading(psalm="Psalm 23:1-23:3, (23:4) or Canticle 9",
                        notes="Liturgy of the Palms psalm: Psalm 118:1-118:2, 118:19-118:29.")]
        self.assertEqual(psalm_selections(rows), {"23:1-23:3", "23:4", "118:1-118:2", "118:19-118:29"})

    def test_build_map(self):
        lines = build_map([reading(psalm="Psalm 23 or Psalm 119:1-119:8")], self.catalog)
        self.assertEqual(lines[0], MAP_HEADER)
        self.assertEqual(lines[1], "23|23|Choir B/Album Two/01 Psalm 23 (Smith; Jones).m4a|whole")
        self.assertEqual(lines[2], "119:1-119:8|119|Choir A/Album One/9-01 Psalm 119, 1-32.m4a|excerpt")
        with self.assertRaises(ValueError):
            build_map([reading(psalm="Psalm 50")], self.catalog)


DATA = os.path.join(os.path.dirname(__file__), "..", "..", "data")
CATALOG = os.path.join(DATA, "psalm_audio_files.txt")
MAPFILE = os.path.join(DATA, "psalm_audio_map.txt")


@unittest.skipUnless(os.path.exists(CATALOG) and os.path.exists(MAPFILE), "audio data not present")
class AudioDataTests(unittest.TestCase):
    def setUp(self):
        with open(CATALOG, encoding="utf-8") as fh:
            self.catalog = parse_catalog(fh.read().splitlines())
        with open(MAPFILE, encoding="utf-8") as fh:
            self.map_lines = fh.read().splitlines()

    def test_catalog_covers_the_psalter(self):
        self.assertEqual({int(r["psalm"]) for r in self.catalog}, set(range(1, 151)))
        files = [r["file"] for r in self.catalog]
        self.assertEqual(len(files), len(set(files)))

    def test_map_is_current(self):
        rows = read_rows(os.path.join(DATA, "rcl_readings.txt"))
        self.assertEqual(build_map(rows, self.catalog), self.map_lines,
                         "re-run python3 src/rcl/audio.py after editing readings or the catalog")


if __name__ == "__main__":
    unittest.main()
