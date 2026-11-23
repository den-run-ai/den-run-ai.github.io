# Notes for work on this repository

## Dance Stage (`dance/index.html`)

- `dance/index.html` is the source. GitHub Pages serves `docs/`, so `docs/dance/index.html` must be a byte-identical copy after every change.
- Before committing a change to the page, run `node _tests/dance/check.js` and read `_tests/dance/README.md`. Fix failures. Accept intended changes with `--update` and name them in the commit.
- Read `_tests/dance/verdicts.json` before adding or reworking music or moves. It holds the owner's own words on what they like and what they rejected. Do not bring back anything rejected unless asked, and record every new verdict there word for word.
- A passing check does not mean new music or a new move is good. The owner tests on a phone by ear and eye; tell them what is new and ask.
- New files for tests or tools go in a folder that starts with an underscore, so that Quarto does not publish them.
