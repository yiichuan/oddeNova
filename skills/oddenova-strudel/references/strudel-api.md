# Supported Strudel API

Use this packaged subset. Prefer a simple known expression over an unlisted or guessed method.

## Structure and notation

- Set tempo with `setcps(BPM / 240)`.
- Build complete programs with `stack(...)`; sequence sections with `cat(...)` when needed.
- Create events with `note("...")`, `n("...")`, `s("...")`, and `chord("...")`.
- Use Mini-notation: `*N` repeat, `/N` slow, `[]` group, `<>` alternate, `,` parallel, `~` rest, `(k,n)` Euclidean rhythm, `!N` copy, and `@N` extend.
- Do not put `_` at the start of a parallel branch, inside `[]`, or in numeric value patterns. Use explicit values or `@N`.

## Pitch and harmony

- Map scale degrees with `.scale("D4:minor")` or another intentional root/mode.
- Use `chord("<Dm7 Bbmaj7 Fmaj7 C7>/8")`, optionally with `.dict("ireal")`, `.voicing()`, `.mode("root:g2")`, or `.anchor("D5")`.
- Use `.add(note("7"))` only for numeric pitch offsets.
- Remember that `chords.n(pattern)` takes its event structure from `chords`. When the line must articulate its own rhythm, put that rhythm on the left and use `n(pattern).set(chords)`.

## Sound and performance

- Shape tone with `.gain()`, `.lpf()`, `.lpq()` or `.resonance()`, `.hpf()`, `.hpq()`, `.delay()`, `.room()`, `.pan()`, `.attack()`, `.decay()`, `.sustain()`, `.release()`, `.speed()`, and `.vowel()`.
- Shape events with `.struct()`, `.mask()`, `.fast()`, `.slow()`, `.rev()`, `.ply()`, `.jux(rev)`, `.late()`, and `.clip()`.
- Add intentional variation with `.every(N, fast(2))`, `.sometimes(fast(2))`, `.often(fn)`, `.rarely(fn)`, `.chunk(N, fast(2))`, and `.off(0.125, x => x.add(note("7")))`.
- Use valid callbacks such as `fast(N)`, `rev`, `ply(N)`, or `x => x.method(...)`.
- Modulate parameters with `sine`, `cosine`, `saw`, `tri`, `rand`, or `perlin`, combined with `.range(a, b)`, `.slow(N)`, or `.segment(N)`.

## Hard exclusions

- Never use `.add(s("..."))`. `.add()` is numeric and cannot layer sample names. Combine sound layers with `stack(s(...), s(...))` or comma-parallel Mini-notation.
- Never use `by`, `sometimesBy`, `someCyclesBy`, or `within`; these TidalCycles APIs are unavailable in this Strudel surface.
- Never use `.lpfq()`; use `.lpq()`.
- Never invent a constructor, modifier, callback, or sample name.

Self-review syntax and API names, but do not claim browser execution, audio playback, or Strudel runtime validation.
