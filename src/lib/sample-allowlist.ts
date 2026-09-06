// Auto-derived from:
//   sample_library/strudel.md              — Dirt-Samples (## headers)
//   sample_library/tidal-drum-machines.md  — drum machine packs (## headers)
//   tidalcycles/uzu-drumkit strudel.json   — brk, misc, oh, rd, rim, sh, tb
//   felixroos/dough-samples vcsl.json      — VCSL instruments
//   felixroos/dough-samples mridangam.json — Mridangam
//   todepond/samples tidal-drum-machines-alias.json — drum machine short aliases
// Plus melodic samples listed in the agent system prompt.

export const DIRT_SAMPLES: readonly string[] = [
  '808', '909',
  '808bd', '808cy', '808hc', '808ht', '808lc', '808lt', '808mc', '808mt', '808oh', '808sd',
  'ab', 'ade', 'ades2', 'ades3', 'ades4', 'alex', 'alphabet', 'amencutup', 'armora', 'arp', 'arpy',
  'auto', 'baa', 'baa2', 'bass', 'bass0', 'bass1', 'bass2', 'bass3', 'bassdm', 'bassfoo', 'battles',
  'bd', 'bend', 'bev', 'bin', 'birds', 'birds3', 'bleep', 'blip', 'blue', 'bottle',
  'breaks125', 'breaks152', 'breaks157', 'breaks165', 'breath', 'brk', 'bubble',
  'can', 'casio', 'cb', 'cc', 'chin', 'circus', 'clak', 'click', 'clubkick', 'co', 'coins',
  'control', 'cosmicg', 'cp', 'cr', 'crow',
  'd', 'db', 'diphone', 'diphone2', 'dist', 'dork2', 'dorkbot', 'dr', 'dr2', 'dr55', 'dr_few',
  'drum', 'drumtraks',
  'e', 'east', 'electro1', 'em2', 'erk',
  'f', 'feel', 'feelfx', 'fest', 'fire', 'flick', 'fm', 'foo', 'future',
  'gab', 'gabba', 'gabbaloud', 'gabbalouder', 'glasstap', 'glitch', 'glitch2', 'gretsch', 'gtr',
  'h', 'hand', 'hardcore', 'hardkick', 'haw', 'hc', 'hh', 'hh27', 'hit', 'hmm', 'ho', 'hoover',
  'house', 'ht',
  'if', 'ifdrums', 'incoming', 'industrial', 'insect', 'invaders',
  'jazz', 'jungbass', 'jungle', 'juno', 'jvbass',
  'kicklinn', 'koy', 'kurt',
  'latibro', 'led', 'less', 'lighter', 'linnhats', 'lt',
  'made', 'made2', 'mash', 'mash2', 'metal', 'miniyeah', 'misc', 'monsterb', 'moog', 'mouth', 'mp3',
  'msg', 'mt', 'mute',
  'newnotes', 'noise', 'noise2', 'notes', 'numbers', 'num',
  'oc', 'odx', 'off', 'oh', 'outdoor',
  'pad', 'padlong', 'pebbles', 'perc', 'peri', 'pluck', 'popkick', 'print', 'proc', 'procshort', 'psr',
  'rave', 'rave2', 'ravemono', 'rd', 'realclaps', 'reverbkick', 'rim', 'rm', 'rs',
  'sax', 'sd', 'seawolf', 'sequential', 'sf', 'sh', 'sheffield', 'short', 'sid', 'simplesine', 'sitar',
  'sn', 'space', 'speakspell', 'speech', 'speechless', 'speedupdown', 'stab', 'stomp', 'subroc3d',
  'sugar', 'sundance',
  'tabla', 'tabla2', 'tablex', 'tacscan', 'tb', 'tech', 'techno', 'tink', 'tok', 'toys', 'trump',
  'ul', 'ulgab', 'uxay',
  'v', 'voodoo',
  'wind', 'wobble', 'world',
  'xmas',
  'yeah',
];

// Melodic samples explicitly listed in the agent system prompt.
export const MELODIC_SAMPLES: readonly string[] = [
  'piano', 'arpy', 'bass', 'moog', 'juno', 'sax', 'gtr', 'pluck', 'sitar', 'stab',
];

// MIDI-standard GM name → strudel canonical name.
// The LLM tends to generate the long MIDI-standard names from its training data,
// but strudel (and strudel.cc) only know the shorter canonical names. This map is
// the single source of truth used in three places:
//   1. soundfont-loader.ts — registers the aliases at runtime (playback fallback).
//   2. SAMPLE_ALLOWLIST below — so validate() accepts the alias spelling. These
//      names are deliberately kept OUT of GM_INSTRUMENTS so the system prompt
//      (which lists GM_INSTRUMENTS) steers the model toward the canonical names.
//   3. normalizeGmSampleNames() — rewrites aliases to canonical names so the
//      committed code is portable to vanilla strudel, not just oddeNova.
export const GM_NAME_ALIASES: Readonly<Record<string, string>> = {
  // Piano
  gm_acoustic_grand_piano: 'gm_piano',
  gm_bright_acoustic_piano: 'gm_piano',
  gm_electric_grand_piano: 'gm_piano',
  gm_honky_tonk_piano: 'gm_piano',
  gm_honky_tonk: 'gm_piano',
  // Electric pianos
  gm_electric_piano_1: 'gm_epiano1',
  gm_electric_piano_2: 'gm_epiano2',
  // Pads (MIDI uses numbered names; strudel drops the number)
  gm_pad_1_new_age: 'gm_pad_new_age',
  gm_pad_2_warm: 'gm_pad_warm',
  gm_pad_3_polysynth: 'gm_pad_poly',
  gm_pad_4_choir: 'gm_pad_choir',
  gm_pad_5_bowed: 'gm_pad_bowed',
  gm_pad_6_metallic: 'gm_pad_metallic',
  gm_pad_7_halo: 'gm_pad_halo',
  gm_pad_8_sweep: 'gm_pad_sweep',
  // Leads (MIDI uses numbered names)
  gm_lead_square: 'gm_lead_1_square',
  gm_lead_sawtooth: 'gm_lead_2_sawtooth',
  gm_lead_calliope: 'gm_lead_3_calliope',
  gm_lead_chiff: 'gm_lead_4_chiff',
  gm_lead_charang: 'gm_lead_5_charang',
  gm_lead_voice: 'gm_lead_6_voice',
  gm_lead_fifths: 'gm_lead_7_fifths',
  gm_lead_bass_lead: 'gm_lead_8_bass_lead',
};

// General MIDI soundfont instruments — exact names from strudel's gm.mjs.
// Loaded via registerSoundfonts() in prebake (src/services/strudel.ts).
// Use with note() or n().scale() + .s("gm_...").
// Source: https://codeberg.org/uzu/strudel/raw/branch/main/packages/soundfonts/gm.mjs
export const GM_INSTRUMENTS: readonly string[] = [
  // Piano (gm_piano covers acoustic grand / bright / electric grand / honky-tonk)
  'gm_piano', 'gm_epiano1', 'gm_epiano2',
  'gm_harpsichord', 'gm_clavinet',
  // Chromatic Percussion
  'gm_celesta', 'gm_glockenspiel', 'gm_music_box', 'gm_vibraphone',
  'gm_marimba', 'gm_xylophone', 'gm_tubular_bells', 'gm_dulcimer',
  // Organ
  'gm_drawbar_organ', 'gm_percussive_organ', 'gm_rock_organ', 'gm_church_organ',
  'gm_reed_organ', 'gm_accordion', 'gm_harmonica', 'gm_bandoneon',
  // Guitar
  'gm_acoustic_guitar_nylon', 'gm_acoustic_guitar_steel', 'gm_electric_guitar_jazz',
  'gm_electric_guitar_clean', 'gm_electric_guitar_muted', 'gm_overdriven_guitar',
  'gm_distortion_guitar', 'gm_guitar_harmonics',
  // Bass
  'gm_acoustic_bass', 'gm_electric_bass_finger', 'gm_electric_bass_pick',
  'gm_fretless_bass', 'gm_slap_bass_1', 'gm_slap_bass_2',
  'gm_synth_bass_1', 'gm_synth_bass_2',
  // Strings
  'gm_violin', 'gm_viola', 'gm_cello', 'gm_contrabass',
  'gm_tremolo_strings', 'gm_pizzicato_strings', 'gm_orchestral_harp', 'gm_timpani',
  // Ensemble
  'gm_string_ensemble_1', 'gm_string_ensemble_2', 'gm_synth_strings_1', 'gm_synth_strings_2',
  'gm_choir_aahs', 'gm_voice_oohs', 'gm_synth_choir', 'gm_orchestra_hit',
  // Brass
  'gm_trumpet', 'gm_trombone', 'gm_tuba', 'gm_muted_trumpet',
  'gm_french_horn', 'gm_brass_section', 'gm_synth_brass_1', 'gm_synth_brass_2',
  // Reed
  'gm_soprano_sax', 'gm_alto_sax', 'gm_tenor_sax', 'gm_baritone_sax',
  'gm_oboe', 'gm_english_horn', 'gm_bassoon', 'gm_clarinet',
  // Pipe
  'gm_piccolo', 'gm_flute', 'gm_recorder', 'gm_pan_flute',
  'gm_blown_bottle', 'gm_shakuhachi', 'gm_whistle', 'gm_ocarina',
  // Synth Lead
  'gm_lead_1_square', 'gm_lead_2_sawtooth', 'gm_lead_3_calliope', 'gm_lead_4_chiff',
  'gm_lead_5_charang', 'gm_lead_6_voice', 'gm_lead_7_fifths', 'gm_lead_8_bass_lead',
  // Synth Pad
  'gm_pad_new_age', 'gm_pad_warm', 'gm_pad_poly', 'gm_pad_choir',
  'gm_pad_bowed', 'gm_pad_metallic', 'gm_pad_halo', 'gm_pad_sweep',
  // Synth Effects
  'gm_fx_rain', 'gm_fx_soundtrack', 'gm_fx_crystal', 'gm_fx_atmosphere',
  'gm_fx_brightness', 'gm_fx_goblins', 'gm_fx_echoes', 'gm_fx_sci_fi',
  // Ethnic
  'gm_sitar', 'gm_banjo', 'gm_shamisen', 'gm_koto',
  'gm_kalimba', 'gm_bagpipe', 'gm_fiddle', 'gm_shanai',
  // Percussive
  'gm_tinkle_bell', 'gm_agogo', 'gm_steel_drums', 'gm_woodblock',
  'gm_taiko_drum', 'gm_melodic_tom', 'gm_synth_drum', 'gm_reverse_cymbal',
  // Sound Effects
  'gm_guitar_fret_noise', 'gm_breath_noise', 'gm_seashore', 'gm_bird_tweet',
  'gm_telephone', 'gm_helicopter', 'gm_applause', 'gm_gunshot',
];

