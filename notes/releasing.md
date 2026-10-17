# Versions and releases

The version lives in `VERSION` at the repository root: one line, a semantic version
(`MAJOR.MINOR.PATCH`, optionally with a pre-release such as `0.2.0-beta.1`).

- MAJOR: breaking changes to the data format (columns, citation syntax) or the app.
- MINOR: new features or new data.
- PATCH: corrections (e.g. a wrong citation).

## What the build shows
`python3 src/build_web.py` puts the version in the page footer (`v0.1.0`) and in
`<meta name="version" content="...">`.

| Checkout state                          | Version shown          |
|-----------------------------------------|------------------------|
| clean, HEAD tagged `v<VERSION>`         | `0.1.0`                |
| clean, not tagged (or tagged otherwise) | `0.1.0+3f2a9c1`        |
| uncommitted changes                     | `0.1.0+3f2a9c1-dirty`  |
| no git available                        | `0.1.0`                |

## Making a release
1. Set the new number in `VERSION`; add an entry to `releases.md`.
2. Commit, then tag: `git tag v0.1.0` (the tag must be `v` + the contents of `VERSION`).
3. `python3 src/build_web.py --release` — refuses unless the tree is clean and HEAD has that tag.
4. `git push && git push origin v0.1.0`, then create the GitHub release from the tag and attach
   `dist/index.html` (e.g. `gh release create v0.1.0 dist/index.html --notes-file <notes>`).
