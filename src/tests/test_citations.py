import unittest

from rcl.citations import (
    CitationError,
    compact_citation,
    expand_citation,
    expand_citations_in_text,
    is_valid_citation,
    split_book,
)


class ExpandCitationTests(unittest.TestCase):
    def check(self, short, canonical):
        self.assertEqual(expand_citation(short), canonical)

    def test_examples_from_spec(self):
        self.check("Psalm 50:1-6", "Psalm 50:1-50:6")
        self.check("Psalm 103:1-13, 22", "Psalm 103:1-103:13, 103:22")

    def test_single_verse(self):
        self.check("Psalm 116:1, 10-17", "Psalm 116:1, 116:10-116:17")

    def test_whole_chapters(self):
        self.check("Psalm 122", "Psalm 122")
        self.check("Psalm 42 and 43", "Psalm 42, 43")

    def test_semicolon_starts_new_chapter(self):
        self.check("Genesis 2:15-17; 3:1-7", "Genesis 2:15-2:17, 3:1-3:7")
        self.check("Genesis 6:9-22; 7:24; 8:14-19", "Genesis 6:9-6:22, 7:24, 8:14-8:19")

    def test_cross_chapter_range_updates_context(self):
        self.check("Acts 6:8-7:2a, 51c-60", "Acts 6:8-7:2a, 7:51c-7:60")
        self.check("Revelation 21:10, 22-22:5", "Revelation 21:10, 21:22-22:5")

    def test_partial_verse_letters(self):
        self.check("Psalm 147:1-12, 21c", "Psalm 147:1-147:12, 147:21c")

    def test_optional_verses(self):
        self.check("Isaiah 58:1-9a, (9b-12)", "Isaiah 58:1-58:9a, (58:9b-58:12)")
        self.check("Genesis 18:1-15, (21:1-7)", "Genesis 18:1-18:15, (21:1-21:7)")
        self.check("Hebrews 10:11-14, (15-18), 19-25",
                   "Hebrews 10:11-10:14, (10:15-10:18), 10:19-10:25")

    def test_optional_group_with_several_selections(self):
        self.check("1 Samuel 17:(1a, 4-11, 19-23), 32-49",
                   "1 Samuel (17:1a, 17:4-17:11, 17:19-17:23), 17:32-17:49")

    def test_chapter_before_parenthesis(self):
        self.check("Luke 2:(1-7), 8-20", "Luke (2:1-2:7), 2:8-2:20")
        self.check("Psalm 65:(1-8), 9-14", "Psalm (65:1-65:8), 65:9-65:14")

    def test_alternatives(self):
        self.check("Psalm 92 or 92:1-4, 11-14".replace("or 92", "or Psalm 92"),
                   "Psalm 92 or Psalm 92:1-92:4, 92:11-92:14")
        self.check("Wisdom of Solomon 6:12-16 or Amos 5:18-24",
                   "Wisdom of Solomon 6:12-6:16 or Amos 5:18-5:24")

    def test_single_chapter_book(self):
        self.check("Philemon 1-21", "Philemon 1:1-1:21")

    def test_canticle_unchanged(self):
        self.check("Canticle 15 or Canticle 3", "Canticle 15 or Canticle 3")

    def test_already_canonical_is_unchanged(self):
        for s in ["Psalm 103:1-103:13, 103:22", "Acts 6:8-7:2a, 7:51c-7:60",
                  "1 Samuel (17:1a, 17:4-17:11), 17:32-17:49"]:
            self.check(s, s)

    def test_empty(self):
        self.check("", "")

    def test_errors(self):
        for bad in ["Psalm", "Psalm 1-3", "Psalm 50:1-6)", "Psalm (50:1-6", "Psalm 50:x"]:
            with self.subTest(bad=bad), self.assertRaises(CitationError):
                expand_citation(bad)


class CompactCitationTests(unittest.TestCase):
    def test_round_trip(self):
        for short in ["Psalm 103:1-13, 22", "Acts 6:8-7:2a, 51c-60",
                      "Isaiah 58:1-9a, (9b-12)", "John 20:1-18 or Matthew 28:1-10",
                      "Psalm 42, 43", "Genesis 18:1-15, (21:1-7)"]:
            with self.subTest(short=short):
                self.assertEqual(compact_citation(expand_citation(short)), short)

    def test_empty(self):
        self.assertEqual(compact_citation(""), "")


class ValidCitationTests(unittest.TestCase):
    def test_valid(self):
        for s in ["Psalm 122", "Psalm 42, 43", "Psalm 103:1-103:13, 103:22",
                  "Acts 6:8-7:2a, 7:51c-7:60", "Song of Solomon 2:8-2:13",
                  "Wisdom of Solomon 6:17-6:20 or Psalm 70", "Canticle 9",
                  "1 Samuel (17:1a, 17:4-17:11), 17:32-17:49"]:
            with self.subTest(s=s):
                self.assertTrue(is_valid_citation(s))

    def test_invalid(self):
        for s in ["", "Psalm 50:1-6", "Psalm 103:1-103:13, 22",
                  "Genesis 2:15-2:17; 3:1-3:7", "Psalm 42 and 43",
                  "Psalm 92 or 92:1-92:4", "psalm 23", "Psalm 50:1-50:6,103:1",
                  "Psalm 42, 43:1-43:5", "Psalm (42)"]:
            with self.subTest(s=s):
                self.assertFalse(is_valid_citation(s))


class HelperTests(unittest.TestCase):
    def test_split_book(self):
        self.assertEqual(split_book("1 Samuel 3:1-3:10"), ("1 Samuel", "3:1-3:10"))
        self.assertEqual(split_book("Song of Solomon 2:8"), ("Song of Solomon", "2:8"))
        self.assertEqual(split_book("1 Kings (8:1), 8:22"), ("1 Kings", "(8:1), 8:22"))

    def test_expand_citations_in_text(self):
        text = "Alternative second reading: Acts 10:34-43. See Proper 3."
        self.assertEqual(expand_citations_in_text(text, {"Acts"}),
                         "Alternative second reading: Acts 10:34-10:43. See Proper 3.")
        self.assertEqual(expand_citations_in_text(text, set()), text)


if __name__ == "__main__":
    unittest.main()