// Drum machine packs from tidal-drum-machines.md.
export const DRUM_MACHINE_SAMPLES: readonly string[] = [
  'AJKPercusyn_bd', 'AJKPercusyn_cb', 'AJKPercusyn_ht', 'AJKPercusyn_sd',
  'AkaiLinn_bd', 'AkaiLinn_cb', 'AkaiLinn_cp', 'AkaiLinn_cr', 'AkaiLinn_hh', 'AkaiLinn_ht',
  'AkaiLinn_lt', 'AkaiLinn_mt', 'AkaiLinn_oh', 'AkaiLinn_rd', 'AkaiLinn_sd', 'AkaiLinn_sh', 'AkaiLinn_tb',
  'AkaiMPC60_bd', 'AkaiMPC60_cp', 'AkaiMPC60_cr', 'AkaiMPC60_hh', 'AkaiMPC60_ht', 'AkaiMPC60_lt',
  'AkaiMPC60_misc', 'AkaiMPC60_mt', 'AkaiMPC60_oh', 'AkaiMPC60_perc', 'AkaiMPC60_rd', 'AkaiMPC60_rim', 'AkaiMPC60_sd',
  'AkaiXR10_bd', 'AkaiXR10_cb', 'AkaiXR10_cp', 'AkaiXR10_cr', 'AkaiXR10_hh', 'AkaiXR10_ht', 'AkaiXR10_lt',
  'AkaiXR10_misc', 'AkaiXR10_mt', 'AkaiXR10_oh', 'AkaiXR10_perc', 'AkaiXR10_rd', 'AkaiXR10_rim',
  'AkaiXR10_sd', 'AkaiXR10_sh', 'AkaiXR10_tb',
  'AlesisHR16_bd', 'AlesisHR16_cp', 'AlesisHR16_hh', 'AlesisHR16_ht', 'AlesisHR16_lt',
  'AlesisHR16_oh', 'AlesisHR16_perc', 'AlesisHR16_rim', 'AlesisHR16_sd', 'AlesisHR16_sh',
  'AlesisSR16_bd', 'AlesisSR16_cb', 'AlesisSR16_cp', 'AlesisSR16_cr', 'AlesisSR16_hh',
  'AlesisSR16_misc', 'AlesisSR16_oh', 'AlesisSR16_perc', 'AlesisSR16_rd', 'AlesisSR16_rim',
  'AlesisSR16_sd', 'AlesisSR16_sh', 'AlesisSR16_tb',
  'BossDR110_bd', 'BossDR110_cp', 'BossDR110_cr', 'BossDR110_hh', 'BossDR110_oh', 'BossDR110_rd', 'BossDR110_sd',
  'BossDR220_bd', 'BossDR220_cp', 'BossDR220_cr', 'BossDR220_hh', 'BossDR220_ht', 'BossDR220_lt',
  'BossDR220_mt', 'BossDR220_oh', 'BossDR220_perc', 'BossDR220_rd', 'BossDR220_sd',
  'BossDR55_bd', 'BossDR55_hh', 'BossDR55_rim', 'BossDR55_sd',
  'BossDR550_bd', 'BossDR550_cb', 'BossDR550_cp', 'BossDR550_cr', 'BossDR550_hh', 'BossDR550_ht',
  'BossDR550_lt', 'BossDR550_misc', 'BossDR550_mt', 'BossDR550_oh', 'BossDR550_perc', 'BossDR550_rd',
  'BossDR550_rim', 'BossDR550_sd', 'BossDR550_sh', 'BossDR550_tb',
  'CasioRZ1_bd', 'CasioRZ1_cb', 'CasioRZ1_cp', 'CasioRZ1_cr', 'CasioRZ1_hh', 'CasioRZ1_ht',
  'CasioRZ1_lt', 'CasioRZ1_mt', 'CasioRZ1_rd', 'CasioRZ1_rim', 'CasioRZ1_sd',
  'CasioSK1_bd', 'CasioSK1_hh', 'CasioSK1_ht', 'CasioSK1_mt', 'CasioSK1_oh', 'CasioSK1_sd',
  'CasioVL1_bd', 'CasioVL1_hh', 'CasioVL1_sd',
  'DoepferMS404_bd', 'DoepferMS404_hh', 'DoepferMS404_lt', 'DoepferMS404_oh', 'DoepferMS404_sd',
  'EmuDrumulator_bd', 'EmuDrumulator_cb', 'EmuDrumulator_cp', 'EmuDrumulator_cr', 'EmuDrumulator_hh',
  'EmuDrumulator_ht', 'EmuDrumulator_lt', 'EmuDrumulator_mt', 'EmuDrumulator_oh', 'EmuDrumulator_perc',
  'EmuDrumulator_rim', 'EmuDrumulator_sd',
  'EmuModular_bd', 'EmuModular_misc', 'EmuModular_perc',
  'EmuSP12_bd', 'EmuSP12_cb', 'EmuSP12_cp', 'EmuSP12_cr', 'EmuSP12_hh', 'EmuSP12_ht', 'EmuSP12_lt',
  'EmuSP12_misc', 'EmuSP12_mt', 'EmuSP12_oh', 'EmuSP12_perc', 'EmuSP12_rd', 'EmuSP12_rim', 'EmuSP12_sd',
  'KorgDDM110_bd', 'KorgDDM110_cp', 'KorgDDM110_cr', 'KorgDDM110_hh', 'KorgDDM110_ht',
  'KorgDDM110_lt', 'KorgDDM110_oh', 'KorgDDM110_rim', 'KorgDDM110_sd',
  'KorgKPR77_bd', 'KorgKPR77_cp', 'KorgKPR77_hh', 'KorgKPR77_oh', 'KorgKPR77_sd',
  'KorgKR55_bd', 'KorgKR55_cb', 'KorgKR55_cr', 'KorgKR55_hh', 'KorgKR55_ht',
  'KorgKR55_oh', 'KorgKR55_perc', 'KorgKR55_rim', 'KorgKR55_sd',
  'KorgKRZ_bd', 'KorgKRZ_cr', 'KorgKRZ_fx', 'KorgKRZ_hh', 'KorgKRZ_ht', 'KorgKRZ_lt',
  'KorgKRZ_misc', 'KorgKRZ_oh', 'KorgKRZ_rd', 'KorgKRZ_sd',
  'KorgM1_bd', 'KorgM1_cb', 'KorgM1_cp', 'KorgM1_cr', 'KorgM1_hh', 'KorgM1_ht', 'KorgM1_misc',
  'KorgM1_mt', 'KorgM1_oh', 'KorgM1_perc', 'KorgM1_rd', 'KorgM1_rim', 'KorgM1_sd', 'KorgM1_sh', 'KorgM1_tb',
  'KorgMinipops_bd', 'KorgMinipops_hh', 'KorgMinipops_misc', 'KorgMinipops_oh', 'KorgMinipops_sd',
  'KorgPoly800_bd',
  'KorgT3_bd', 'KorgT3_cp', 'KorgT3_hh', 'KorgT3_misc', 'KorgT3_oh', 'KorgT3_perc',
  'KorgT3_rim', 'KorgT3_sd', 'KorgT3_sh',
  'Linn9000_bd', 'Linn9000_cb', 'Linn9000_cr', 'Linn9000_hh', 'Linn9000_ht', 'Linn9000_lt',
  'Linn9000_mt', 'Linn9000_oh', 'Linn9000_perc', 'Linn9000_rd', 'Linn9000_rim', 'Linn9000_sd', 'Linn9000_tb',
  'LinnDrum_bd', 'LinnDrum_cb', 'LinnDrum_cp', 'LinnDrum_cr', 'LinnDrum_hh', 'LinnDrum_ht',
  'LinnDrum_lt', 'LinnDrum_mt', 'LinnDrum_oh', 'LinnDrum_perc', 'LinnDrum_rd', 'LinnDrum_rim',
  'LinnDrum_sd', 'LinnDrum_sh', 'LinnDrum_tb',
  'LinnLM1_bd', 'LinnLM1_cb', 'LinnLM1_cp', 'LinnLM1_hh', 'LinnLM1_ht', 'LinnLM1_lt',
  'LinnLM1_oh', 'LinnLM1_perc', 'LinnLM1_rim', 'LinnLM1_sd', 'LinnLM1_sh', 'LinnLM1_tb',
  'LinnLM2_bd', 'LinnLM2_cb', 'LinnLM2_cp', 'LinnLM2_cr', 'LinnLM2_hh', 'LinnLM2_ht', 'LinnLM2_lt',
  'LinnLM2_mt', 'LinnLM2_oh', 'LinnLM2_rd', 'LinnLM2_rim', 'LinnLM2_sd', 'LinnLM2_sh', 'LinnLM2_tb',
  'MFB512_bd', 'MFB512_cp', 'MFB512_cr', 'MFB512_hh', 'MFB512_ht', 'MFB512_lt',
  'MFB512_mt', 'MFB512_oh', 'MFB512_sd',
  'MPC1000_bd', 'MPC1000_cp', 'MPC1000_hh', 'MPC1000_oh', 'MPC1000_perc', 'MPC1000_sd', 'MPC1000_sh',
  'MoogConcertMateMG1_bd', 'MoogConcertMateMG1_sd',
  'OberheimDMX_', 'OberheimDMX_bd', 'OberheimDMX_cp', 'OberheimDMX_cr', 'OberheimDMX_hh',
  'OberheimDMX_ht', 'OberheimDMX_lt', 'OberheimDMX_mt', 'OberheimDMX_oh', 'OberheimDMX_rd',
  'OberheimDMX_rim', 'OberheimDMX_sd', 'OberheimDMX_sh', 'OberheimDMX_tb',
  'RhodesPolaris_bd', 'RhodesPolaris_misc', 'RhodesPolaris_sd',
  'RhythmAce_bd', 'RhythmAce_hh', 'RhythmAce_ht', 'RhythmAce_lt', 'RhythmAce_oh',
  'RhythmAce_perc', 'RhythmAce_sd',
  'RolandCompurhythm1000_bd', 'RolandCompurhythm1000_cb', 'RolandCompurhythm1000_cp',
  'RolandCompurhythm1000_cr', 'RolandCompurhythm1000_hh', 'RolandCompurhythm1000_ht',
  'RolandCompurhythm1000_lt', 'RolandCompurhythm1000_mt', 'RolandCompurhythm1000_oh',
  'RolandCompurhythm1000_perc', 'RolandCompurhythm1000_rd', 'RolandCompurhythm1000_rim', 'RolandCompurhythm1000_sd',
  'RolandCompurhythm78_bd', 'RolandCompurhythm78_cb', 'RolandCompurhythm78_hh',
  'RolandCompurhythm78_misc', 'RolandCompurhythm78_oh', 'RolandCompurhythm78_perc',
  'RolandCompurhythm78_sd', 'RolandCompurhythm78_tb',
  'RolandCompurhythm8000_bd', 'RolandCompurhythm8000_cb', 'RolandCompurhythm8000_cp',
  'RolandCompurhythm8000_cr', 'RolandCompurhythm8000_hh', 'RolandCompurhythm8000_ht',
  'RolandCompurhythm8000_lt', 'RolandCompurhythm8000_mt', 'RolandCompurhythm8000_oh',
  'RolandCompurhythm8000_perc', 'RolandCompurhythm8000_rim', 'RolandCompurhythm8000_sd',
  'RolandD110_bd', 'RolandD110_cb', 'RolandD110_cr', 'RolandD110_hh', 'RolandD110_lt',
  'RolandD110_oh', 'RolandD110_perc', 'RolandD110_rd', 'RolandD110_rim', 'RolandD110_sd',
  'RolandD110_sh', 'RolandD110_tb',
  'RolandD70_bd', 'RolandD70_cb', 'RolandD70_cp', 'RolandD70_cr', 'RolandD70_hh', 'RolandD70_lt',
  'RolandD70_mt', 'RolandD70_oh', 'RolandD70_perc', 'RolandD70_rd', 'RolandD70_rim', 'RolandD70_sd', 'RolandD70_sh',
  'RolandDDR30_bd', 'RolandDDR30_ht', 'RolandDDR30_lt', 'RolandDDR30_sd',
  'RolandJD990_bd', 'RolandJD990_cb', 'RolandJD990_cp', 'RolandJD990_cr', 'RolandJD990_hh',
  'RolandJD990_ht', 'RolandJD990_lt', 'RolandJD990_misc', 'RolandJD990_mt', 'RolandJD990_oh',
  'RolandJD990_perc', 'RolandJD990_rd', 'RolandJD990_sd', 'RolandJD990_tb',
  'RolandMC202_bd', 'RolandMC202_ht', 'RolandMC202_perc',
  'RolandMC303_bd', 'RolandMC303_cb', 'RolandMC303_cp', 'RolandMC303_fx', 'RolandMC303_hh',
  'RolandMC303_ht', 'RolandMC303_lt', 'RolandMC303_misc', 'RolandMC303_mt', 'RolandMC303_oh',
  'RolandMC303_perc', 'RolandMC303_rd', 'RolandMC303_rim', 'RolandMC303_sd', 'RolandMC303_sh', 'RolandMC303_tb',
  'RolandMT32_bd', 'RolandMT32_cb', 'RolandMT32_cp', 'RolandMT32_cr', 'RolandMT32_hh',
  'RolandMT32_ht', 'RolandMT32_lt', 'RolandMT32_mt', 'RolandMT32_oh', 'RolandMT32_perc',
  'RolandMT32_rd', 'RolandMT32_rim', 'RolandMT32_sd', 'RolandMT32_sh', 'RolandMT32_tb',
  'RolandR8_bd', 'RolandR8_cb', 'RolandR8_cp', 'RolandR8_cr', 'RolandR8_hh', 'RolandR8_ht',
  'RolandR8_lt', 'RolandR8_mt', 'RolandR8_oh', 'RolandR8_perc', 'RolandR8_rd', 'RolandR8_rim',
  'RolandR8_sd', 'RolandR8_sh', 'RolandR8_tb',
  'RolandS50_bd', 'RolandS50_cb', 'RolandS50_cp', 'RolandS50_cr', 'RolandS50_ht', 'RolandS50_lt',
  'RolandS50_misc', 'RolandS50_mt', 'RolandS50_oh', 'RolandS50_perc', 'RolandS50_rd',
  'RolandS50_sd', 'RolandS50_sh', 'RolandS50_tb',
  'RolandSH09_bd',
  'RolandSystem100_bd', 'RolandSystem100_hh', 'RolandSystem100_misc', 'RolandSystem100_oh',
  'RolandSystem100_perc', 'RolandSystem100_sd',
  'RolandTR505_bd', 'RolandTR505_cb', 'RolandTR505_cp', 'RolandTR505_cr', 'RolandTR505_hh',
  'RolandTR505_ht', 'RolandTR505_lt', 'RolandTR505_mt', 'RolandTR505_oh', 'RolandTR505_perc',
  'RolandTR505_rd', 'RolandTR505_rim', 'RolandTR505_sd',
  'RolandTR606_bd', 'RolandTR606_cr', 'RolandTR606_hh', 'RolandTR606_ht', 'RolandTR606_lt',
  'RolandTR606_oh', 'RolandTR606_sd',
  'RolandTR626_bd', 'RolandTR626_cb', 'RolandTR626_cp', 'RolandTR626_cr', 'RolandTR626_hh',
  'RolandTR626_ht', 'RolandTR626_lt', 'RolandTR626_mt', 'RolandTR626_oh', 'RolandTR626_perc',
  'RolandTR626_rd', 'RolandTR626_rim', 'RolandTR626_sd', 'RolandTR626_sh', 'RolandTR626_tb',
  'RolandTR707_bd', 'RolandTR707_cb', 'RolandTR707_cp', 'RolandTR707_cr', 'RolandTR707_hh',
  'RolandTR707_ht', 'RolandTR707_lt', 'RolandTR707_mt', 'RolandTR707_oh', 'RolandTR707_rim',
  'RolandTR707_sd', 'RolandTR707_tb',
  'RolandTR727_perc', 'RolandTR727_sh',
  'RolandTR808_bd', 'RolandTR808_cb', 'RolandTR808_cp', 'RolandTR808_cr', 'RolandTR808_hh',
  'RolandTR808_ht', 'RolandTR808_lt', 'RolandTR808_mt', 'RolandTR808_oh', 'RolandTR808_perc',
  'RolandTR808_rim', 'RolandTR808_sd', 'RolandTR808_sh',
  'RolandTR909_bd', 'RolandTR909_cp', 'RolandTR909_cr', 'RolandTR909_hh', 'RolandTR909_ht',
  'RolandTR909_lt', 'RolandTR909_mt', 'RolandTR909_oh', 'RolandTR909_rd', 'RolandTR909_rim', 'RolandTR909_sd',
  'SakataDPM48_bd', 'SakataDPM48_cp', 'SakataDPM48_cr', 'SakataDPM48_hh', 'SakataDPM48_ht',
  'SakataDPM48_lt', 'SakataDPM48_mt', 'SakataDPM48_oh', 'SakataDPM48_perc', 'SakataDPM48_rd',
  'SakataDPM48_rim', 'SakataDPM48_sd', 'SakataDPM48_sh',
  'SequentialCircuitsDrumtracks_bd', 'SequentialCircuitsDrumtracks_cb', 'SequentialCircuitsDrumtracks_cp',
  'SequentialCircuitsDrumtracks_cr', 'SequentialCircuitsDrumtracks_hh', 'SequentialCircuitsDrumtracks_ht',
  'SequentialCircuitsDrumtracks_oh', 'SequentialCircuitsDrumtracks_rd', 'SequentialCircuitsDrumtracks_rim',
  'SequentialCircuitsDrumtracks_sd', 'SequentialCircuitsDrumtracks_sh', 'SequentialCircuitsDrumtracks_tb',
  'SequentialCircuitsTom_bd', 'SequentialCircuitsTom_cp', 'SequentialCircuitsTom_cr',
  'SequentialCircuitsTom_hh', 'SequentialCircuitsTom_ht', 'SequentialCircuitsTom_oh', 'SequentialCircuitsTom_sd',
  'SergeModular_bd', 'SergeModular_misc', 'SergeModular_perc',
  'SimmonsSDS400_ht', 'SimmonsSDS400_lt', 'SimmonsSDS400_mt', 'SimmonsSDS400_sd',
  'SimmonsSDS5_bd', 'SimmonsSDS5_hh', 'SimmonsSDS5_ht', 'SimmonsSDS5_lt', 'SimmonsSDS5_mt',
  'SimmonsSDS5_oh', 'SimmonsSDS5_rim', 'SimmonsSDS5_sd',
  'SoundmastersR88_bd', 'SoundmastersR88_cr', 'SoundmastersR88_hh', 'SoundmastersR88_oh', 'SoundmastersR88_sd',
  'UnivoxMicroRhythmer12_bd', 'UnivoxMicroRhythmer12_hh', 'UnivoxMicroRhythmer12_oh', 'UnivoxMicroRhythmer12_sd',
  'ViscoSpaceDrum_bd', 'ViscoSpaceDrum_cb', 'ViscoSpaceDrum_hh', 'ViscoSpaceDrum_ht',
  'ViscoSpaceDrum_lt', 'ViscoSpaceDrum_misc', 'ViscoSpaceDrum_mt', 'ViscoSpaceDrum_oh',
  'ViscoSpaceDrum_perc', 'ViscoSpaceDrum_rim', 'ViscoSpaceDrum_sd',
  'XdrumLM8953_bd', 'XdrumLM8953_cr', 'XdrumLM8953_hh', 'XdrumLM8953_ht', 'XdrumLM8953_lt',
  'XdrumLM8953_mt', 'XdrumLM8953_oh', 'XdrumLM8953_rd', 'XdrumLM8953_rim', 'XdrumLM8953_sd', 'XdrumLM8953_tb',
  'YamahaRM50_bd', 'YamahaRM50_cb', 'YamahaRM50_cp', 'YamahaRM50_cr', 'YamahaRM50_hh',
  'YamahaRM50_ht', 'YamahaRM50_lt', 'YamahaRM50_misc', 'YamahaRM50_mt', 'YamahaRM50_oh',
  'YamahaRM50_perc', 'YamahaRM50_rd', 'YamahaRM50_sd', 'YamahaRM50_sh', 'YamahaRM50_tb',
  'YamahaRX21_bd', 'YamahaRX21_cp', 'YamahaRX21_cr', 'YamahaRX21_hh', 'YamahaRX21_ht',
  'YamahaRX21_lt', 'YamahaRX21_mt', 'YamahaRX21_oh', 'YamahaRX21_sd',
  'YamahaRX5_bd', 'YamahaRX5_cb', 'YamahaRX5_fx', 'YamahaRX5_hh', 'YamahaRX5_lt',
  'YamahaRX5_oh', 'YamahaRX5_rim', 'YamahaRX5_sd', 'YamahaRX5_sh', 'YamahaRX5_tb',
  'YamahaRY30_bd', 'YamahaRY30_cb', 'YamahaRY30_cp', 'YamahaRY30_cr', 'YamahaRY30_hh',
  'YamahaRY30_ht', 'YamahaRY30_lt', 'YamahaRY30_misc', 'YamahaRY30_mt', 'YamahaRY30_oh',
  'YamahaRY30_perc', 'YamahaRY30_rd', 'YamahaRY30_rim', 'YamahaRY30_sd', 'YamahaRY30_sh', 'YamahaRY30_tb',
  'YamahaTG33_bd', 'YamahaTG33_cb', 'YamahaTG33_cp', 'YamahaTG33_cr', 'YamahaTG33_fx',
  'YamahaTG33_ht', 'YamahaTG33_lt', 'YamahaTG33_misc', 'YamahaTG33_mt', 'YamahaTG33_oh',
  'YamahaTG33_perc', 'YamahaTG33_rd', 'YamahaTG33_rim', 'YamahaTG33_sd', 'YamahaTG33_sh', 'YamahaTG33_tb',
];

