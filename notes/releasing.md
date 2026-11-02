# Versions and releases

The version lives in the `"version"` field of `package.json` at the repository root: a semantic
version (`MAJOR.MINOR.PATCH`, optionally with a pre-release such as `0.2.0-beta.1`).

- MAJOR: breaking changes to the data format (columns, citation syntax) or the app.
- MINOR: new features or new data.
- PATCH: corrections (e.g. a wrong citation).

## What the build shows
`npm run build` (= `python3 src/build_web.py`) always shows the plain version in the page footer
(`v0.1.0`). The build id below goes in `<meta name="version" content="...">` and the footer
version's tooltip.

| Checkout state                          | Build id               |
|-----------------------------------------|------------------------|
| clean, HEAD tagged `v<version>`         | `0.1.0`                |
| clean, not tagged (or tagged otherwise) | `0.1.0+3f2a9c1`        |
| uncommitted changes                     | `0.1.0+3f2a9c1-dirty`  |
| no git available                        | `0.1.0`                |

## Making a release
1. Bump the version: `npm version minor --no-git-tag-version` (or `patch` / `major`, or edit
   `package.json` by hand). `--no-git-tag-version` stops npm from committing and tagging for you.
   Add an entry to `releases.md`.
2. Commit, then tag: `git tag v0.1.0` (the tag must be `v` + the version in `package.json`).
3. `npm run build:release` — refuses unless the tree is clean and HEAD has that tag.
4. `git push && git push origin v0.1.0`, then create the GitHub release from the tag and attach
   `dist/index.html` (e.g. `gh release create v0.1.0 dist/index.html --notes-file <notes>`).

## npm scripts
| Command               | Does                                                        |
|-----------------------|-------------------------------------------------------------|
| `npm run build`       | build `dist/index.html`                                     |
| `npm run build:release` | build, only from a clean checkout tagged `v<version>`     |
| `npm test`            | Python and JavaScript tests (`test:py`, `test:js`)          |
| `npm run check`       | validate the readings and book-URN data files               |
| `npm run texts`       | re-extract Old Testament passages from compnov (after editing readings) |
| `npm run audio-map`   | rebuild the psalm-recording map (after editing readings or the catalog) |

No npm packages are needed. The browser test (`src/web/tests/ui.test.js`) runs only if the
`playwright` package is installed (e.g. `npm install --no-save playwright && npx playwright install chromium`).
