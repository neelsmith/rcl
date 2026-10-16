import os
import unittest

from rcl.datafile import (
    COLUMNS,
    normalize_lines,
    parse_lines,
    read_rows,
    validate_lines,
)

HEADER = "|".join(COLUMNS)
GOOD = ("a-advent-1|The First Sunday of Advent|A|advent|||Isaiah 2:1-2:5|Psalm 122|"
        "Romans 13:11-13:14|Matthew 24:36-24:44||https://example.org/a")
DATA = os.path.join(os.path.dirname(__file__), "..", "..", "data", "rcl_readings.txt")


def row(**changes):
    fields = dict(zip(COLUMNS, GOOD.split("|")))
    fields.update(changes)
    return "|".join(fields[c] for c in COLUMNS)


class ValidateTests(unittest.TestCase):
    def errors(self, *rows):
        return validate_lines([HEADER, *rows])

    def test_good_row(self):
        self.assertEqual(self.errors(GOOD), [])

    def test_bad_header(self):
        self.assertTrue(validate_lines(["id|label", GOOD]))

    def test_empty_file(self):
        self.assertEqual(validate_lines([]), ["file is empty"])

    def test_field_count(self):
        self.assertIn("expected 12 fields", self.errors(GOOD + "|extra")[0])

    def test_duplicate_id(self):
        self.assertTrue(any("duplicate id" in e for e in self.errors(GOOD, GOOD)))

    def test_id_year_mismatch(self):
        self.assertTrue(self.errors(row(year="B")))

    def test_bad_values(self):
        for change in [dict(season="summer"), dict(track="3"), dict(fixed_date="13-01"),
                       dict(label=""), dict(source_url="ftp://x"), dict(id="A Advent 1")]:
            with self.subTest(change=change):
                self.assertTrue(self.errors(row(**change)))

    def test_track_id_suffix(self):
        self.assertTrue(self.errors(row(id="a-proper-4", track="1")))
        self.assertEqual(self.errors(row(id="a-proper-4-t1", track="1")), [])

    def test_noncanonical_citation(self):
        errs = self.errors(row(psalm="Psalm 50:1-6"))
        self.assertTrue(any("psalm" in e for e in errs))


class NormalizeTests(unittest.TestCase):
    def test_normalize(self):
        lines = [HEADER, row(first_reading="Genesis 2:15-17; 3:1-7",
                             notes="Alternative: Genesis 3:8-10")]
        out = normalize_lines(lines)
        r = parse_lines(out)[0]
        self.assertEqual(r["first_reading"], "Genesis 2:15-2:17, 3:1-3:7")
        self.assertEqual(r["notes"], "Alternative: Genesis 3:8-3:10")
        self.assertEqual(validate_lines(out), [])

    def test_idempotent(self):
        once = normalize_lines([HEADER, row(psalm="Psalm 103:1-13, 22")])
        self.assertEqual(normalize_lines(once), once)


@unittest.skipUnless(os.path.exists(DATA), "data file not present")
class DataFileTests(unittest.TestCase):
    """Integration check: the committed data file must be valid and canonical."""

    def setUp(self):
        with open(DATA, encoding="utf-8") as fh:
            self.lines = fh.read().splitlines()

    def test_data_file_is_valid(self):
        self.assertEqual(validate_lines(self.lines), [])

    def test_data_file_is_normalized(self):
        self.assertEqual(normalize_lines(self.lines), self.lines)

    def test_every_year_has_the_core_sundays(self):
        ids = {r["id"] for r in read_rows(DATA)}
        for y in "abc":
            for slug in ["advent-1", "epiphany-1", "lent-1", "palm-sunday",
                         "easter-day", "pentecost", "trinity", "proper-29-t1", "proper-29-t2"]:
                self.assertIn(f"{y}-{slug}", ids)


if __name__ == "__main__":
    unittest.main()