// VCSL (Vienna Symphonic Library Community Edition) samples from:
// https://raw.githubusercontent.com/felixroos/dough-samples/main/vcsl.json
// License: CC0.
// Mirrors public/sample-index/vcsl.json, which prebake() loads via
// samples('/sample-index/vcsl.json'). Keep the two in sync — a key only in the
// JSON plays but fails validate(); an entry only here validates and then 404s.
// (`sax` is a vcsl key too, but it already lives in DIRT_SAMPLES.)
export const VCSL_SAMPLES: readonly string[] = [
  'ballwhistle', 'bassdrum1', 'bassdrum2', 'bongo', 'conga', 'darbuka', 'framedrum',
  'snare_hi', 'snare_low', 'snare_modern', 'snare_rim',
  'timpani', 'timpani_roll', 'timpani2',
  'tom_mallet', 'tom_stick', 'tom_rim', 'tom2_mallet', 'tom2_stick', 'tom2_rim',
  'recorder_alto_stacc', 'recorder_alto_vib', 'recorder_alto_sus',
  'recorder_bass_stacc', 'recorder_bass_sus', 'recorder_bass_vib',
  'recorder_soprano_stacc', 'recorder_soprano_sus',
  'recorder_tenor_stacc', 'recorder_tenor_sus', 'recorder_tenor_vib',
  'ocarina', 'ocarina_small', 'ocarina_small_stacc', 'ocarina_vib',
  'pipeorgan_loud', 'pipeorgan_loud_pedal', 'pipeorgan_quiet', 'pipeorgan_quiet_pedal',
  'organ_4inch', 'organ_8inch', 'organ_full',
  'trainwhistle', 'harmonica', 'harmonica_soft', 'harmonica_vib',
  'super64', 'super64_acc', 'super64_vib', 'siren', 'didgeridoo',
  'saxello', 'saxello_stacc', 'saxello_vib', 'sax_stacc', 'sax_vib',
  'harp', 'folkharp', 'strumstick',
  'dantranh', 'dantranh_tremolo', 'dantranh_vibrato',
  'kawai', 'steinway', 'piano1',
  'psaltery_pluck', 'psaltery_spiccato', 'psaltery_bow',
  'clavisynth', 'fmpiano', 'wineglass', 'wineglass_slow', 'brakedrum',
  'agogo', 'anvil', 'balafon', 'balafon_hard', 'balafon_soft', 'belltree',
  'cabasa', 'cajon', 'clap', 'clash', 'clash2', 'clave', 'cowbell',
  'fingercymbal', 'flexatone', 'glockenspiel', 'gong', 'gong2', 'guiro',
  'handbells', 'handchimes', 'hihat',
  'kalimba', 'kalimba2', 'kalimba3', 'kalimba4', 'kalimba5',
  'marimba', 'marktrees', 'oceandrum', 'ratchet',
  'shaker_large', 'shaker_small', 'slapstick', 'sleighbells', 'slitdrum',
  'sus_cymbal', 'sus_cymbal2', 'tambourine', 'tambourine2', 'triangles',
  'tubularbells', 'tubularbells2',
  'vibraphone', 'vibraphone_soft', 'vibraphone_bowed', 'vibraslap',
  'woodblock',
  'xylophone_hard_ff', 'xylophone_hard_pp',
  'xylophone_medium_ff', 'xylophone_medium_pp',
  'xylophone_soft_ff', 'xylophone_soft_pp',
];

