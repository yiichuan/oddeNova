// Auto-derived from:
//   sample_library/strudel.md          — Dirt-Samples (## headers)
//   sample_library/tidal-drum-machines.md — drum machine packs (## headers)
// Plus melodic samples listed in the agent system prompt.

const DIRT_SAMPLES: readonly string[] = [
  '808bd', '808cy', '808hc', '808ht', '808lc', '808lt', '808mc', '808mt', '808oh', '808sd',
  'ab', 'ade', 'ades2', 'ades3', 'ades4', 'alex', 'alphabet', 'amencutup', 'armora', 'arp', 'arpy',
  'auto', 'baa', 'baa2', 'bass', 'bass0', 'bass1', 'bass2', 'bass3', 'bassdm', 'bassfoo', 'battles',
  'bd', 'bend', 'bev', 'bin', 'birds', 'birds3', 'bleep', 'blip', 'blue', 'bottle',
  'breaks125', 'breaks152', 'breaks157', 'breaks165', 'breath', 'bubble',
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
  'made', 'made2', 'mash', 'mash2', 'metal', 'miniyeah', 'monsterb', 'moog', 'mouth', 'mp3',
  'msg', 'mt', 'mute',
  'newnotes', 'noise', 'noise2', 'notes', 'numbers', 'num',
  'oc', 'odx', 'off', 'outdoor',
  'pad', 'padlong', 'pebbles', 'perc', 'peri', 'pluck', 'popkick', 'print', 'proc', 'procshort', 'psr',
  'rave', 'rave2', 'ravemono', 'realclaps', 'reverbkick', 'rm', 'rs',
  'sax', 'sd', 'seawolf', 'sequential', 'sf', 'sheffield', 'short', 'sid', 'simplesine', 'sitar',
  'sn', 'space', 'speakspell', 'speech', 'speechless', 'speedupdown', 'stab', 'stomp', 'subroc3d',
  'sugar', 'sundance',
  'tabla', 'tabla2', 'tablex', 'tacscan', 'tech', 'techno', 'tink', 'tok', 'toys', 'trump',
  'ul', 'ulgab', 'uxay',
  'v', 'voodoo',
  'wind', 'wobble', 'world',
  'xmas',
  'yeah',
];

// Melodic samples explicitly listed in the agent system prompt.
const MELODIC_SAMPLES: readonly string[] = [
  'piano', 'arpy', 'bass', 'moog', 'juno', 'sax', 'gtr', 'pluck', 'sitar', 'stab',
];

// General MIDI soundfont instruments — exact names from strudel's gm.mjs.
// Loaded via registerSoundfonts() in prebake (src/services/strudel.ts).
// Use with note() or n().scale() + .s("gm_...").
// Source: https://codeberg.org/uzu/strudel/raw/branch/main/packages/soundfonts/gm.mjs
const GM_INSTRUMENTS: readonly string[] = [
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
  // MIDI-standard name aliases (strudel uses shorter names; these are accepted
  // so validate() doesn't reject LLM-generated code that uses standard names)
  'gm_acoustic_grand_piano', 'gm_bright_acoustic_piano', 'gm_electric_grand_piano',
  'gm_honky_tonk_piano', 'gm_honky_tonk',
  'gm_electric_piano_1', 'gm_electric_piano_2',
  'gm_pad_1_new_age', 'gm_pad_2_warm', 'gm_pad_3_polysynth', 'gm_pad_4_choir',
  'gm_pad_5_bowed', 'gm_pad_6_metallic', 'gm_pad_7_halo', 'gm_pad_8_sweep',
  'gm_lead_square', 'gm_lead_sawtooth', 'gm_lead_calliope', 'gm_lead_chiff',
  'gm_lead_charang', 'gm_lead_voice', 'gm_lead_fifths', 'gm_lead_bass_lead',
];

// Drum machine packs from tidal-drum-machines.md.
const DRUM_MACHINE_SAMPLES: readonly string[] = [
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

export const SAMPLE_ALLOWLIST: Set<string> = new Set([
  ...DIRT_SAMPLES,
  ...MELODIC_SAMPLES,
  ...DRUM_MACHINE_SAMPLES,
  ...GM_INSTRUMENTS,
]);

// Strudel built-in synth oscillator names — these are valid in s("...") but are
// NOT sample files, so they are intentionally excluded from SAMPLE_ALLOWLIST and
// handled separately in the validator.
export const BUILTIN_SYNTHS: Set<string> = new Set([
  'sawtooth', 'sine', 'square', 'triangle', 'supersaw',
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

export function findUnknownSamples(code: string): string[] {
  const unknown: string[] = [];
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
      .replace(/:\d+/g, '')         // :N index suffix
      .replace(/[*!@?][\d.]*/g, '') // *N !N @N ? modifiers
      .split(/\s+/)
      .filter((t) => t.length > 0 && t !== '~');
    for (const token of tokens) {
      if (!SAMPLE_ALLOWLIST.has(token) && !BUILTIN_SYNTHS.has(token)) {
        unknown.push(token);
      } else if (bankName && !token.includes('_')) {
        // Token is a bare suffix used with .bank() — verify it's a valid bank suffix
        // e.g. s("rs").bank("RolandTR808") should fail because TR808 has "rim" not "rs"
        const bankSample = `${bankName}_${token}`;
        if (SAMPLE_ALLOWLIST.has(token) && !VALID_BANK_SUFFIXES.has(token) && !SAMPLE_ALLOWLIST.has(bankSample)) {
          unknown.push(bankSample);
        }
      }
    }
  }
  return unknown;
}
