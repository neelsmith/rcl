import os
import unittest

import build_web
from rcl.datafile import COLUMNS

HEADER = "|".join(COLUMNS)
ROW = ("a-advent-1|The First Sunday of Advent|A|advent|||Isaiah 2:1-2:5|Psalm 122|"
       "Romans 13:11-13:14|Matthew 24:36-24:44||https://example.org/a")
TEMPLATE = ("<meta name='version' content='@BUILD@'><p>v@VERSION@ <!-- @DATA_SUMMARY@ --></p>"
            "<script type='text/plain'><!-- @DATA@ --></script>"
            "<script type='text/plain'><!-- @OT_INDEX@ --></script>"
            "<script type='text/plain'><!-- @OT_TEXTS@ --></script>"
            "<script type='text/plain'><!-- @AUDIO_MAP@ --></script><script>/* @AUDIO_JS@ */</script>"
            "<script type='text/plain'><!-- @AUDIO_FILES@ --></script>"
            "<script>/* @LECTIONARY_JS@ */</script><script>/* @APP_JS@ */</script>")


class BuildTests(unittest.TestCase):
    def test_build_inlines_everything(self):
        html = build_web.build(HEADER + "\n" + ROW + "\n", TEMPLATE, "var L=1;", "var A=2;",
                               today="2026-10-16", version="1.2.3",
                               build_id="1.2.3+abc1234")
        self.assertIn(ROW, html)
        self.assertIn("var L=1;", html)
        self.assertIn("var A=2;", html)
        self.assertIn("1 entries, built 2026-10-16", html)
        self.assertNotIn("@DATA@", html)
        self.assertIn("content='1.2.3+abc1234'", html)
        self.assertIn("v1.2.3 ", html)
        self.assertNotIn("@VERSION@", html)
        self.assertNotIn("@BUILD@", html)

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
            build_web.read(os.path.join(build_web.WEB, "app.js")),
            ot_index=build_web.read(build_web.OT_INDEX), ot_texts=build_web.read(build_web.OT_TEXTS),
            audio_js=build_web.read(os.path.join(build_web.WEB, "audio.js")),
            audio_map=build_web.read(build_web.AUDIO_MAP),
            audio_files=build_web.read(build_web.AUDIO_FILES))
        self.assertIn('id="rcl-data"', html)
        self.assertIn("urn:cts:compnov:bible.psalms.septuagint:22.1|", html)
        self.assertIn("selection|psalm|file|coverage", html)
        self.assertIn("RCLAudio", html)
        self.assertIn("file|psalm|verses|artist|album|chants", html)
        self.assertIn("a-advent-1|", html)



CLEAN_TAGGED = {"commit": "abc1234", "dirty": False, "tags": ["v0.1.0"]}
CLEAN_UNTAGGED = {"commit": "abc1234", "dirty": False, "tags": []}
DIRTY_TAGGED = {"commit": "abc1234", "dirty": True, "tags": ["v0.1.0"]}


class VersionTests(unittest.TestCase):
    def test_parse_version(self):
        for good in ["0.1.0", "1.0.0\n", "10.20.30", "1.0.0-beta.1", "2.0.0-rc.1"]:
            with self.subTest(good=good):
                self.assertEqual(build_web.parse_version(good), good.strip())
        for bad in ["", "1.0", "v1.0.0", "01.0.0", "1.0.0+build", "1.0.0-", "1.0.0 beta"]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                build_web.parse_version(bad)

    def test_package_version(self):
        self.assertEqual(build_web.package_version('{"name": "x", "version": "1.2.3"}'), "1.2.3")
        for bad in ['{"name": "x"}', '{"version": "1.2"}', '{"version": 1}', "not json", "[]"]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                build_web.package_version(bad)

    def test_repository_package_json_has_a_valid_version(self):
        build_web.package_version(build_web.read(build_web.PACKAGE_JSON))

    def test_display_version(self):
        self.assertEqual(build_web.display_version("0.1.0", CLEAN_TAGGED), "0.1.0")
        self.assertEqual(build_web.display_version("0.1.0", CLEAN_UNTAGGED), "0.1.0+abc1234")
        self.assertEqual(build_web.display_version("0.1.0", DIRTY_TAGGED), "0.1.0+abc1234-dirty")
        self.assertEqual(build_web.display_version("0.1.0", None), "0.1.0")
        # A tag for a different version does not count.
        other = dict(CLEAN_TAGGED, tags=["v0.0.9"])
        self.assertEqual(build_web.display_version("0.1.0", other), "0.1.0+abc1234")

    def test_release_errors(self):
        self.assertEqual(build_web.release_errors("0.1.0", CLEAN_TAGGED), [])
        self.assertEqual(len(build_web.release_errors("0.1.0", CLEAN_UNTAGGED)), 1)
        self.assertEqual(len(build_web.release_errors("0.1.0", DIRTY_TAGGED)), 1)
        self.assertEqual(len(build_web.release_errors("0.1.0", dict(DIRTY_TAGGED, tags=[]))), 2)
        self.assertTrue(build_web.release_errors("0.1.0", None))

    def test_git_info_outside_a_repository(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            self.assertIsNone(build_web.git_info(d))


if __name__ == "__main__":
    unittest.main()