// Mridangam samples from:
// https://raw.githubusercontent.com/felixroos/dough-samples/main/mridangam.json
export const MRIDANGAM_SAMPLES: readonly string[] = [
  'gumki', 'ka', 'nam', 'ta', 'ki', 'dhin', 'na', 'chaapu', 'dhum', 'ardha', 'thom', 'dhi', 'tha',
];

// Short-name alias map for tidal-drum-machines banks.
// Mirrors tidal-drum-machines-alias.json loaded at runtime via aliasBank().
// Used to pre-populate SAMPLE_ALLOWLIST so the validator accepts alias tokens
// like s("TR808_bd"), s("Linn_hh").
const DRUM_MACHINE_ALIAS_MAP: Readonly<Record<string, string>> = {
  AJKPercusyn: 'Percysyn',
  AkaiLinn: 'Linn',
  AkaiMPC60: 'MPC60',
  AkaiXR10: 'XR10',
  AlesisHR16: 'HR16',
  AlesisSR16: 'SR16',
  BossDR110: 'DR110',
  BossDR220: 'DR220',
  BossDR55: 'DR55',
  BossDR550: 'DR550',
  CasioRZ1: 'RZ1',
  CasioSK1: 'SK1',
  CasioVL1: 'VL1',
  DoepferMS404: 'MS404',
  EmuDrumulator: 'Drumulator',
  EmuSP12: 'SP12',
  KorgDDM110: 'DDM110',
  KorgKPR77: 'KPR77',
  KorgKR55: 'KR55',
  KorgKRZ: 'KRZ',
  KorgM1: 'M1',
  KorgMinipops: 'Minipops',
  KorgPoly800: 'Poly800',
  KorgT3: 'T3',
  Linn9000: '9000',
  LinnLM1: 'LM1',
  LinnLM2: 'LM2',
  MoogConcertMateMG1: 'ConcertMateMG1',
  OberheimDMX: 'DMX',
  RhodesPolaris: 'Polaris',
  RhythmAce: 'Ace',
  RolandCompurhythm1000: 'Compurhythm1000',
  RolandCompurhythm78: 'Compurhythm78',
  RolandCompurhythm8000: 'Compurhythm8000',
  RolandD110: 'D110',
  RolandD70: 'D70',
  RolandDDR30: 'DDR30',
  RolandJD990: 'JD990',
  RolandMC202: 'MC202',
  RolandMC303: 'MC303',
  RolandMT32: 'MT32',
  RolandR8: 'R8',
  RolandS50: 'S50',
  RolandSH09: 'SH09',
  RolandSystem100: 'System100',
  RolandTR505: 'TR505',
  RolandTR606: 'TR606',
  RolandTR626: 'TR626',
  RolandTR707: 'TR707',
  RolandTR727: 'TR727',
  RolandTR808: 'TR808',
  RolandTR909: 'TR909',
  SakataDPM48: 'DPM48',
  SequentialCircuitsDrumtracks: 'CircuitsDrumtracks',
  SequentialCircuitsTom: 'CircuitsTom',
  SimmonsSDS400: 'SDS400',
  SimmonsSDS5: 'SDS5',
  SoundmastersR88: 'R88',
  UnivoxMicroRhythmer12: 'MicroRhythmer12',
  ViscoSpaceDrum: 'SpaceDrum',
  XdrumLM8953: 'LM8953',
  YamahaRM50: 'RM50',
  YamahaRX21: 'RX21',
  YamahaRX5: 'RX5',
  YamahaRY30: 'RY30',
  YamahaTG33: 'TG33',
};

// Pre-compute alias short-name variants (e.g. "TR808_bd") mirroring
// what aliasBank() registers at runtime, so findUnknownSamples() accepts them.
const _dmAliasVariants: string[] = DRUM_MACHINE_SAMPLES.flatMap((entry) => {
  const idx = entry.indexOf('_');
  if (idx === -1) return [];
  const alias = DRUM_MACHINE_ALIAS_MAP[entry.slice(0, idx)];
  if (!alias) return [];
  const variant = alias + entry.slice(idx); // suffix includes the '_'
  // Runtime lookup is case-insensitive; retain the documented alias spelling
  // and include the lowercase key that aliasBankMap() registers.
  return [variant, variant.toLowerCase()];
});

