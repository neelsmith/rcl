"""Build the self-contained web app: dist/index.html.

Inlines data/rcl_readings.txt, src/web/lectionary.js and src/web/app.js into
src/web/template.html, so the result works from a web server or as a local
file. The data file is validated first; the build stops on errors.

Usage (from the repository root):
    python3 src/build_web.py [output_path]
"""
import datetime
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from rcl.datafile import validate_lines  # noqa: E402

WEB = os.path.join(HERE, "web")
DATA = os.path.join(ROOT, "data", "rcl_readings.txt")
DEFAULT_OUT = os.path.join(ROOT, "dist", "index.html")


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def build(data_text, template, lectionary_js, app_js, today=None):
    """Return the finished HTML. Raises ValueError if the data is invalid."""
    lines = data_text.splitlines()
    errors = validate_lines(lines)
    if errors:
        raise ValueError("data file is invalid:\n  " + "\n  ".join(errors[:20]))
    for name, text in (("data", data_text), ("lectionary.js", lectionary_js), ("app.js", app_js)):
        if "</script" in text.lower():
            raise ValueError(f"{name} contains '</script', which would break the page")
    rows = len([ln for ln in lines if ln.strip()]) - 1
    today = today or datetime.date.today().isoformat()
    summary = f"{rows} entries, built {today}"
    parts = {
        "<!-- @DATA@ -->": data_text.strip(),
        "<!-- @DATA_SUMMARY@ -->": summary,
        "/* @LECTIONARY_JS@ */": lectionary_js,
        "/* @APP_JS@ */": app_js,
    }
    html = template
    for marker, value in parts.items():
        if html.count(marker) != 1:
            raise ValueError(f"template must contain {marker} exactly once")
        html = html.replace(marker, value)
    return html


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = argv[0] if argv else DEFAULT_OUT
    try:
        html = build(read(DATA), read(os.path.join(WEB, "template.html")),
                     read(os.path.join(WEB, "lectionary.js")), read(os.path.join(WEB, "app.js")))
    except ValueError as exc:
        print(f"build failed: {exc}", file=sys.stderr)
        return 1
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(f"wrote {out} ({len(html):,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
