# Citation format for `data/rcl_readings.txt`

Applies to the `first_reading`, `psalm`, `second_reading` and `gospel` fields
(and to citations quoted in `notes`).

## Rules
1. **Alternatives** (choose one) are separated by ` or `. Each alternative begins with a book name.
   `John 20:1-20:18 or Matthew 28:1-28:10`
2. **Multiple selections** (read all) within one alternative are separated by `, `.
   The book name is given once and applies to every selection that follows it.
   Semicolons are not used.
   `Genesis 2:15-2:17, 3:1-3:7`
3. **Chapters are always explicit.** Every verse reference is `chapter:verse`, and both ends of
   a range carry a chapter, even inside one chapter.
   `Psalm 50:1-50:6`, `Psalm 103:1-103:13, 103:22`, `Acts 6:8-7:2a, 7:51c-7:60`
4. **Whole chapters** are a bare chapter number: `Psalm 122`, `Psalm 42, 43`. An alternative cites
   either whole chapters only or verse references only; it never mixes the two.
   Single-chapter books still use `1:`: `Philemon 1:1-1:21`.
5. **Optional verses** are in parentheses. A parenthesized group may hold several selections.
   `Isaiah 58:1-58:9a, (58:9b-58:12)`, `1 Samuel (17:1a, 17:4-17:11, 17:19-17:23), 17:32-17:49`
6. **Partial verses** keep their letter suffix: `9a`, `12b`, `45c`.
7. **BCP canticles** are cited by number: `Canticle 15`.

## Grammar
```
field       := alternative (" or " alternative)*
alternative := book " " chapter (", " chapter)*
             | book " " item (", " item)*
item        := ref | "(" ref (", " ref)* ")"
ref         := chapter ":" verse | chapter ":" verse "-" chapter ":" verse
verse       := digits [a-z]?
```

## Tools
- `python3 src/rcl/datafile.py data/rcl_readings.txt` validates the data file.
- `python3 src/rcl/datafile.py --normalize data/rcl_readings.txt` rewrites abbreviated citations
  (e.g. `Psalm 103:1-13, 22`) in canonical form, then validates.
- Tests: `python3 -m unittest discover -s src -t src`