export const SAMPLE_ALLOWLIST: Set<string> = new Set([
  ...DIRT_SAMPLES,
  ...MELODIC_SAMPLES,
  ...DRUM_MACHINE_SAMPLES,
  ...GM_INSTRUMENTS,
  // MIDI-standard alias spellings — accepted so validate() doesn't reject
  // LLM-generated code, but intentionally NOT in GM_INSTRUMENTS so the prompt
  // doesn't advertise them. normalizeGmSampleNames() rewrites them to canonical.
  ...Object.keys(GM_NAME_ALIASES),
  ...VCSL_SAMPLES,
  ...MRIDANGAM_SAMPLES,
  ..._dmAliasVariants,
]);

// Strudel built-in synth oscillator names — these are valid in s("...") but are
// NOT sample files, so they are intentionally excluded from SAMPLE_ALLOWLIST and
// handled separately in the validator.
//
// This is the set registered by superdough's `registerSynthSounds()`, which is
// the only synth registration `strudel.ts` prebake() performs. Three registered
// names are deliberately left out because they are not audible voices:
//   `user` — needs `.partials()`; without it superdough logs a warning and falls
//            back to triangle, so allowing it only hides a mistake.
//   `one`  — a constant DC source meant for modulation.
//   `bus`  — a bus input node (type 'input'), not a sound source.
// The zzfx family (`zzfx`, `z_sine`, `z_sawtooth`, `z_triangle`, `z_square`,
// `z_tan`, `z_noise`) is excluded for a different reason: superdough can
// register it, but prebake() never calls `registerZZFXSounds()`, so those names
// would pass validation and then play silence.
export const BUILTIN_SYNTHS: Set<string> = new Set([
  // Waveforms, plus the short aliases superdough maps onto them.
  'sawtooth', 'sine', 'square', 'triangle',
  'saw', 'sin', 'sqr', 'tri',
  // Standalone synth voices.
  'supersaw', 'sbd', 'pulse', 'bytebeat',
  // Noise sources (superdough noise.mjs: white/pink/brown/crackle).
  'white', 'pink', 'brown', 'crackle',
]);

/**
 * Extract and strip-validate all sample tokens from s("...") / sound("...") calls.
 * Returns the list of tokens that are NOT in the allowlist and NOT a builtin synth.
 */
// Valid drum suffix names that exist across tidal-drum-machines banks.
// Used to validate .bank() combinations.
const VALID_BANK_SUFFIXES: ReadonlySet<string> = new Set([
  'bd', 'sd', 'hh', 'oh', 'cp', 'cb', 'cr', 'lt', 'mt', 'ht', 'rd',
  'rim', 'sh', 'tb', 'perc', 'misc', 'fx',
]);

// Whole-word matcher for the MIDI-standard alias names, longest first so that
// e.g. `gm_honky_tonk_piano` is tried before `gm_honky_tonk`. The names are
// unique `gm_*` identifiers that only ever appear inside s("...") sample
// strings, so a global word-boundary replace is safe.
const _gmAliasRe = new RegExp(
  '\\b(' +
    Object.keys(GM_NAME_ALIASES)
      .sort((a, b) => b.length - a.length)
      .join('|') +
    ')\\b',
  'g',
);

/**
 * Rewrite MIDI-standard GM names (e.g. `gm_acoustic_grand_piano`) to strudel's
 * canonical names (`gm_piano`). oddeNova registers the alias names at runtime so
 * they play locally, but vanilla strudel / strudel.cc only know the canonical
 * names — normalizing here keeps the committed code portable.
 */
export function normalizeGmSampleNames(code: string): string {
  return code.replace(_gmAliasRe, (m) => GM_NAME_ALIASES[m] ?? m);
}

function isIdentifierStart(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z_$]/.test(ch);
}

function isIdentifierPart(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
}

const REGEX_PREFIX_WORDS = new Set([
  'await', 'case', 'delete', 'do', 'else', 'in', 'instanceof', 'new',
  'of', 'return', 'throw', 'typeof', 'void', 'yield',
]);
const CONTROL_FLOW_WORDS = new Set(['catch', 'for', 'if', 'switch', 'while', 'with']);
const BLOCK_KEYWORDS = new Set(['class', 'do', 'else', 'finally', 'try']);

type Delimiter = '(' | '[' | '{';
type ParenKind = 'control' | 'function' | 'normal';

interface ParenFrame {
  kind: ParenKind;
  functionDeclaration: boolean;
}

interface BraceFrame {
  canStartRegexAfterClose: boolean;
}

type LexicalTokenKind =
  | 'start'
  | 'value'
  | 'operator'
  | 'open'
  | 'closeParen'
  | 'closeParenControl'
  | 'closeParenFunction'
  | 'closeBracket'
  | 'closeBraceBlock'
  | 'closeBraceObject'
  | 'comma'
  | 'colon'
  | 'semicolon'
  | 'keyword'
  | 'keywordBlock'
  | 'arrow';

interface LexicalState {
  canStartRegex: boolean;
  lastToken: LexicalTokenKind;
  pendingControlFlow: boolean;
  pendingFunction: boolean;
  pendingFunctionDeclaration: boolean;
  pendingClassDeclaration: boolean | null;
  pendingBlock: boolean;
  parenStack: ParenFrame[];
  braceStack: BraceFrame[];
  bracketDepth: number;
}

/** Skip a regex literal only after the caller has established that `/` starts one. */
function skipRegexLiteral(source: string, start: number): number {
  let inCharacterClass = false;
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '[') inCharacterClass = true;
    if (ch === ']') inCharacterClass = false;
    if (ch === '/' && !inCharacterClass) {
      i++;
      while (/[A-Za-z]/.test(source[i] ?? '')) i++;
      return i;
    }
    if (ch === '\n' || ch === '\r') return source.length;
    i++;
  }
  return source.length;
}

function isCommentStart(source: string, start: number): boolean {
  return source[start] === '/' && (source[start + 1] === '/' || source[start + 1] === '*');
}

function skipLexicalContent(source: string, start: number): number | null {
  const ch = source[start];
  if (isCommentStart(source, start) && source[start + 1] === '/') {
    const end = source.indexOf('\n', start + 2);
    return end === -1 ? source.length : end + 1;
  }
  if (isCommentStart(source, start) && source[start + 1] === '*') {
    const end = source.indexOf('*/', start + 2);
    return end === -1 ? source.length : end + 2;
  }
  if (ch !== '"' && ch !== "'" && ch !== '`') return null;

  let i = start + 1;
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2;
      continue;
    }
    if (source[i] === ch) return i + 1;
    i++;
  }
  return source.length;
}

function skipWhitespaceAndComments(source: string, start: number): number {
  let i = start;
  while (i < source.length) {
    if (/\s/.test(source[i] ?? '')) {
      i++;
      continue;
    }
    if (source[i] === '/' && (source[i + 1] === '/' || source[i + 1] === '*')) {
      const skipped = skipLexicalContent(source, i);
      if (skipped === null) return i;
      i = skipped;
      continue;
    }
    return i;
  }
  return i;
}

function readStringLiteral(source: string, start: number): { value: string; end: number } | null {
  const quote = source[start];
  if (quote !== '"' && quote !== "'") return null;

  let value = '';
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      value += source[i + 1] ?? '';
      i += 2;
      continue;
    }
    if (ch === quote) return { value, end: i + 1 };
    value += ch;
    i++;
  }
  return null;
}

function createLexicalState(): LexicalState {
  return {
    canStartRegex: true,
    lastToken: 'start',
    pendingControlFlow: false,
    pendingFunction: false,
    pendingFunctionDeclaration: false,
    pendingClassDeclaration: null,
    pendingBlock: false,
    parenStack: [],
    braceStack: [],
    bracketDepth: 0,
  };
}

function markValueContext(state: LexicalState): void {
  state.canStartRegex = false;
  state.lastToken = 'value';
  state.pendingControlFlow = false;
  state.pendingFunction = false;
  state.pendingFunctionDeclaration = false;
  state.pendingClassDeclaration = null;
  state.pendingBlock = false;
}

function markOperatorContext(state: LexicalState, preserveFunction = false): void {
  state.canStartRegex = true;
  state.lastToken = 'operator';
  state.pendingControlFlow = false;
  state.pendingBlock = false;
  if (!preserveFunction) {
    state.pendingFunction = false;
    state.pendingFunctionDeclaration = false;
  }
  state.pendingClassDeclaration = null;
}

function readIdentifierEnd(source: string, start: number): number {
  let i = start + 1;
  while (isIdentifierPart(source[i])) i++;
  return i;
}

function readNumberEnd(source: string, start: number): number {
  let i = start;
  while (/[A-Za-z0-9_.$]/.test(source[i] ?? '')) i++;
  return i;
}

function isOpeningDelimiter(ch: string | undefined): ch is Delimiter {
  return ch === '(' || ch === '[' || ch === '{';
}

function matchingClose(ch: Delimiter): string {
  if (ch === '(') return ')';
  if (ch === '[') return ']';
  return '}';
}

function isClosingDelimiter(ch: string | undefined): ch is ')' | ']' | '}' {
  return ch === ')' || ch === ']' || ch === '}';
}

function matchesClose(open: Delimiter, close: ')' | ']' | '}'): boolean {
  return matchingClose(open) === close;
}

function isRegexLiteralStart(source: string, start: number, state: LexicalState): boolean {
  return source[start] === '/' && !isCommentStart(source, start) && state.canStartRegex;
}

function isDeclarationContext(state: LexicalState): boolean {
  return (
    state.lastToken === 'start' ||
    state.lastToken === 'semicolon' ||
    state.lastToken === 'closeBraceBlock' ||
    (state.lastToken === 'open' &&
      state.braceStack[state.braceStack.length - 1]?.canStartRegexAfterClose === true)
  );
}

