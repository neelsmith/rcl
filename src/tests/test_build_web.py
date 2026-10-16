import os
import unittest

import build_web
from rcl.datafile import COLUMNS

HEADER = "|".join(COLUMNS)
ROW = ("a-advent-1|The First Sunday of Advent|A|advent|||Isaiah 2:1-2:5|Psalm 122|"
       "Romans 13:11-13:14|Matthew 24:36-24:44||https://example.org/a")
TEMPLATE = ("<p><!-- @DATA_SUMMARY@ --></p><script type='text/plain'><!-- @DATA@ --></script>"
            "<script>/* @LECTIONARY_JS@ */</script><script>/* @APP_JS@ */</script>")


class BuildTests(unittest.TestCase):
    def test_build_inlines_everything(self):
        html = build_web.build(HEADER + "\n" + ROW + "\n", TEMPLATE, "var L=1;", "var A=2;", today="2026-10-16")
        self.assertIn(ROW, html)
        self.assertIn("var L=1;", html)
        self.assertIn("var A=2;", html)
        self.assertIn("1 entries, built 2026-10-16", html)
        self.assertNotIn("@DATA@", html)

    def test_invalid_data_stops_build(self):
        bad = ROW.replace("Psalm 122", "Psalm 50:1-6")
        with self.assertRaises(ValueError):
            build_web.build(HEADER + "\n" + bad, TEMPLATE, "", "")

    def test_script_close_tag_rejected(self):
        with self.assertRaises(ValueError):
            build_web.build(HEADER + "\n" + ROW, TEMPLATE, "x='</script>'", "")

    def test_missing_marker(self):
        with self.assertRaises(ValueError):
            build_web.build(HEADER + "\n" + ROW, "<p>no markers</p>", "", "")

    def test_real_sources_build(self):
        html = build_web.build(
            build_web.read(build_web.DATA),
            build_web.read(os.path.join(build_web.WEB, "template.html")),
            build_web.read(os.path.join(build_web.WEB, "lectionary.js")),
            build_web.read(os.path.join(build_web.WEB, "app.js")))
        self.assertIn('id="rcl-data"', html)
        self.assertIn("a-advent-1|", html)


if __name__ == "__main__":
    unittest.main()
