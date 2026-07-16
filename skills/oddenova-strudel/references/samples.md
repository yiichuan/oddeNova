# Sample catalog

Use only names listed in this packaged catalog. Never invent, translate, pluralize, or guess a sample name. Prefer canonical names over accepted aliases.

## Built-in synths

Use directly with `s("...")`:

`sawtooth` · `sine` · `square` · `triangle` · `supersaw`

## Canonical melodic samples

`piano` · `arpy` · `bass` · `moog` · `juno` · `sax` · `gtr` · `pluck` · `sitar` · `stab`

## General MIDI soundfonts

Use the canonical GM names below with `note()` or `n().scale()`:

- Keys: `gm_piano`, `gm_epiano1`, `gm_epiano2`, `gm_harpsichord`, `gm_clavinet`
- Bass and strings: `gm_acoustic_bass`, `gm_electric_bass_finger`, `gm_synth_bass_1`, `gm_violin`, `gm_cello`, `gm_string_ensemble_1`, `gm_pizzicato_strings`
- Winds and brass: `gm_flute`, `gm_clarinet`, `gm_tenor_sax`, `gm_trumpet`, `gm_french_horn`
- Pads and leads: `gm_pad_new_age`, `gm_pad_warm`, `gm_pad_poly`, `gm_pad_choir`, `gm_lead_1_square`, `gm_lead_2_sawtooth`
- Percussion and effects: `gm_vibraphone`, `gm_marimba`, `gm_steel_drums`, `gm_taiko_drum`, `gm_fx_rain`, `gm_fx_atmosphere`, `gm_seashore`

Accepted MIDI-style aliases are normalized to canonical names; write the canonical target when possible:

- `gm_acoustic_grand_piano` → `gm_piano`
- `gm_electric_piano_1` → `gm_epiano1`
- `gm_pad_2_warm` → `gm_pad_warm`
- `gm_lead_sawtooth` → `gm_lead_2_sawtooth`

## Dirt categories

Use this curated safe subset of Dirt's canonical categories:

- Core drums: `bd`, `sd`, `hh`, `oh`, `cp`, `cb`, `cr`, `lt`, `mt`, `ht`, `rd`, `rim`, `rs`
- 808/909 and kicks: `808`, `909`, `808bd`, `808sd`, `808oh`, `808hc`, `hardkick`, `clubkick`, `popkick`
- Breaks and grooves: `amencutup`, `breaks125`, `breaks152`, `breaks157`, `breaks165`, `jungle`, `house`, `techno`
- Tonal instruments: `arpy`, `bass`, `bass0`, `bass1`, `juno`, `moog`, `pluck`, `sax`, `sitar`, `stab`
- Voice and speech: `alphabet`, `diphone`, `diphone2`, `mouth`, `numbers`, `speakspell`, `speech`, `yeah`
- Atmosphere and effects: `birds`, `birds3`, `breath`, `crow`, `fire`, `glitch`, `glitch2`, `insect`, `noise`, `noise2`, `outdoor`, `space`, `wind`

## Drum-machine banks

Use either bank syntax or a direct full sample:

```js
s("bd sd hh oh").bank("RolandTR808")
s("RolandTR808_bd RolandTR808_sd")
```

Representative full bank names include `AkaiLinn`, `AkaiMPC60`, `AlesisHR16`, `BossDR110`, `EmuDrumulator`, `LinnDrum`, `LinnLM1`, `OberheimDMX`, `RolandTR606`, `RolandTR707`, `RolandTR808`, `RolandTR909`, and `YamahaRX5`.

Valid bank suffixes are `bd`, `sd`, `hh`, `oh`, `cp`, `cb`, `cr`, `lt`, `mt`, `ht`, `rd`, `rim`, `sh`, `tb`, `perc`, `misc`, and `fx`. With a bank, use `rim`, not the unbanked Dirt name `rs`. Registered short aliases include `Linn`, `MPC60`, `HR16`, `Drumulator`, `LM1`, `DMX`, `TR606`, `TR707`, `TR808`, `TR909`, and `RX5`; for example `s("TR808_bd")`.