function consumeScannerToken(source: string, start: number, state: LexicalState): number {
  const ch = source[start];

  if (isIdentifierStart(ch)) {
    const end = readIdentifierEnd(source, start);
    const word = source.slice(start, end);

    if (word === 'function') {
      state.pendingFunction = true;
      state.pendingFunctionDeclaration = isDeclarationContext(state);
      state.pendingClassDeclaration = null;
      state.pendingControlFlow = false;
      state.pendingBlock = false;
      state.canStartRegex = true;
      state.lastToken = 'keyword';
      return end;
    }

    if (CONTROL_FLOW_WORDS.has(word)) {
      state.pendingControlFlow = true;
      state.pendingFunction = false;
      state.pendingFunctionDeclaration = false;
      state.pendingClassDeclaration = null;
      state.pendingBlock = false;
      state.canStartRegex = true;
      state.lastToken = 'keyword';
      return end;
    }

    if (BLOCK_KEYWORDS.has(word)) {
      state.pendingControlFlow = false;
      state.pendingFunction = false;
      state.pendingFunctionDeclaration = false;
      state.pendingClassDeclaration = word === 'class' ? isDeclarationContext(state) : null;
      state.pendingBlock = true;
      state.canStartRegex = true;
      state.lastToken = 'keywordBlock';
      return end;
    }

    if (REGEX_PREFIX_WORDS.has(word)) {
      state.pendingControlFlow = false;
      state.pendingFunction = false;
      state.pendingFunctionDeclaration = false;
      state.pendingClassDeclaration = null;
      state.canStartRegex = true;
      state.lastToken = 'keyword';
      return end;
    }

    state.canStartRegex = false;
    state.lastToken = 'value';
    state.pendingControlFlow = false;
    if (!state.pendingFunction) state.pendingFunctionDeclaration = false;
    return end;
  }

  if (/[0-9]/.test(ch ?? '') || (ch === '.' && /[0-9]/.test(source[start + 1] ?? ''))) {
    const end = readNumberEnd(source, start);
    markValueContext(state);
    return end;
  }

  if (ch === '(') {
    const kind: ParenKind = state.pendingControlFlow
      ? 'control'
      : state.pendingFunction
        ? 'function'
        : 'normal';
    state.parenStack.push({
      kind,
      functionDeclaration: kind === 'function' && state.pendingFunctionDeclaration,
    });
    state.pendingControlFlow = false;
    state.pendingFunction = false;
    state.pendingFunctionDeclaration = false;
    state.pendingBlock = false;
    state.canStartRegex = true;
    state.lastToken = 'open';
    return start + 1;
  }

  if (ch === ')') {
    const frame = state.parenStack.pop() ?? { kind: 'normal' as const, functionDeclaration: false };
    state.pendingControlFlow = false;
    state.pendingFunction = false;
    state.pendingFunctionDeclaration =
      frame.kind === 'function' && frame.functionDeclaration;
    state.pendingBlock = frame.kind === 'control' || frame.kind === 'function';
    state.canStartRegex = frame.kind === 'control';
    state.lastToken =
      frame.kind === 'control'
        ? 'closeParenControl'
        : frame.kind === 'function'
        ? 'closeParenFunction'
        : 'closeParen';
    return start + 1;
  }

  if (ch === '{') {
    const isBlock =
      state.pendingBlock ||
      state.lastToken === 'closeParenControl' ||
      state.lastToken === 'closeParenFunction' ||
      state.lastToken === 'arrow' ||
      state.lastToken === 'keywordBlock' ||
      state.lastToken === 'start' ||
      state.lastToken === 'semicolon';
    const canStartRegexAfterClose = isBlock &&
      (state.lastToken === 'closeParenFunction'
        ? state.pendingFunctionDeclaration
        : state.pendingClassDeclaration !== null
          ? state.pendingClassDeclaration
          : state.lastToken !== 'arrow');
    state.braceStack.push({ canStartRegexAfterClose });
    state.pendingControlFlow = false;
    state.pendingFunction = false;
    state.pendingFunctionDeclaration = false;
    state.pendingClassDeclaration = null;
    state.pendingBlock = false;
    state.canStartRegex = true;
    state.lastToken = 'open';
    return start + 1;
  }

  if (ch === '}') {
    const frame = state.braceStack.pop();
    state.pendingControlFlow = false;
    state.pendingFunction = false;
    state.pendingFunctionDeclaration = false;
    state.pendingClassDeclaration = null;
    state.pendingBlock = false;
    state.canStartRegex = frame?.canStartRegexAfterClose ?? false;
    state.lastToken = frame?.canStartRegexAfterClose
      ? 'closeBraceBlock'
      : 'closeBraceObject';
    return start + 1;
  }

  if (ch === '[') {
    state.bracketDepth++;
    state.pendingControlFlow = false;
    state.pendingFunction = false;
    state.pendingFunctionDeclaration = false;
    state.pendingClassDeclaration = null;
    state.pendingBlock = false;
    state.canStartRegex = true;
    state.lastToken = 'open';
    return start + 1;
  }

  if (ch === ']') {
    state.bracketDepth = Math.max(0, state.bracketDepth - 1);
    state.pendingControlFlow = false;
    state.pendingFunction = false;
    state.pendingFunctionDeclaration = false;
    state.pendingClassDeclaration = null;
    state.pendingBlock = false;
    state.canStartRegex = false;
    state.lastToken = 'closeBracket';
    return start + 1;
  }

  if (ch === ';') {
    markOperatorContext(state);
    state.canStartRegex = true;
    state.lastToken = 'semicolon';
    return start + 1;
  }

  if (ch === ',') {
    markOperatorContext(state);
    state.lastToken = 'comma';
    return start + 1;
  }

  if (ch === ':') {
    markOperatorContext(state);
    state.lastToken = 'colon';
    return start + 1;
  }

  const twoCharacterToken = source.slice(start, start + 2);
  if (twoCharacterToken === '++' || twoCharacterToken === '--') {
    markValueContext(state);
    return start + 2;
  }

  if (twoCharacterToken === '=>') {
    state.canStartRegex = true;
    state.lastToken = 'arrow';
    state.pendingControlFlow = false;
    state.pendingFunction = false;
    state.pendingFunctionDeclaration = false;
    state.pendingBlock = true;
    return start + 2;
  }

  if (ch === '*' && state.pendingFunction) {
    markOperatorContext(state, true);
    return start + 1;
  }

  if (ch === '.') {
    state.canStartRegex = false;
    state.lastToken = 'operator';
    state.pendingControlFlow = false;
    state.pendingFunction = false;
    state.pendingFunctionDeclaration = false;
    state.pendingBlock = false;
    return start + 1;
  }

  markOperatorContext(state);
  return start + 1;
}

function initializeDelimiterState(open: Delimiter): LexicalState {
  const state = createLexicalState();
  state.lastToken = 'open';
  state.canStartRegex = true;
  if (open === '(') state.parenStack.push({ kind: 'normal', functionDeclaration: false });
  if (open === '{') state.braceStack.push({ canStartRegexAfterClose: false });
  if (open === '[') state.bracketDepth = 1;
  return state;
}

/** Match delimiters while skipping only lexical content and context-confirmed regex literals. */
function findMatchingDelimiter(
  source: string,
  openIndex: number,
  open: Delimiter,
): number {
  const state = initializeDelimiterState(open);
  const delimiters: Delimiter[] = [open];
  let i = openIndex + 1;

  while (i < source.length) {
    if (/\s/.test(source[i] ?? '')) {
      i++;
      continue;
    }

    const lexicalEnd = skipLexicalContent(source, i);
    if (lexicalEnd !== null) {
      if (!isCommentStart(source, i)) markValueContext(state);
      i = lexicalEnd;
      continue;
    }

    if (isRegexLiteralStart(source, i, state)) {
      markValueContext(state);
      i = skipRegexLiteral(source, i);
      continue;
    }

    const ch = source[i];
    const end = consumeScannerToken(source, i, state);
    if (isOpeningDelimiter(ch)) {
      delimiters.push(ch);
    } else if (isClosingDelimiter(ch)) {
      const current = delimiters[delimiters.length - 1];
      if (current === undefined || !matchesClose(current, ch)) return -1;
      delimiters.pop();
      if (delimiters.length === 0) return i;
    }
    i = end;
  }

  return -1;
}

function collectDirectObjectKeys(source: string, openIndex: number, closeIndex: number): Set<string> {
  const keys = new Set<string>();
  const state = initializeDelimiterState('{');
  const delimiters: Delimiter[] = ['{'];
  let propertyExpected = true;
  let i = openIndex + 1;

  while (i < closeIndex) {
    if (/\s/.test(source[i] ?? '')) {
      i++;
      continue;
    }

    const atObjectLevel = delimiters.length === 1;
    const ch = source[i];
    if (atObjectLevel && propertyExpected && isIdentifierStart(ch)) {
      const end = readIdentifierEnd(source, i);
      const afterKey = skipWhitespaceAndComments(source, end);
      if (source[afterKey] === ':') keys.add(source.slice(i, end));
      propertyExpected = false;
      i = consumeScannerToken(source, i, state);
      continue;
    }

    if (atObjectLevel && propertyExpected && (ch === '"' || ch === "'")) {
      const literal = readStringLiteral(source, i);
      if (literal === null) return keys;
      const afterKey = skipWhitespaceAndComments(source, literal.end);
      if (source[afterKey] === ':') keys.add(literal.value);
      propertyExpected = false;
      markValueContext(state);
      i = literal.end;
      continue;
    }

    const lexicalEnd = skipLexicalContent(source, i);
    if (lexicalEnd !== null) {
      if (!isCommentStart(source, i)) markValueContext(state);
      i = lexicalEnd;
      continue;
    }

    if (isRegexLiteralStart(source, i, state)) {
      markValueContext(state);
      i = skipRegexLiteral(source, i);
      continue;
    }

    if (atObjectLevel && propertyExpected && ch !== ',') propertyExpected = false;
    const end = consumeScannerToken(source, i, state);
    if (isOpeningDelimiter(ch)) {
      delimiters.push(ch);
    } else if (isClosingDelimiter(ch)) {
      const current = delimiters[delimiters.length - 1];
      if (current === undefined || !matchesClose(current, ch)) return keys;
      delimiters.pop();
    } else if (ch === ',' && delimiters.length === 1) {
      propertyExpected = true;
    }
    i = end;
  }
  return keys;
}

