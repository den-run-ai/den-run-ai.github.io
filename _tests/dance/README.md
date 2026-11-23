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
| `listen.js` | Optional: a second opinion on the music from models that can hear it or read its notes. Needs a key; see below. |

This folder starts with an underscore so that Quarto leaves it out of the site.

## What it checks

1. **The page's own self-test** (`window.ceoDanceSelfTest`): buttons and code agree, poses stay in range and loop, every style renders clean and equally loud for a phone speaker.
2. **Floors.** Limits nothing on the page may fall under, listed at the top of `check.js`: notes a semitone apart sounding together, too many notes outside the style's own scale, no pulse, harsh sustained treble, no low end, a level out of line; a joint through the floor, a move that barely moves, a move that makes almost the same shapes as another.
3. **Drift.** Each style and move is compared with `baseline.json`. A change in level, low end, pulse, where in the bar the sound hits, which notes it plays (any one note changed is enough), how far he moves, or how he is drawn fails the run until it is accepted with `--update`. Favourites are marked in the report.
4. **Verdicts.** Anything under `rejected` in `verdicts.json` fails the run if it is back on the page.
5. **Report only.** What is new since the baseline, what the owner has not judged yet, and (with `--all`) which styles differ from the favourites and which moves a number can call weak.

## What it cannot tell you

The measures were tried against the owner's verdicts: five favourite styles, two called "not that bad", six styles and seven moves rejected or sent back for a rewrite. **No measure here separates the rejected ones from the liked ones.** That includes the ones taken from research (pulse clarity, loudness variation, low-frequency flux, syncopation, beat alignment of the movement, how well his arrivals match the music's attacks). One example: the favourite Midnight shuffle with its T-step has the worst match of arrivals to attacks on the page.

So a pass means "not broken in a way a number can see, and unchanged since it was last accepted". It never means "good". Whether a tune or a move is good is decided by the owner listening and watching, and recorded in `verdicts.json`.

## A second opinion from models (`listen.js`)

```
OPENROUTER_API_KEY=... node _tests/dance/listen.js [--styles a,b] [--reps 3]
```

It plays eight bars of each style, blind, to two models that take sound, gives the written notes to one that reads them, and prints their marks and what each called weakest. It is advice, not a test: it never fails anything. A full run of every style costs about a dollar. The key comes from the environment; never write one into this repository. Only the page's sound and notes are sent.

Each run starts with a control, House with three notes in ten moved a semitone, and leaves out any model that does not mark it down.

What a trial on 2026-11-23 showed (eleven general models that take sound, three that read, and a music model; 42 clips: the 36 styles then on the page and the six versions the owner had rejected, blind, up to three listens each):

- **They do not predict what the owner likes.** Liked against rejected, the models' "overall" marks separated them 0.18 to 0.79 model by model and 0.52 taken together, where 0.50 is chance. Told the genre, 0.62; reading the notes, 0.64.
- **Two of the eleven general models hear wrong notes** (`google/gemini-4-argon`, `google/gemini-4-carbon`: harmony 8 down to 2 on the damaged House). Reading the notes, all three text models saw them in all four styles tried.
- **None hears a bad beat.** With every sixteenth moved by up to 52 ms, or the kick removed, marks fell by half a point at most. `check.js` catches both at once (pulse 0.9 to 0.1; low end 11 dB down).
- **They misname most genres** (the best two named the genre first in three answers of ten; most answers were "chiptune" or "techno") and get the tempo right in a third to three quarters of answers.
- **Marks wobble by about a point from run to run.** Only a gap as large as the control's means something.
- **Their remarks are sometimes right and sometimes wrong.** Right: the Disco the owner rejected for "very poor notes" had "no distinct lead melody" in six answers of six. Wrong: one reader said the present Disco has no kick on beats 2 and 4. Check a remark against the notes before acting on it.
- **NVIDIA's Music Flamingo** (`music-flamingo-2601-hf`, run the same day on a rented GPU) reads facts well and judges nothing. It gave the right tempo in 41 of 42 descriptions and a key that fits the written notes in 36 of 42. But it called 100 of 126 clips "chiptune", marked two clips in three "overall 5", and described and marked the damaged copies the same as the clean ones, even when asked directly about wrong notes, timing and the kick. Tempo and key are known exactly from the page's code, so it adds nothing here.
- One general model answered that it cannot hear a third of the time; one gave the same answer to every clip.

So: useful as a second pair of ears for wrong notes and a missing tune, no use for rhythm or for taste.

## Adding or changing music or a move

1. Read `verdicts.json` first. Do not bring back anything rejected unless the owner asks.
2. Make the change, copy `dance/index.html` to `docs/dance/index.html`, run the check.
3. Fix anything under FAILED. For CHANGED, confirm each entry is something you meant; a favourite that changed needs a reason.
4. Run `node _tests/dance/check.js --update --all`, read the "unlike the favourites" and "weak" lines for the new items, and commit the new baseline with the change, naming what changed. For new music, `listen.js --styles` on the new styles is a cheap second opinion.
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
| `offKey`, `keys`, `pitchSum` | Share of the notes' weight outside the best-fitting seven-note scale; the weight of each of the twelve pitch classes; the sum of all pitches | |
| `sync` | Syncopation of the drums | Longuet-Higgins and Lee 1984 |
| `motion`, `bob`, `sway` | Mean joint speed per beat; head and hip travel per beat | |
| `alignLi`, `alignBai` | Stillest moments against the beats, within 50 ms | Li et al. 2021; Siyao et al. 2022 |
| `shapes`, `apart` | Distinct poses on the half beats; distance to the most similar other move | |
| `floor`, `skate` | Lowest joint against the floor; feet sliding while planted | foot-skating ratio of motion-synthesis papers |

The pictures in the baseline depend on the browser's drawing. If a new Chromium flags every move with small numbers and the page has not changed, record a fresh baseline.
