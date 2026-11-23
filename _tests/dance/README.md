# Dance Stage quality check

Run it before committing any change to `dance/index.html`:

```
node _tests/dance/check.js
```

It needs Node and Playwright with Chromium, opens the page headless, and takes about a minute. Exit code 0 means nothing failed and nothing drifted.

| File | What it is |
| --- | --- |
| `check.js` | The runner: floors, drift against the baseline, the owner's verdicts, and the report. |
| `quality.js` | The measures. Runs inside the page on `window.ceoDanceLab`, the small bench the page exposes for tests. |
| `baseline.json` | How every style and move measured, and three coarse pictures of every move, when last accepted. |
| `verdicts.json` | What the site's owner has said about the music and the moves, in their own words. |

This folder starts with an underscore so that Quarto leaves it out of the site.

## What it checks

1. **The page's own self-test** (`window.ceoDanceSelfTest`): buttons and code agree, poses stay in range and loop, every style renders clean and equally loud for a phone speaker.
2. **Floors.** Limits nothing on the page may fall under, listed at the top of `check.js`: notes a semitone apart sounding together, no pulse, harsh sustained treble, no low end, a level out of line; a joint through the floor, a move that barely moves, a move that makes almost the same shapes as another.
3. **Drift.** Each style and move is compared with `baseline.json`. A change in level, low end, pulse, where in the bar the sound hits, how far he moves, or how he is drawn fails the run until it is accepted with `--update`. Favourites are marked in the report.
4. **Verdicts.** Anything under `rejected` in `verdicts.json` fails the run if it is back on the page.
5. **Report only.** What is new since the baseline, what the owner has not judged yet, and (with `--all`) which styles differ from the favourites and which moves a number can call weak.

## What it cannot tell you

The measures were tried against the owner's verdicts: five favourite styles, two called "not that bad", six styles and seven moves rejected or sent back for a rewrite. **No measure here separates the rejected ones from the liked ones.** That includes the ones taken from research (pulse clarity, loudness variation, low-frequency flux, syncopation, beat alignment of the movement, how well his arrivals match the music's attacks). One example: the favourite Midnight shuffle with its T-step has the worst match of arrivals to attacks on the page.

So a pass means "not broken in a way a number can see, and unchanged since it was last accepted". It never means "good". Whether a tune or a move is good is decided by the owner listening and watching, and recorded in `verdicts.json`.

## Adding or changing music or a move

1. Read `verdicts.json` first. Do not bring back anything rejected unless the owner asks.
2. Make the change, copy `dance/index.html` to `docs/dance/index.html`, run the check.
3. Fix anything under FAILED. For CHANGED, confirm each entry is something you meant; a favourite that changed needs a reason.
4. Run `node _tests/dance/check.js --update --all`, read the "unlike the favourites" and "weak" lines for the new items, and commit the new baseline with the change, naming what changed.
5. Tell the owner what is new and ask them to listen and watch. Record what they say in `verdicts.json`, word for word.

## The measures

Sound is rendered offline for eight bars and looked at every 5 ms in three bands. Movement is followed as nine joints, 24 times a beat for sixteen beats, with the page's own easing and floor guard.

| Measure | Meaning | From |
| --- | --- | --- |
| `pulse` | Highest autocorrelation peak of the onset curve between 40 and 200 beats a minute | Lartillot et al. 2008 (pulse clarity) |
| `onBeat` | Share of all attacks within 35 ms of a beat, against an even spread | |
| `repeat` | How alike consecutive bars are in where they hit | |
| `loudVar` | Variation of the 50 ms loudness curve | Stupacher et al. 2016 |
| `low`, `harsh`, `fill` | Low end below 120 Hz; sustained 2.5 to 4.5 kHz; how full the gaps between hits are | |
| `clash` | Notes a semitone or minor ninth apart sounding together, weighted by length and loudness | |
| `sync` | Syncopation of the drums | Longuet-Higgins and Lee 1984 |
| `motion`, `bob`, `sway` | Mean joint speed per beat; head and hip travel per beat | |
| `alignLi`, `alignBai` | Stillest moments against the beats, within 50 ms | Li et al. 2021; Siyao et al. 2022 |
| `shapes`, `apart` | Distinct poses on the half beats; distance to the most similar other move | |
| `floor`, `skate` | Lowest joint against the floor; feet sliding while planted | foot-skating ratio of motion-synthesis papers |

The pictures in the baseline depend on the browser's drawing. If a new Chromium flags every move with small numbers and the page has not changed, record a fresh baseline.