function isStandaloneSamplesStart(source: string, start: number): boolean {
  if (
    !source.startsWith('samples', start) ||
    isIdentifierPart(source[start - 1]) ||
    isIdentifierPart(source[start + 'samples'.length])
  ) {
    return false;
  }
  const openParen = skipWhitespaceAndComments(source, start + 'samples'.length);
  return source[openParen] === '(';
}

const ASI_CONTINUATION_WORDS = new Set(['in', 'instanceof']);
const ASI_CONTINUATION_STARTS = new Set(['.', '(', '[', '`', '+', '-', '*', '/', '%', '&', '|', '^', '?', ':', '=', '<', '>', '!', '~', ',']);

function isAsiContinuation(source: string, start: number): boolean {
  if (ASI_CONTINUATION_STARTS.has(source[start] ?? '')) return true;
  if (!isIdentifierStart(source[start])) return false;
  const end = readIdentifierEnd(source, start);
  return ASI_CONTINUATION_WORDS.has(source.slice(start, end));
}

function parseStandaloneSamplesCall(
  source: string,
  sampleStart: number,
): { closeIndex: number; keys: Set<string>; end: number } | null {
  const openParen = skipWhitespaceAndComments(source, sampleStart + 'samples'.length);
  if (source[openParen] !== '(') return null;

  const firstArg = skipWhitespaceAndComments(source, openParen + 1);
  if (source[firstArg] !== '{') return null;

  const closeIndex = findMatchingDelimiter(source, firstArg, '{');
  const callEnd = findMatchingDelimiter(source, openParen, '(');
  if (closeIndex === -1 || callEnd === -1 || closeIndex >= callEnd) return null;

  const afterObject = skipWhitespaceAndComments(source, closeIndex + 1);
  if (source[afterObject] !== ',' && source[afterObject] !== ')') return null;

  const afterCall = skipWhitespaceAndComments(source, callEnd + 1);
  const hasLineTerminator = /[\r\n]/.test(source.slice(callEnd + 1, afterCall));
  if (
    afterCall !== source.length &&
    source[afterCall] !== ';' &&
    (!hasLineTerminator || !isIdentifierStart(source[afterCall]) || isAsiContinuation(source, afterCall))
  ) {
    return null;
  }

  return {
    closeIndex,
    keys: collectDirectObjectKeys(source, firstArg, closeIndex),
    end: source[afterCall] === ';' ? afterCall + 1 : callEnd + 1,
  };
}

interface ProgramToken {
  value: string;
  lineBreakBefore: boolean;
}

function tokenizeProgram(source: string): ProgramToken[] {
  const tokens: ProgramToken[] = [];
  const state = createLexicalState();
  let i = 0;
  let lineBreakBefore = false;

  while (i < source.length) {
    if (/\s/.test(source[i] ?? '')) {
      if (/[\r\n]/.test(source[i] ?? '')) lineBreakBefore = true;
      i++;
      continue;
    }

    const lexicalEnd = skipLexicalContent(source, i);
    if (lexicalEnd !== null) {
      if (/[\r\n]/.test(source.slice(i, lexicalEnd))) lineBreakBefore = true;
      if (!isCommentStart(source, i)) markValueContext(state);
      i = lexicalEnd;
      continue;
    }

    if (isRegexLiteralStart(source, i, state)) {
      if (/[\r\n]/.test(source.slice(i, skipRegexLiteral(source, i)))) lineBreakBefore = true;
      i = skipRegexLiteral(source, i);
      markValueContext(state);
      continue;
    }

    const end = consumeScannerToken(source, i, state);
    tokens.push({ value: source.slice(i, end), lineBreakBefore });
    lineBreakBefore = false;
    i = end;
  }

  return tokens;
}

function findMatchingToken(tokens: readonly ProgramToken[], openIndex: number): number {
  const open = tokens[openIndex]?.value;
  if (!isOpeningDelimiter(open)) return -1;

  const delimiters: Delimiter[] = [open];
  for (let i = openIndex + 1; i < tokens.length; i++) {
    const value = tokens[i]?.value;
    if (isOpeningDelimiter(value)) {
      delimiters.push(value);
      continue;
    }
    if (!isClosingDelimiter(value)) continue;
    const current = delimiters[delimiters.length - 1];
    if (current === undefined || !matchesClose(current, value)) return -1;
    delimiters.pop();
    if (delimiters.length === 0) return i;
  }
  return -1;
}

function findOpeningToken(tokens: readonly ProgramToken[], closeIndex: number): number {
  const close = tokens[closeIndex]?.value;
  if (!isClosingDelimiter(close)) return -1;

  const delimiters: Array<')' | ']' | '}'> = [];
  for (let i = closeIndex; i >= 0; i--) {
    const value = tokens[i]?.value;
    if (isClosingDelimiter(value)) {
      delimiters.push(value);
      continue;
    }
    if (!isOpeningDelimiter(value)) continue;
    const expectedClose = matchingClose(value) as ')' | ']' | '}';
    if (delimiters[delimiters.length - 1] !== expectedClose) return -1;
    delimiters.pop();
    if (delimiters.length === 0) return i;
  }
  return -1;
}

function rangeContainsSamples(tokens: readonly ProgramToken[], start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    if (tokens[i]?.value === 'samples') return true;
  }
  return false;
}

function variableDeclarationBindsSamples(tokens: readonly ProgramToken[], start: number): boolean {
  const delimiters: Delimiter[] = [];
  let inInitializer = false;

  for (let i = start; i < tokens.length; i++) {
    const value = tokens[i]?.value;

    if (inInitializer) {
      if (isOpeningDelimiter(value)) {
        delimiters.push(value);
      } else if (isClosingDelimiter(value)) {
        const current = delimiters[delimiters.length - 1];
        if (current === undefined || !matchesClose(current, value)) return false;
        delimiters.pop();
      } else if (delimiters.length === 0 && value === ',') {
        inInitializer = false;
      } else if (delimiters.length === 0 && value === ';') {
        return false;
      }
      continue;
    }

    if (delimiters.length === 0 && value === ';') return false;
    if (delimiters.length === 0 && value === ',') continue;
    if (delimiters.length === 0 && value === '=') {
      inInitializer = true;
      continue;
    }

    if (delimiters.length === 0 && isOpeningDelimiter(value)) {
      const close = findMatchingToken(tokens, i);
      if (close !== -1 && tokens[close + 1]?.value === '=') {
        if (destructuringPatternBindsSamples(tokens, i, close)) return true;
        i = close;
        continue;
      }
    }

    if (value === 'samples') return true;

    if (isOpeningDelimiter(value)) {
      delimiters.push(value);
    } else if (isClosingDelimiter(value)) {
      const current = delimiters[delimiters.length - 1];
      if (current === undefined || !matchesClose(current, value)) return false;
      delimiters.pop();
    }
  }

  return false;
}

function namedImportBindsSamples(tokens: readonly ProgramToken[], start: number, end: number): boolean {
  let i = start;
  while (i < end) {
    if (tokens[i]?.value === ',') {
      i++;
      continue;
    }
    if (tokens[i]?.value === 'type') i++;

    const imported = tokens[i]?.value;
    if (imported === undefined) return false;
    if (tokens[i + 1]?.value === 'as') {
      if (tokens[i + 2]?.value === 'samples') return true;
      i += 3;
    } else {
      if (imported === 'samples') return true;
      i++;
    }

    while (i < end && tokens[i]?.value !== ',') i++;
  }
  return false;
}

function importBindsSamples(tokens: readonly ProgramToken[], importIndex: number): boolean {
  let i = importIndex + 1;
  if (tokens[i]?.value === '(') return false;

  if (tokens[i]?.value === 'type') i++;
  if (tokens[i]?.value === 'samples') return true;

  while (i < tokens.length) {
    const value = tokens[i]?.value;
    if (value === ';' || value === 'from') return false;
    if (value === '*') {
      if (tokens[i + 1]?.value === 'as' && tokens[i + 2]?.value === 'samples') return true;
      i += 1;
      continue;
    }
    if (value === '{') {
      const close = findMatchingToken(tokens, i);
      if (close === -1) return true;
      return namedImportBindsSamples(tokens, i + 1, close);
    }
    i++;
  }
  return false;
}

function functionBindsSamples(tokens: readonly ProgramToken[], functionIndex: number): boolean {
  let i = functionIndex + 1;
  if (tokens[i]?.value === '*') i++;
  if (tokens[i]?.value === 'samples') return true;
  if (tokens[i]?.value !== '(') i++;
  if (tokens[i]?.value !== '(') return false;

  const close = findMatchingToken(tokens, i);
  return close !== -1 && rangeContainsSamples(tokens, i + 1, close);
}

const ASSIGNMENT_OPERATOR_PARTS: readonly (readonly string[])[] = [
  ['>', '>', '>', '='],
  ['&', '&', '='],
  ['|', '|', '='],
  ['?', '?', '='],
  ['*', '*', '='],
  ['<', '<', '='],
  ['>', '>', '='],
  ['+', '='],
  ['-', '='],
  ['*', '='],
  ['/', '='],
  ['%', '='],
  ['&', '='],
  ['^', '='],
  ['|', '='],
  ['='],
];

function isAssignmentOperatorAt(tokens: readonly ProgramToken[], index: number): boolean {
  for (const parts of ASSIGNMENT_OPERATOR_PARTS) {
    if (parts.every((part, offset) => tokens[index + offset]?.value === part)) {
      if (parts.length === 1 && tokens[index + 1]?.value === '=') continue;
      return true;
    }
  }
  return false;
}

function isDestructuringPatternStart(tokens: readonly ProgramToken[], openIndex: number): boolean {
  const open = tokens[openIndex]?.value;
  const previous = tokens[openIndex - 1]?.value;
  if (open === '[' && previous === ')') {
    const conditionOpen = findOpeningToken(tokens, openIndex - 1);
    const controlWord = conditionOpen > 0 ? tokens[conditionOpen - 1]?.value : undefined;
    return CONTROL_FLOW_WORDS.has(controlWord ?? '');
  }
  return previous === undefined || [
    '(', '=', ';', ',', ':', '=>', 'return', 'yield',
  ].includes(previous);
}

