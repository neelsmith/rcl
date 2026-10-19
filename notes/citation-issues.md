# Citation inconsistencies and adjustments

Summary of every problem found in the citations of `data/rcl_readings.txt`, and how each is
handled. Source of the readings: lectionarypage.net (Episcopal RCL).

## 1. Errors and ambiguities in the source, corrected in the data

| Day | Problem on lectionarypage.net | What the data does |
|---|---|---|
| Proper 11, Year A | *Wisdom 12:13, 16-19* printed at the end of the Track 1 line | Moved to Track 2, as an alternative to *Isaiah 44:6-8* (the RCL pattern) |
| Proper 20, Year B | *Wisdom 1:16-2:1, 12-22* printed at the end of the Track 1 line | Moved to Track 2, as an alternative to *Jeremiah 11:18-20* |
| Proper 8, Year B, Track 2 | *Lamentations 3:21-33* printed in the psalm slot | Treated as an alternative first reading, with *Psalm 30* as the psalm. The page's own editor's note says this. |

All three are flagged in the `notes` column.

## 2. Inconsistent notation in the source, normalized

- **Spacing:** stray spaces in references (`Genesis 6: 9-22`, `Matthew 26:14- 27:66`) were removed.
- **Dashes:** en dashes (`Wisdom 7:26–8:1`) became hyphens.
- **Book names:** "Wisdom" and "Wisdom of Solomon" were both used; the data always uses "Wisdom of Solomon".
- **Optional verses:** marked with either `[ ]` or `( )` in the source; the data always uses `( )`.
- **Missing separators:** `1 Samuel 3:1-10(11-20)` and `Luke 2:1-14(15-20)` now have a comma before the parenthesis.
- **Changes of chapter:** marked with `;` or `,` inconsistently (`Habakkuk 1:1-4; 2:1-4` on one page, `1:1-4, 2:1-4` on another).
- **Abbreviated alternatives:** written out in full (`Psalm 19 or 19:1-6` became `Psalm 19 or Psalm 19:1-6`; `Canticle 15 (or 3)` became `Canticle 15 or Canticle 3`).
- **"and" between psalms:** `Psalm 42 and 43` became `Psalm 42, 43`.
- **Single-chapter books:** `Philemon 1-21` became `Philemon 1:1-1:21`.

All citations were then rewritten in the explicit form described in `notes/citation-format.md`: chapters stated on both ends of every range, `, ` between selections and ` or ` between alternatives.

## 3. Episcopal departures from the common RCL (kept as published)

These are the Episcopal Church's own choices, not errors.

- **Year C, Lent 3:** Exodus 3:1-15.
- **First Sunday after Christmas:** John 1:1-18 in every year.
- **Holy Name, Presentation, Annunciation, Visitation and Holy Cross:** the lessons are taken from lectionarypage's RCL pages for these feasts.

## 4. Numbering: BCP citations compared with the compnov texts

### Adjusted automatically (Septuagint and Vulgate Psalms)

| BCP | Septuagint / Vulgate |
|---|---|
| Psalms 1-9 and 148-150 | same number |
| 10 | 9:22 onward |
| 11-113 | number minus 1 |
| 114 | 113:1-8 |
| 115 | 113:9 onward |
| 116:1-9 | 114 |
| 116:10-19 | 115 |
| 117-146 | number minus 1 |
| 147:1-11 | 146 |
| 147:12-20 | 147:1-9 |

### Not adjusted (flagged in the app)

- **Psalm titles:** the Masoretic, Septuagint and Vulgate count a psalm's title as verse 1 or 2; the BCP does not. Verse numbers may therefore be off by one or two.
- **BCP Psalter verse divisions that differ from the corpus versions:**
  - *Not found at that number in any version:* 17:16, 37:41-42, 104:37 (also cited as 104:37b), 147:21c.
  - *Only partly found:* 50:23-24, 62:6-14, 132:14-19, 145:15-22, 145:18-22, 147:13-21.
- **Different chapter divisions:**
  - Malachi 4:1-2a = Masoretic/Septuagint 3:19-20a (not found in those versions).
  - Joel 2:28-32 = Masoretic/Septuagint 3:1-5, so Joel 2:23-32 is only partly found.
  - Hosea 1:10 = Masoretic/Septuagint 2:1, so Hosea 1:2-10 is only partly found.
  - 2 Samuel 18:33 = Masoretic/Septuagint 19:1, so 2 Samuel 18:31-33 is only partly found.
- **Septuagint text differs:**
  - 1 Samuel 17:19-23 and 17:57-18:5 are not found, and 18:10-16 is only partly found. These passages are missing from the Greek text.
  - Jeremiah 26:1-9 and 32:6-15 are only partly found, and 32:1-3a is not found. These chapters are numbered and ordered differently in the Septuagint.
  - Lamentations 3:19-24 is only partly found.
- **Vulgate:** Job 42:10-17 and Haggai 1:15b-2:9 are only partly found.

The app shows whatever text exists at the cited numbers, and says when a reference is missing or only partly found.

## 5. Psalm recordings

- **Excerpts:** 181 of the 250 appointed psalm selections are only part of a recording, which is the whole psalm, or for Psalm 119 one of five sections. The player notes this; there are no verse timings yet.
- **Unchecked numbering:** the recordings use their own psalter's text. Where the BCP's verse numbers differ (see section 4), this hasn't been checked against the recordings.
