This is a syntax reference: the point is to understand what each method does and when it helps. The numbers, notes, chords, and rhythm patterns in it are illustrative placeholders — choose them by musical intent rather than copying them as templates. For needs not listed, reason from these mechanisms instead of forcing the nearest example.

### Mini-notation
- Symbols: `*N` repeat, `/N` slow, `[]` group, `<>` alternate cycle, `,` parallel, `~` rest, `(k,n)` Euclidean, `!N` replicate, `@N` stretch.
- **Forbidden**: `_` (hold step) causes parse errors at the start of a `,` branch or inside `[]` — use explicit values or `@N`; `|` inside `<>` (random-pick operator, invalid in angle-bracket alternation — use `<[...] [...] [...]>` for multi-step groups); `;` inside `<>` (not valid mini-notation — for simultaneous chord groups write `<[n1,n2,n3] [n4,n5,n6]>`, not `<n1 n2 n3; n4 n5 n6>`). `validate` will catch these.
- Value patterns (`.gain("...")`, `.lpf("...")`, `.speed("...")`, etc.): **forbidden** `_` inside them — always write explicit numbers; `~` is only for structural patterns, not numeric strings. Also `[_ ...]` (hold at bracket start) and `, _ ...` (hold at parallel-branch start) cause runtime parse errors.

### Core structure
- `note("c3 e3 g3")`, `s("bd sd hh")`, `stack(...)`, `cat(...)`. Tempo: set on the first line of `setCode` with `setcps(N)` (cps = bpm / 240, e.g. 120 BPM → `setcps(0.5)`).
- **Forbidden**: `.add(s("..."))` to layer samples — `.add()` is arithmetic (only for pitch offsets like `.add(note("7"))`); it cannot accept a sample-name string and will throw `cannot parse as numeral: "bd"`. To layer multiple `s()` tracks use comma syntax `s("bd*4, ~ sd ~ sd")` or `stack(s("bd*4"), s("~ sd ~ sd"))`.