function spreadTokenLengthAt(tokens: readonly ProgramToken[], index: number): number {
  if (tokens[index]?.value === '...') return 1;
  if (
    tokens[index]?.value === '.' &&
    tokens[index + 1]?.value === '.' &&
    tokens[index + 2]?.value === '.'
  ) {
    return 3;
  }
  return 0;
}

function findPatternEntryEnd(
  tokens: readonly ProgramToken[],
  start: number,
  closeIndex: number,
): number {
  let i = start;
  while (i < closeIndex) {
    const value = tokens[i]?.value;
    if (isOpeningDelimiter(value)) {
      const nestedClose = findMatchingToken(tokens, i);
      if (nestedClose === -1 || nestedClose >= closeIndex) return closeIndex;
      i = nestedClose + 1;
      continue;
    }
    if (value === ',') return i;
    i++;
  }
  return closeIndex;
}

function findTopLevelPatternToken(
  tokens: readonly ProgramToken[],
  start: number,
  end: number,
  target: string,
): number {
  let i = start;
  while (i < end) {
    const value = tokens[i]?.value;
    if (isOpeningDelimiter(value)) {
      const nestedClose = findMatchingToken(tokens, i);
      if (nestedClose === -1 || nestedClose >= end) return -1;
      i = nestedClose + 1;
      continue;
    }
    if (value === target) return i;
    i++;
  }
  return -1;
}

function bindingTargetBindsSamples(
  tokens: readonly ProgramToken[],
  start: number,
  end: number,
): boolean {
  const spreadLength = spreadTokenLengthAt(tokens, start);
  if (spreadLength > 0) start += spreadLength;
  if (start >= end) return false;

  const open = tokens[start]?.value;
  if (isOpeningDelimiter(open)) {
    const close = findMatchingToken(tokens, start);
    return close === end - 1 && destructuringPatternBindsSamples(tokens, start, close);
  }

  return end === start + 1 && tokens[start]?.value === 'samples';
}

function destructuringPatternBindsSamples(
  tokens: readonly ProgramToken[],
  openIndex: number,
  closeIndex: number,
): boolean {
  const open = tokens[openIndex]?.value;
  let i = openIndex + 1;

  while (i < closeIndex) {
    if (tokens[i]?.value === ',') {
      i++;
      continue;
    }

    const entryEnd = findPatternEntryEnd(tokens, i, closeIndex);
    const spreadLength = spreadTokenLengthAt(tokens, i);
    if (spreadLength > 0) {
      if (bindingTargetBindsSamples(tokens, i + spreadLength, entryEnd)) return true;
    } else if (open === '{') {
      const colon = findTopLevelPatternToken(tokens, i, entryEnd, ':');
      const targetStart = colon === -1 ? i : colon + 1;
      const targetEnd = findTopLevelPatternToken(tokens, targetStart, entryEnd, '=');
      if (bindingTargetBindsSamples(tokens, targetStart, targetEnd === -1 ? entryEnd : targetEnd)) {
        return true;
      }
    } else if (open === '[') {
      const targetEnd = findTopLevelPatternToken(tokens, i, entryEnd, '=');
      if (bindingTargetBindsSamples(tokens, i, targetEnd === -1 ? entryEnd : targetEnd)) {
        return true;
      }
    }

    i = entryEnd + 1;
  }
  return false;
}

function isRootGlobalSamplesMember(tokens: readonly ProgramToken[], sampleIndex: number): boolean {
  if (tokens[sampleIndex - 1]?.value !== '.') return false;
  if (!['globalThis', 'self', 'window'].includes(tokens[sampleIndex - 2]?.value ?? '')) {
    return false;
  }

  return !['.', ')', ']', '}'].includes(tokens[sampleIndex - 3]?.value ?? '');
}

function hasSamplesWrite(tokens: readonly ProgramToken[]): boolean {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]?.value !== 'samples') continue;

    const previous = tokens[i - 1]?.value;
    const isGlobalMember = isRootGlobalSamplesMember(tokens, i);
    if (previous !== '.' || isGlobalMember) {
      if (
        isAssignmentOperatorAt(tokens, i + 1) ||
        tokens[i + 1]?.value === '++' ||
        tokens[i + 1]?.value === '--' ||
        tokens[i - 1]?.value === '++' ||
        tokens[i - 1]?.value === '--' ||
        (isGlobalMember && (
          tokens[i - 3]?.value === '++' ||
          tokens[i - 3]?.value === '--'
        ))
      ) {
        return true;
      }
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    if (!isAssignmentOperatorAt(tokens, i)) continue;
    const closeIndex = i - 1;
    const close = tokens[closeIndex]?.value;
    if (close !== '}' && close !== ']') continue;
    const openIndex = findOpeningToken(tokens, closeIndex);
    if (
      openIndex !== -1 &&
      isDestructuringPatternStart(tokens, openIndex) &&
      destructuringPatternBindsSamples(tokens, openIndex, closeIndex)
    ) {
      return true;
    }
  }

  return false;
}

function hasSamplesBinding(code: string): boolean {
  const tokens = tokenizeProgram(code);
  if (hasSamplesWrite(tokens)) return true;
  const declarationWords = new Set(['const', 'let', 'var']);

  for (let i = 0; i < tokens.length; i++) {
    const value = tokens[i]?.value;
    if (declarationWords.has(value ?? '') && variableDeclarationBindsSamples(tokens, i + 1)) {
      return true;
    }
    if (value === 'function' && functionBindsSamples(tokens, i)) return true;
    if (value === 'class' && tokens[i + 1]?.value === 'samples') return true;
    if (value === 'import' && importBindsSamples(tokens, i)) return true;

    if (value === 'catch' && tokens[i + 1]?.value === '(') {
      const close = findMatchingToken(tokens, i + 1);
      if (close !== -1 && rangeContainsSamples(tokens, i + 2, close)) return true;
    }

    if (value === '=>') {
      if (tokens[i - 1]?.value === 'samples') return true;
      if (tokens[i - 1]?.value === ')') {
        const open = findOpeningToken(tokens, i - 1);
        if (open !== -1 && rangeContainsSamples(tokens, open + 1, i - 1)) return true;
      }
    }
  }
  return false;
}

function findDeclaredSamples(code: string): Set<string> {
  if (hasSamplesBinding(code)) return new Set();

  const declared = new Set<string>();
  const state = createLexicalState();
  let i = 0;
  let statementStart = true;

  while (i < code.length) {
    if (/\s/.test(code[i] ?? '')) {
      i++;
      continue;
    }

    const skipped = skipLexicalContent(code, i);
    if (skipped !== null) {
      const isComment = isCommentStart(code, i);
      i = skipped;
      if (!isComment) {
        markValueContext(state);
        statementStart = false;
      }
      continue;
    }

    if (isRegexLiteralStart(code, i, state)) {
      i = skipRegexLiteral(code, i);
      markValueContext(state);
      statementStart = false;
      continue;
    }

    if (
      statementStart &&
      state.braceStack.length === 0 &&
      state.bracketDepth === 0 &&
      state.parenStack.length === 0 &&
      isStandaloneSamplesStart(code, i)
    ) {
      const registration = parseStandaloneSamplesCall(code, i);
      if (registration !== null) {
        for (const key of registration.keys) declared.add(key);
        i = registration.end;
        markValueContext(state);
        statementStart = true;
        continue;
      }
    }

    const ch = code[i];
    const end = consumeScannerToken(code, i, state);
    if (ch === ';') {
      statementStart =
        state.braceStack.length === 0 &&
        state.bracketDepth === 0 &&
        state.parenStack.length === 0;
    } else {
      statementStart = false;
    }
    i = end;
  }
  return declared;
}

export function findUnknownSamples(code: string): string[] {
  const unknown: string[] = [];
  const declaredSamples = findDeclaredSamples(code);
  const allowedSamples = new Set(SAMPLE_ALLOWLIST);
  for (const sample of declaredSamples) allowedSamples.add(sample);
  const seenUnknown = new Set<string>();
  // Match both standalone s("...") and method-chained .s("...") patterns.
  const sampleArgRe = /\bs\s*\(\s*(?:"([^"]*)"|'([^']*)')\s*\)|\bsound\s*\(\s*(?:"([^"]*)"|'([^']*)')\s*\)/g;

  // Extract .bank("...") value if present anywhere in the code chunk
  const bankMatch = code.match(/\.bank\s*\(\s*["']([^"']+)["']\s*\)/);
  const bankName = bankMatch ? bankMatch[1] : null;

  let m: RegExpExecArray | null;
  while ((m = sampleArgRe.exec(code)) !== null) {
    const content = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (!content) continue;
    const tokens = content
      .replace(/[<>[\]{}]/g, ' ')   // brackets → spaces
      .replace(/\(\d+,\d+\)/g, '')  // (N,M) euclidean
      .replace(/,/g, ' ')           // , simultaneous-pattern separator → spaces
      .replace(/:\d+/g, '')         // :N index suffix
      .replace(/[*!@?][\d.]*/g, '') // *N !N @N modifiers
      .replace(/\/(?:\d+(?:\.\d+)?|\.\d+)(?![A-Za-z0-9_$.])/g, '') // /N, /N.N, /.N rate modifiers
      .split(/\s+/)
      .filter((t) => t.length > 0 && t !== '~' && t !== '-');
    for (const token of tokens) {
      if (!allowedSamples.has(token) && !BUILTIN_SYNTHS.has(token)) {
        if (!seenUnknown.has(token)) {
          seenUnknown.add(token);
          unknown.push(token);
        }
      } else if (bankName && !token.includes('_')) {
        // Token is a bare suffix used with .bank() — verify it's a valid bank suffix
        // e.g. s("rs").bank("RolandTR808") should fail because TR808 has "rim" not "rs"
        const bankSample = `${bankName}_${token}`;
        if (SAMPLE_ALLOWLIST.has(token) && !VALID_BANK_SUFFIXES.has(token) && !SAMPLE_ALLOWLIST.has(bankSample)) {
          if (!seenUnknown.has(bankSample)) {
            seenUnknown.add(bankSample);
            unknown.push(bankSample);
          }
        }
      }
    }
  }
  return unknown;
}
