"""Build the self-contained web app: dist/index.html.

Inlines data/rcl_readings.txt, data/ot_index.txt and data/ot_passages.cex (made by
src/rcl/passages.py), data/psalm_audio_map.txt (the default psalm-recording
mapping, see src/rcl/audio.py), src/web/lectionary.js, src/web/audio.js and src/web/app.js into
src/web/template.html, so the result works from a web server or as a local
file. The data file is validated first; the build stops on errors.

The version comes from the "version" field of package.json at the repository
root (semantic versioning, e.g. 0.1.0). Builds that are not an exact tagged release get git
build metadata appended, e.g. 0.1.0+3f2a9c1 or 0.1.0+3f2a9c1-dirty.

Usage (from the repository root):
    npm run build            (= python3 src/build_web.py [output_path])
    npm run build:release    (= python3 src/build_web.py --release)

--release refuses to build unless the working tree is clean and HEAD is
tagged v<version> (e.g. v0.1.0), so a file attached to a GitHub release always
matches its tag.
"""
import datetime
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from rcl.datafile import validate_lines  # noqa: E402

WEB = os.path.join(HERE, "web")
DATA = os.path.join(ROOT, "data", "rcl_readings.txt")
OT_INDEX = os.path.join(ROOT, "data", "ot_index.txt")
OT_TEXTS = os.path.join(ROOT, "data", "ot_passages.cex")
AUDIO_MAP = os.path.join(ROOT, "data", "psalm_audio_map.txt")
AUDIO_FILES = os.path.join(ROOT, "data", "psalm_audio_files.txt")
PACKAGE_JSON = os.path.join(ROOT, "package.json")
DEFAULT_OUT = os.path.join(ROOT, "dist", "index.html")

# Semantic Versioning 2.0.0 core with optional pre-release (no build metadata in the file).
SEMVER = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$"
)


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


# ------------------------------------------------------------------ version
def parse_version(text):
    """Validate a version string; raise ValueError if it is not a semantic version."""
    version = text.strip() if isinstance(text, str) else text
    if not isinstance(version, str) or not SEMVER.match(version):
        raise ValueError(f"version must be a semantic version like 0.1.0, not {version!r}")
    return version


def package_version(package_json_text):
    """The "version" field of package.json text, validated."""
    try:
        data = json.loads(package_json_text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"package.json is not valid JSON: {exc}") from exc
    if not isinstance(data, dict) or "version" not in data:
        raise ValueError('package.json has no "version" field')
    return parse_version(data["version"])


def git_info(root=ROOT):
    """{'commit': short hash, 'dirty': bool, 'tags': [tags at HEAD]}, or None without git."""
    def git(*args):
        return subprocess.run(["git", "--no-optional-locks", "-C", root, *args],
                              capture_output=True, text=True, check=True).stdout
    try:
        commit = git("rev-parse", "--short", "HEAD").strip()
        dirty = bool(git("status", "--porcelain").strip())
        tags = git("tag", "--points-at", "HEAD").split()
    except (OSError, subprocess.CalledProcessError):
        return None
    return {"commit": commit, "dirty": dirty, "tags": tags}


def is_release(version, info):
    return bool(info) and not info["dirty"] and f"v{version}" in info["tags"]


def display_version(version, info):
    """Version shown in the page: exact for a clean tagged release, else with build metadata."""
    if info is None or is_release(version, info):
        return version
    return f"{version}+{info['commit']}" + ("-dirty" if info["dirty"] else "")


def release_errors(version, info):
    """Reasons this checkout cannot produce a release build (empty list if it can)."""
    if info is None:
        return ["not a git checkout (cannot confirm the release tag)"]
    errors = []
    if info["dirty"]:
        errors.append("working tree has uncommitted changes")
    if f"v{version}" not in info["tags"]:
        found = ", ".join(info["tags"]) or "none"
        errors.append(f"HEAD is not tagged v{version} (tags at HEAD: {found})")
    return errors


# -------------------------------------------------------------------- build
def build(data_text, template, lectionary_js, app_js, today=None, version="0.0.0",
          ot_index="", ot_texts="", audio_js="", audio_map="", audio_files=""):
    """Return the finished HTML. Raises ValueError if the data is invalid."""
    lines = data_text.splitlines()
    errors = validate_lines(lines)
    if errors:
        raise ValueError("data file is invalid:\n  " + "\n  ".join(errors[:20]))
    for name, text in (("data", data_text), ("lectionary.js", lectionary_js), ("app.js", app_js),
                       ("ot_index.txt", ot_index), ("ot_passages.cex", ot_texts),
                       ("audio.js", audio_js), ("psalm_audio_map.txt", audio_map),
                       ("psalm_audio_files.txt", audio_files)):
        if "</script" in text.lower():
            raise ValueError(f"{name} contains '</script', which would break the page")
    rows = len([ln for ln in lines if ln.strip()]) - 1
    today = today or datetime.date.today().isoformat()
    # marker -> (replacement, allowed number of occurrences: exactly 1, or None for 1 or more)
    parts = {
        "<!-- @DATA@ -->": (data_text.strip(), 1),
        "<!-- @DATA_SUMMARY@ -->": (f"{rows} entries, built {today}", 1),
        "<!-- @OT_INDEX@ -->": (ot_index.strip(), 1),
        "<!-- @OT_TEXTS@ -->": (ot_texts.strip(), 1),
        "<!-- @AUDIO_MAP@ -->": (audio_map.strip(), 1),
        "<!-- @AUDIO_FILES@ -->": (audio_files.strip(), 1),
        "/* @AUDIO_JS@ */": (audio_js, 1),
        "@VERSION@": (version, None),
        "/* @LECTIONARY_JS@ */": (lectionary_js, 1),
        "/* @APP_JS@ */": (app_js, 1),
    }
    html = template
    for marker, (value, count) in parts.items():
        n = html.count(marker)
        if (count is not None and n != count) or n == 0:
            raise ValueError(f"template must contain {marker} " + ("exactly once" if count else "at least once"))
        html = html.replace(marker, value)
    return html


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    release = "--release" in argv
    args = [a for a in argv if a != "--release"]
    out = args[0] if args else DEFAULT_OUT
    try:
        version = package_version(read(PACKAGE_JSON))
        info = git_info()
        if release:
            problems = release_errors(version, info)
            if problems:
                raise ValueError("not a release build:\n  " + "\n  ".join(problems))
        shown = display_version(version, info)
        html = build(read(DATA), read(os.path.join(WEB, "template.html")),
                     read(os.path.join(WEB, "lectionary.js")), read(os.path.join(WEB, "app.js")),
                     version=shown, ot_index=read(OT_INDEX), ot_texts=read(OT_TEXTS),
                     audio_js=read(os.path.join(WEB, "audio.js")), audio_map=read(AUDIO_MAP),
                     audio_files=read(AUDIO_FILES))
    except (OSError, ValueError) as exc:
        print(f"build failed: {exc}", file=sys.stderr)
        return 1
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(f"wrote {out} (version {shown}, {len(html):,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