### Sounds & samples
- Synths: `.s("sawtooth"|"sine"|"square"|"triangle"|"supersaw")`. For full melodic / GM / Dirt / drum-machine names see the Sample Reference section. **Do not invent names** outside the list (e.g., "superpad", "rhodes", "strings").
- Drums: `bd sd hh rs cp cb lt mt ht 808bd 808sd 808oh 808hc`. Drum-machine banks: `.bank("RolandTR808")` — when using `.bank()`, use bank-specific suffixes `bd sd hh oh cp cb lt mt ht perc rim sh cr` (note: the bank's rimshot is `rim`, not `rs`; `rs` is only valid without a bank).

### Effects
- `.gain(0..1)`, `.lpf(Hz)`, `.lpq(N)` (low-pass resonance 0–50; alias `.resonance(N)`), `.hpf(Hz)`, `.hpq(N)`, `.delay(0..1)`, `.room(N)`, `.pan(0..1)`, `.attack/.decay/.sustain/.release`, `.speed(N)`, `.vowel("a e i o")`. `.lpfq` does not exist — use `.lpq`.

### Pattern transforms (pick by the change you want, do not apply them one by one)
- Change speed and direction: `.fast(N)`/`.slow(N)`/`.rev()`.
- Thicken or mirror: `.ply(N)` (replicate each event N times) / `.jux(rev)` (process a mirrored copy across the stereo channels).
- Reshape the rhythmic skeleton and entrances/exits: `.struct("x ~ x x")`/`.mask("<0 1 1 0>/16")`.
- Break mechanical sameness with occasional variation: `.every(N, fast(2))`, `.sometimes(fast(2))`/`.often(fn)`/`.rarely(fn)`, `.chunk(N, fast(2))`.
- Add an echo/counter layer: `.off(0.125, x => x.add(note("7")))`.
- Callback constraint: for `every`/`sometimes`/`off`/`chunk`, callbacks must be real Strudel functions (`fast(N)`, `rev`, `ply(N)`, or `x => x.something(...)`). TidalCycles-specific APIs (`by`, `sometimesBy`, `someCyclesBy`, `within`) are **not available** in Strudel — `validate` will catch them.

### Signals & modulation
- Signal sources — drive parameters with continuous change so static values come alive: `sine`/`cosine` (smooth back-and-forth), `saw`/`tri` (ramp / triangle sweep), `rand` (random jitter), `perlin` (natural wander); combine with `.range(a,b).slow(N)` (value range and period) / `.segment(N)` (quantize into N steps). E.g. `.lpf(sine.range(500,1000).slow(8))` for a gliding filter, `.gain(perlin.range(.6,.9))` for natural gain swell.
- Pick the modulation target by the sound you want (not a fixed template): a slow `sine`/`perlin` on `.lpf` for filter sweeps and swell (`.lpf(sine.range(400,800).slow(8)).lpq(5)`); on `.gain` for a breathing or sidechain pump (`.gain(perlin.range(.5,.9))`, `.gain("<.3 1@3>*2")`); on `.fm` for timbral evolution (`.fm(sine.range(2,8).slow(4))`); on `.pan` for stereo drift (`.pan(sine.slow(4))`). Range and rate serve the musical purpose — they are not fixed values.

### Harmony (a "syntax toolbox", use as needed — not a fixed pipeline)
- `chord("<...>/N")` builds a chord progression — the chords, their count, and the rhythmic length are entirely set by the musical goal; do not copy the example's chords or note values. `/N` only controls how many cycles this harmonic loop spans, set it to the structure.
- `.dict("ireal")` selects the chord-dictionary source (just one optional mapping, not a default standard).
- `.voicing()` expands chords into a concrete voicing — whether you expand depends on whether the layer needs "playability" or density control.
- `.mode("root:g2")` controls the voicing layout / center of gravity — a register and structure adjustment.
- `.anchor("D5")` locks the overall register to avoid voice drift (use only when you need a stable register).
- You can store `chord(...).dict("ireal")` in `let chords`. **Structure direction decides articulation, regardless of how fast `chords` changes**: `chords.n("pattern")` always takes its structure from the left (`chords`) — the rhythm written inside `.n()`, however dense, gets discarded and collapses to one held note per chord change (e.g. `chords.n("[0 0 7 0]*2")`: `chords` changes chord once per cycle, meant to fire 8 notes, only 1 sustained note survives). **Forbidden**: writing a rhythmic bass/melody line as `chords.n("dense pattern")`; put the rhythm on the left as structure instead: `n("pattern").set(chords)`. Use `chords.n(...)` only when the chord itself is the sole articulation unit for that layer, e.g. a held pad re-triggered once per chord change.
- ⚠️ Key principle: these methods are not a standard arrangement pipeline, nor a chain that must be combined — they are harmonic-attachment means at different levels. In practice you may skip `chords.n()` entirely, use `chord()` without `voicing()`, do only root motion without degree mapping, or even rely purely on the melody's own landing logic — the only criterion is whether you need to strengthen the "pitch-to-harmony attachment".
- Relation to "Give the melody harmonic gravity": this section only offers possible ways to support harmony; whether and how much to use them is decided by the melody's landing-point design, not a fixed rule.

### Evolving lines (a default technique, not tied to any one layer)
- By default bake the variation into the mini-notation itself so the line evolves on its own, rather than waiting for the user to ask for something "longer / richer"; you decide which layers should be richer. `<a b c>` advances one step per cycle; **nesting** `<a <b c>>` makes the inner step advance only when its turn comes, so the line's true period is the LCM of the layers — it takes a dozen-plus cycles to repeat and sounds like a composed long melody. E.g. melody `"[0 <4 3 <2 5>>*2](<3 5>,8)"`. Same for density: `*<2!3 4>`, Euclidean `(<3 5>,8)`. For occasional embellishment add `.chunk(4, fast(2))`, `.sometimes(ply("2"))`, `.every(4, rev)`.
- **Key: nested alternation must ride on a fast articulation grid (e.g. `*2`/`*4`) and evolve via "which note fires", not by slowing the whole line with `/N` to fabricate a long period.** `/N` only buys "non-repetition" while sacrificing the articulation rate — at slow tempo it smears each note into a multi-second sustain. `/N` legitimately belongs to harmonic rhythm (`chord("<...>/N")`, changing chord every few bars) and arrangement entrance/exit windows (`<0@a 1@b>`); **it does not belong on a played melodic line's `.n()` pattern**. One more distinction: harmonic rhythm is "how often the chord changes", not "how long a note rings" — a layer carrying the harmony that holds each chord across its whole span is sustain again, and must re-trigger into a pulse rather than be held.

### Scales
- `n("0 1 2 3").scale("...")` maps pitches into a modal space.
- A mode type only denotes a "way of organizing pitch"; it binds no fixed root or octave.
- Available types (a category set, not a recommended order): major / minor / dorian / mixolydian / phrygian / lydian / minor pentatonic.
- ⚠️ Do not treat any concrete spelling (e.g. a form with a root) as a default template or standard starting point. The root + mode combination should be decided by the musical structure, not by the example.
