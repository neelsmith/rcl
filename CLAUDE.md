`rcl` web app and data resources for working with the Revised Common Lectionary

## Overview

Data resources for working with the Revised Common Lectionary and a single-page webapp (HTML file) for reading selections for a given date.

## Functionality

The webapp should be entirely selfcontained so it can be run by opening a single html file.

## Architecture & Directory Structure

- `quarto`, `docs`, `README.md` and `releases.md` are all user-readable content owned by me; Claude should not touch them
- `notes` is for documentation and notes that Claude writes, includes session summaries so I can reliably pick up working with Claude from different machines
- `src` is for source code



## Testing Guidelines

- Write unit tests for utility functions and integration/component tests for critical UI flows.
- Run relevant tests before proposing significant refactors.