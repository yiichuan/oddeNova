/**
 * 试听 — every sound the studio can play, sorted for a person to browse.
 *
 * The allowlist (sample-allowlist.ts) answers "is this name legal?" and is
 * grouped by where a sound was downloaded from. That is the wrong shelf for a
 * listener: a kick drum lives in three different libraries, and a library
 * called "Dirt-Samples" says nothing about what is in it. So this module
 * re-shelves the same names by what they sound like — drums by the part of
 * the kit they are, melodic sounds by instrument family, everything else by
 * the job it does in a track.
 *
 * Names come only from the allowlist's own lists, so nothing here can offer a
 * sound validate() would reject. Spelling variants of one sound (the GM
 * MIDI-standard aliases, the drum machines' short bank names, the synth
 * waveforms' three-letter forms) are left out: they play the same thing as the
 * canonical name already on the page. Anything in a source list that the hand
 * sorting below does not mention still shows up, in a "more" group at the end
 * of its category, so a sample added to the allowlist is never silently
 * missing here. The catalog test holds both of those promises.
 */
import {
  BUILTIN_SYNTHS,
  DIRT_SAMPLES,
  DRUM_MACHINE_SAMPLES,
  GM_INSTRUMENTS,
  MELODIC_SAMPLES,
  MRIDANGAM_SAMPLES,
  VCSL_SAMPLES,
} from './sample-allowlist';

/** A string in both of the app's languages: [中文, English]. */
export type Bilingual = readonly [string, string];

export interface SampleEntry {
  /** What goes in s("…"). */
  name: string;
  /** A short gloss when the name alone does not say what it is (e.g. bd → 底鼓). */
  label?: Bilingual;
}

export interface SampleGroup {
  id: string;
  title: Bilingual;
  /** A second line under the title, for groups whose title is an abbreviation. */
  subtitle?: string;
  /**
   * The pitch a pitched sound is auditioned at. Only read for sounds that take
   * one (soundfonts, synths, multi-pitch samples); a drum hit plays as recorded.
   */
  note?: string;
  samples: SampleEntry[];
}

export interface SampleCategory {
  id: string;
  title: Bilingual;
  /** One line on what is in it and how to call it from code. */
  blurb: Bilingual;
  groups: SampleGroup[];
}

/* ── Drum parts ────────────────────────────────────────────────────────── */

/* What each part of a kit is called, shared by the drum machines (where it is
   the suffix after the bank name) and the loose kit pieces. Also the order a
   machine's parts are laid out in: the backbone first, then the kit around it. */
const DRUM_PARTS: ReadonlyArray<readonly [string, Bilingual]> = [
  ['bd', ['底鼓', 'Kick']],
  ['sd', ['军鼓', 'Snare']],
  ['rim', ['鼓边', 'Rimshot']],
  ['cp', ['拍手', 'Clap']],
  ['hh', ['闭镲', 'Closed hat']],
  ['oh', ['开镲', 'Open hat']],
  ['cr', ['吊镲', 'Crash']],
  ['rd', ['叮叮镲', 'Ride']],
  ['lt', ['低嗵鼓', 'Low tom']],
  ['mt', ['中嗵鼓', 'Mid tom']],
  ['ht', ['高嗵鼓', 'High tom']],
  ['cb', ['牛铃', 'Cowbell']],
  ['tb', ['铃鼓', 'Tambourine']],
  ['sh', ['沙锤', 'Shaker']],
  ['perc', ['打击乐', 'Percussion']],
  ['misc', ['杂项', 'Misc']],
  ['fx', ['音效', 'FX']],
];
const DRUM_PART_LABEL = new Map(DRUM_PARTS);
const DRUM_PART_ORDER = new Map(DRUM_PARTS.map(([part], i) => [part, i]));

/* The tidal-drum-machines short bank names (aliasBank), shown under each
   machine so the shorter spelling people see in examples is recognisable. */
const DRUM_MACHINE_SHORT_NAMES: Readonly<Record<string, string>> = {
  AJKPercusyn: 'Percysyn', AkaiLinn: 'Linn', AkaiMPC60: 'MPC60', AkaiXR10: 'XR10',
  AlesisHR16: 'HR16', AlesisSR16: 'SR16', BossDR110: 'DR110', BossDR220: 'DR220',
  BossDR55: 'DR55', BossDR550: 'DR550', CasioRZ1: 'RZ1', CasioSK1: 'SK1', CasioVL1: 'VL1',
  DoepferMS404: 'MS404', EmuDrumulator: 'Drumulator', EmuSP12: 'SP12',
  KorgDDM110: 'DDM110', KorgKPR77: 'KPR77', KorgKR55: 'KR55', KorgKRZ: 'KRZ', KorgM1: 'M1',
  KorgMinipops: 'Minipops', KorgPoly800: 'Poly800', KorgT3: 'T3', Linn9000: '9000',
  LinnLM1: 'LM1', LinnLM2: 'LM2', MoogConcertMateMG1: 'ConcertMateMG1', OberheimDMX: 'DMX',
  RhodesPolaris: 'Polaris', RhythmAce: 'Ace', RolandCompurhythm1000: 'Compurhythm1000',
  RolandCompurhythm78: 'Compurhythm78', RolandCompurhythm8000: 'Compurhythm8000',
  RolandD110: 'D110', RolandD70: 'D70', RolandDDR30: 'DDR30', RolandJD990: 'JD990',
  RolandMC202: 'MC202', RolandMC303: 'MC303', RolandMT32: 'MT32', RolandR8: 'R8',
  RolandS50: 'S50', RolandSH09: 'SH09', RolandSystem100: 'System100', RolandTR505: 'TR505',
  RolandTR606: 'TR606', RolandTR626: 'TR626', RolandTR707: 'TR707', RolandTR727: 'TR727',
  RolandTR808: 'TR808', RolandTR909: 'TR909', SakataDPM48: 'DPM48',
  SequentialCircuitsDrumtracks: 'CircuitsDrumtracks', SequentialCircuitsTom: 'CircuitsTom',
  SimmonsSDS400: 'SDS400', SimmonsSDS5: 'SDS5', SoundmastersR88: 'R88',
  UnivoxMicroRhythmer12: 'MicroRhythmer12', ViscoSpaceDrum: 'SpaceDrum',
  XdrumLM8953: 'LM8953', YamahaRM50: 'RM50', YamahaRX21: 'RX21', YamahaRX5: 'RX5',
  YamahaRY30: 'RY30', YamahaTG33: 'TG33',
};

function drumMachineGroups(): SampleGroup[] {
  const byMachine = new Map<string, SampleEntry[]>();
  for (const name of DRUM_MACHINE_SAMPLES) {
    const cut = name.lastIndexOf('_');
    const machine = name.slice(0, cut);
    const part = name.slice(cut + 1);
    const entries = byMachine.get(machine) ?? [];
    entries.push({ name, label: DRUM_PART_LABEL.get(part) });
    byMachine.set(machine, entries);
  }
  const partRank = (name: string) =>
    DRUM_PART_ORDER.get(name.slice(name.lastIndexOf('_') + 1)) ?? DRUM_PARTS.length;
  return [...byMachine].map(([machine, samples]) => ({
    id: `machine-${machine}`,
    title: [machine, machine],
    subtitle: DRUM_MACHINE_SHORT_NAMES[machine],
    samples: [...samples].sort((a, b) => partRank(a.name) - partRank(b.name)),
  }));
}

/* ── General MIDI ──────────────────────────────────────────────────────── */

/* GM_INSTRUMENTS is laid out in General MIDI's own family order: eight
   programs to a family, except piano, where four of the eight share one name
   (gm_piano) and leave five. */
const GM_FAMILIES: ReadonlyArray<{ id: string; title: Bilingual; size: number; note?: string }> = [
  { id: 'piano', title: ['钢琴', 'Piano'], size: 5 },
  { id: 'chromatic', title: ['有音高打击乐', 'Chromatic percussion'], size: 8 },
  { id: 'organ', title: ['风琴', 'Organ'], size: 8 },
  { id: 'guitar', title: ['吉他', 'Guitar'], size: 8, note: 'c3' },
  { id: 'bass', title: ['贝斯', 'Bass'], size: 8, note: 'c2' },
  { id: 'strings', title: ['弦乐', 'Strings'], size: 8 },
  { id: 'ensemble', title: ['合奏与人声', 'Ensemble'], size: 8 },
  { id: 'brass', title: ['铜管', 'Brass'], size: 8, note: 'c3' },
  { id: 'reed', title: ['簧管', 'Reed'], size: 8 },
  { id: 'pipe', title: ['吹管', 'Pipe'], size: 8, note: 'c5' },
  { id: 'lead', title: ['合成主音', 'Synth lead'], size: 8 },
  { id: 'pad', title: ['合成铺底', 'Synth pad'], size: 8 },
  { id: 'synth-fx', title: ['合成音效', 'Synth effects'], size: 8 },
  { id: 'ethnic', title: ['民族乐器', 'Ethnic'], size: 8 },
  { id: 'percussive', title: ['打击乐', 'Percussive'], size: 8 },
  { id: 'sound-fx', title: ['声音效果', 'Sound effects'], size: 8 },
];

function gmGroups(): SampleGroup[] {
  let start = 0;
  const groups = GM_FAMILIES.map(({ id, title, size, note }) => {
    const samples = GM_INSTRUMENTS.slice(start, start + size).map((name) => ({ name }));
    start += size;
    return { id: `gm-${id}`, title, note, samples };
  });
  /* Anything past the last family — the list grew without this table — still
     gets a shelf rather than vanishing. */
  const rest = GM_INSTRUMENTS.slice(start);
  if (rest.length > 0) {
    groups.push({ id: 'gm-more', title: ['更多 GM 音色', 'More GM'], note: undefined, samples: rest.map((name) => ({ name })) });
  }
  return groups;
}

/* ── Hand-sorted shelves ───────────────────────────────────────────────── */

interface GroupSpec {
  id: string;
  title: Bilingual;
  subtitle?: string;
  note?: string;
  names: readonly (string | SampleEntry)[];
}

/*
 * Every gloss below was written from what the files under that name actually
 * are (their names in public/sample-index/), not from the name itself — `hh`
 * looks like a hi-hat and is a whole kit, `cr` looks like a crash and is a
 * ride. Where the files are only numbered (`perc`, `stomp`, `dr`, `dr_few`,
 * `drum`, `techno`, `psr`, `hand`), the gloss comes from a rough analysis of
 * the audio — length, brightness, how much of it sits in the lows — and so
 * says what kind of hits they are rather than naming an instrument. `misc` is
 * from uzu-drumkit's own README.
 */
const KIT_GROUPS: GroupSpec[] = [
  {
    id: 'kick',
    title: ['底鼓', 'Kicks'],
    names: [
      { name: 'bd', label: ['909 底鼓', '909 kick'] },
      { name: '909', label: ['909 底鼓', '909 kick'] },
      { name: '808bd', label: ['808 底鼓', '808 kick'] },
      { name: 'clubkick', label: ['俱乐部底鼓', 'Club kick'] },
      { name: 'hardkick', label: ['失真底鼓', 'Distorted kick'] },
      { name: 'kicklinn', label: ['LinnDrum 底鼓', 'LinnDrum kick'] },
      { name: 'popkick', label: ['流行底鼓', 'Pop kick'] },
      { name: 'reverbkick', label: ['带混响底鼓', 'Reverb kick'] },
      { name: 'gabba', label: ['Gabber 失真底鼓', 'Gabber kick'] },
      { name: 'gabbaloud', label: ['Gabber 底鼓 · 更响', 'Gabber kick, louder'] },
      { name: 'gabbalouder', label: ['Gabber 底鼓 · 最响', 'Gabber kick, loudest'] },
      { name: 'bassdrum1', label: ['音乐会大鼓', 'Concert bass drum'] },
      { name: 'bassdrum2', label: ['音乐会大鼓 · 含滚奏', 'Concert bass drum, with rolls'] },
    ],
  },
  {
    id: 'snare',
    title: ['军鼓', 'Snares'],
    names: [
      { name: 'sd', label: ['Analog Rytm 军鼓', 'Analog Rytm snare'] },
      { name: 'sn', label: ['909 军鼓', '909 snare'] },
      { name: '808sd', label: ['808 军鼓', '808 snare'] },
      { name: 'snare_hi', label: ['绳调军鼓 · 高', 'Rope snare, high'] },
      { name: 'snare_low', label: ['绳调军鼓 · 低', 'Rope snare, low'] },
      { name: 'snare_modern', label: ['现代军鼓', 'Modern snare'] },
      { name: 'snare_rim', label: ['绳调军鼓 · 敲边', 'Rope snare, rim & stick'] },
    ],
  },
  {
    id: 'clap',
    title: ['拍手', 'Claps'],
    names: [
      { name: 'cp', label: ['909 拍手', '909 clap'] },
      { name: 'realclaps', label: ['真人拍手', 'Real claps'] },
      { name: 'clap', label: ['真人拍手 · 含单人', 'Real claps, incl. solo'] },
    ],
  },
  {
    id: 'hats',
    title: ['踩镲与镲片', 'Hats & cymbals'],
    names: [
      { name: 'hc', label: ['909 闭镲', '909 closed hat'] },
      { name: 'ho', label: ['909 开镲', '909 open hat'] },
      { name: 'oh', label: ['开镲', 'Open hat'] },
      { name: '808oh', label: ['808 开镲', '808 open hat'] },
      { name: 'linnhats', label: ['LinnDrum 踩镲', 'LinnDrum hats'] },
      { name: 'hihat', label: ['原声踩镲 · 闭/开', 'Acoustic hi-hat, closed & open'] },
      { name: 'cr', label: ['909 叮叮镲', '909 ride'] },
      { name: 'rd', label: ['叮叮镲', 'Ride'] },
      { name: '808cy', label: ['808 镲片', '808 cymbal'] },
      { name: 'sus_cymbal', label: ['悬挂镲 · 击/擦/渐强', 'Suspended cymbal'] },
      { name: 'sus_cymbal2', label: ['悬挂镲 2 · 击/擦/渐强', 'Suspended cymbal 2'] },
    ],
  },
  {
    id: 'toms',
    title: ['嗵鼓', 'Toms'],
    names: [
      { name: 'lt', label: ['909 低嗵鼓', '909 low tom'] },
      { name: 'mt', label: ['909 中嗵鼓', '909 mid tom'] },
      { name: 'ht', label: ['909 高嗵鼓', '909 high tom'] },
      { name: '808lt', label: ['808 低嗵鼓', '808 low tom'] },
      { name: '808mt', label: ['808 中嗵鼓', '808 mid tom'] },
      { name: '808ht', label: ['808 高嗵鼓', '808 high tom'] },
      { name: 'tom_mallet', label: ['高嗵鼓 · 软槌', 'High tom, mallet'] },
      { name: 'tom_stick', label: ['高嗵鼓 · 鼓棒', 'High tom, stick'] },
      { name: 'tom_rim', label: ['高嗵鼓 · 敲边', 'High tom, rim'] },
      { name: 'tom2_mallet', label: ['低嗵鼓 · 软槌', 'Low tom, mallet'] },
      { name: 'tom2_stick', label: ['低嗵鼓 · 鼓棒', 'Low tom, stick'] },
      { name: 'tom2_rim', label: ['低嗵鼓 · 敲边', 'Low tom, rim'] },
    ],
  },
  {
    id: 'kit-parts',
    title: ['鼓边与小件', 'Rims & extras'],
    names: [
      { name: 'rim', label: ['鼓边', 'Rimshot'] },
      { name: 'cb', label: ['牛铃', 'Cowbell'] },
      { name: 'tb', label: ['铃鼓', 'Tambourine'] },
      { name: 'sh', label: ['沙锤', 'Shaker'] },
      { name: 'perc', label: ['低频打击小件', 'Low percussive hits'] },
      { name: 'misc', label: ['模块合成器音效', 'Modular synth sounds'] },
      { name: 'stomp', label: ['跺脚 · 低沉闷击', 'Stomps, low thuds'] },
    ],
  },
  {
    id: 'kits',
    title: ['整套鼓组', 'Whole kits'],
    /* `hh` and `hh27` belong here despite their names: each is a whole kit
       of thirteen hits (kicks, snares, hats, crash, ride), not a hi-hat. */
    names: [
      { name: '808', label: ['808 小件 · 牛铃/响棒/沙锤等', '808 extras: cowbell, clave, maracas…'] },
      { name: 'hh', label: ['13 件套', '13-piece kit'] },
      { name: 'hh27', label: ['13 件套', '13-piece kit'] },
      { name: 'tech', label: ['13 件套', '13-piece kit'] },
      { name: 'electro1', label: ['电子 · 13 件套', 'Electro, 13-piece kit'] },
      { name: 'hardcore', label: ['硬核 · 12 件套', 'Hardcore, 12-piece kit'] },
      { name: 'house', label: ['House · 8 件套', 'House, 8-piece kit'] },
      { name: 'jazz', label: ['8 件套', '8-piece kit'] },
      { name: 'gretsch', label: ['Gretsch 原声爵士鼓 · 含鼓刷', 'Gretsch acoustic kit, with brushes'] },
      { name: 'drumtraks', label: ['Sequential DrumTraks 鼓机', 'Sequential DrumTraks'] },
      { name: 'sequential', label: ['Sequential Tom 鼓机', 'Sequential Tom'] },
      { name: 'odx', label: ['Oberheim DX 鼓机', 'Oberheim DX'] },
      { name: 'dr2', label: ['Boss DR-110 鼓机', 'Boss DR-110'] },
      { name: 'dr55', label: ['Boss DR-55 鼓机', 'Boss DR-55'] },
      { name: 'casio', label: ['Casio · 高/低/噪声', 'Casio: high, low, noise'] },
      { name: 'ifdrums', label: ['底鼓/踩镲/军鼓', 'Kick, hat, snare'] },
      { name: 'feel', label: ['底鼓/踩镲/军鼓/Sub', 'Kick, hats, snares, sub'] },
      { name: 'future', label: ['以底鼓为主', 'Mostly kicks'] },
      { name: 'drum', label: ['6 件 · 底鼓/军鼓/踩镲', '6 hits: kick, snare, hats'] },
      { name: 'techno', label: ['Techno · 底鼓/军鼓/踩镲等', 'Techno: kick, snare, hats…'] },
      { name: 'dr', label: ['42 种鼓件', '42 kit hits'] },
      { name: 'dr_few', label: ['以底鼓为主', 'Mostly kicks'] },
      { name: 'psr', label: ['30 种鼓件 · 含镲片', '30 kit hits, incl. cymbals'] },
    ],
  },
];

const PERCUSSION_GROUPS: GroupSpec[] = [
  {
    id: 'hand-drums',
    title: ['手鼓', 'Hand drums'],
    names: ['tabla', 'tabla2', 'tablex', 'bongo', 'conga',
      { name: '808lc', label: ['低康加', 'Low conga'] },
      { name: '808mc', label: ['中康加', 'Mid conga'] },
      { name: '808hc', label: ['高康加', 'High conga'] },
      'darbuka', 'framedrum', 'cajon', 'slitdrum',
      /* Shelved with the claps once, by its name. Its takes are mostly low,
         pitched hits, two of them ringing on for seconds: hands on a drum
         head, not hands together. */
      { name: 'hand', label: ['手击鼓面 · 多为低沉', 'Hand hits, mostly low'] }],
  },
  {
    id: 'mridangam',
    title: ['木丹加鼓', 'Mridangam'],
    names: MRIDANGAM_SAMPLES,
  },
  {
    id: 'timpani',
    title: ['定音鼓', 'Timpani'],
    names: ['timpani', 'timpani_roll', 'timpani2'],
  },
  {
    id: 'shakers',
    title: ['摇奏与刮奏', 'Shakers & scrapers'],
    names: ['shaker_large', 'shaker_small', 'cabasa', 'guiro', 'ratchet', 'sleighbells',
      'tambourine', 'tambourine2', 'vibraslap', 'flexatone', 'oceandrum'],
  },
  {
    id: 'struck',
    title: ['敲击小件', 'Struck & metal'],
    names: ['woodblock', 'clave', 'slapstick', 'agogo', 'cowbell', 'triangles', 'fingercymbal',
      'belltree', 'marktrees', 'anvil', 'brakedrum', 'clash', 'clash2', 'gong', 'gong2',
      'bottle', 'can', 'glasstap', 'metal', 'tink', 'tok', 'clak'],
  },
];

const INSTRUMENT_GROUPS: GroupSpec[] = [
  {
    id: 'keys',
    title: ['钢琴与键盘', 'Piano & keys'],
    names: ['piano', 'steinway', 'kawai', 'piano1', 'fmpiano', 'clavisynth'],
  },
  {
    id: 'mallets',
    title: ['琴槌与铃', 'Mallets & bells'],
    names: ['glockenspiel', 'marimba', 'vibraphone', 'vibraphone_soft', 'vibraphone_bowed',
      'xylophone_hard_ff', 'xylophone_hard_pp', 'xylophone_medium_ff', 'xylophone_medium_pp',
      'xylophone_soft_ff', 'xylophone_soft_pp', 'balafon', 'balafon_hard', 'balafon_soft',
      'kalimba', 'kalimba2', 'kalimba3', 'kalimba4', 'kalimba5',
      'tubularbells', 'tubularbells2', 'handbells', 'handchimes', 'wineglass', 'wineglass_slow'],
  },
  {
    id: 'organs',
    title: ['风琴与口琴', 'Organs & harmonicas'],
    note: 'c3',
    names: ['pipeorgan_loud', 'pipeorgan_quiet', 'pipeorgan_loud_pedal', 'pipeorgan_quiet_pedal',
      'organ_4inch', 'organ_8inch', 'organ_full',
      'harmonica', 'harmonica_soft', 'harmonica_vib', 'super64', 'super64_acc', 'super64_vib'],
  },
  {
    id: 'winds',
    title: ['吹管', 'Winds'],
    note: 'c5',
    names: ['recorder_soprano_stacc', 'recorder_soprano_sus',
      'recorder_alto_stacc', 'recorder_alto_sus', 'recorder_alto_vib',
      'recorder_tenor_stacc', 'recorder_tenor_sus', 'recorder_tenor_vib',
      'recorder_bass_stacc', 'recorder_bass_sus', 'recorder_bass_vib',
      'ocarina', 'ocarina_vib', 'ocarina_small', 'ocarina_small_stacc'],
  },
  {
    id: 'saxes',
    title: ['萨克斯与铜管', 'Saxes & brass'],
    note: 'c3',
    names: ['sax', 'sax_stacc', 'sax_vib', 'saxello', 'saxello_stacc', 'saxello_vib', 'trump',
      'didgeridoo'],
  },
  {
    id: 'plucked',
    title: ['弹拨与弦', 'Plucked & strings'],
    names: ['harp', 'folkharp', 'strumstick', 'dantranh', 'dantranh_tremolo', 'dantranh_vibrato',
      'psaltery_pluck', 'psaltery_spiccato', 'psaltery_bow', 'gtr', 'sitar', 'pluck'],
  },
  {
    id: 'bass',
    title: ['贝斯', 'Bass'],
    note: 'c2',
    names: ['bass', 'bass0', 'bass1', 'bass2', 'bass3', 'bassdm', 'bassfoo', 'jungbass', 'jvbass',
      'wobble'],
  },
  {
    id: 'synth-samples',
    title: ['合成器采样', 'Synth samples'],
    names: ['arpy', 'arp', 'moog', 'juno', 'stab', 'pad', 'padlong', 'hoover', 'rave', 'rave2',
      'ravemono', 'fm', 'simplesine', 'newnotes', 'notes'],
  },
];

const FX_GROUPS: GroupSpec[] = [
  {
    id: 'voices',
    title: ['人声与语音', 'Voices & speech'],
    names: ['alphabet', 'numbers', 'num', 'speech', 'speechless', 'speakspell', 'diphone',
      'diphone2', 'dorkbot', 'dork2', 'mouth', 'breath', 'hmm', 'yeah', 'miniyeah', 'bev', 'kurt'],
  },
  {
    id: 'nature',
    title: ['自然与动物', 'Nature & animals'],
    names: ['birds', 'birds3', 'crow', 'insect', 'baa', 'baa2', 'wind', 'fire', 'bubble',
      'pebbles', 'outdoor'],
  },
  {
    id: 'electronic',
    title: ['电子与游戏', 'Electronic & arcade'],
    names: ['bleep', 'blip', 'glitch', 'glitch2', 'noise', 'noise2', 'bend', 'speedupdown',
      'space', 'sid', 'invaders', 'armora', 'tacscan', 'subroc3d', 'cosmicg', 'sundance',
      'battles', 'seawolf', 'incoming', 'industrial', 'feelfx'],
  },
  {
    id: 'everyday',
    title: ['生活与机械', 'Everyday & mechanical'],
    names: ['ballwhistle', 'trainwhistle', 'siren', 'coins', 'lighter', 'print', 'toys'],
  },
  {
    id: 'breaks',
    title: ['碎拍与循环', 'Breaks & loops'],
    names: ['amencutup', 'breaks125', 'breaks152', 'breaks157', 'breaks165', 'brk', 'jungle'],
  },
];

const SYNTH_GROUPS: GroupSpec[] = [
  {
    id: 'waveforms',
    title: ['基础波形', 'Waveforms'],
    names: [
      { name: 'sine', label: ['正弦波', 'Sine'] },
      { name: 'triangle', label: ['三角波', 'Triangle'] },
      { name: 'square', label: ['方波', 'Square'] },
      { name: 'sawtooth', label: ['锯齿波', 'Sawtooth'] },
    ],
  },
  {
    id: 'voices',
    title: ['合成音色', 'Synth voices'],
    note: 'c3',
    names: [
      { name: 'supersaw', label: ['超级锯齿', 'Detuned saws'] },
      { name: 'pulse', label: ['脉冲波', 'Pulse'] },
      { name: 'sbd', label: ['合成底鼓', 'Synth kick'] },
      { name: 'bytebeat', label: ['字节节拍', 'Bytebeat'] },
    ],
  },
  {
    id: 'noise',
    title: ['噪声', 'Noise'],
    names: [
      { name: 'white', label: ['白噪声', 'White noise'] },
      { name: 'pink', label: ['粉红噪声', 'Pink noise'] },
      { name: 'brown', label: ['褐噪声', 'Brown noise'] },
      { name: 'crackle', label: ['爆裂声', 'Crackle'] },
    ],
  },
];

/* ── Assembly ──────────────────────────────────────────────────────────── */

const toEntry = (item: string | SampleEntry): SampleEntry =>
  typeof item === 'string' ? { name: item } : item;

/* Every name a hand-sorted shelf may draw from — the sampled libraries, minus
   the drum machines and GM, which shelve themselves above. */
const LOOSE_SAMPLES: ReadonlySet<string> = new Set([
  ...DIRT_SAMPLES,
  ...MELODIC_SAMPLES,
  ...VCSL_SAMPLES,
  ...MRIDANGAM_SAMPLES,
]);

function buildCatalog(): SampleCategory[] {
  const placed = new Set<string>();
  const shelve = (specs: GroupSpec[], prefix: string): SampleGroup[] =>
    specs.map(({ id, title, subtitle, note, names }) => ({
      id: `${prefix}-${id}`,
      title,
      subtitle,
      note,
      samples: names.map(toEntry).filter(({ name }) => {
        /* A name the source lists no longer carry, or one already shelved, is
           dropped rather than offered twice or offered broken. */
        if (!LOOSE_SAMPLES.has(name) || placed.has(name)) return false;
        placed.add(name);
        return true;
      }),
    })).filter((group) => group.samples.length > 0);

  const kit = shelve(KIT_GROUPS, 'kit');
  const percussion = shelve(PERCUSSION_GROUPS, 'perc');
  const instruments = shelve(INSTRUMENT_GROUPS, 'inst');
  const fx = shelve(FX_GROUPS, 'fx');

  /* Whatever the hand sorting has not reached yet. Mostly Dirt-Samples folders
     whose names do not say what is in them — which is exactly what a page you
     can press to hear is for. */
  const unsorted = [...LOOSE_SAMPLES].filter((name) => !placed.has(name)).sort();
  if (unsorted.length > 0) {
    fx.push({
      id: 'fx-more',
      title: ['更多采样', 'More samples'],
      samples: unsorted.map((name) => ({ name })),
    });
  }

  const synths: SampleGroup[] = SYNTH_GROUPS.map(({ id, title, note, names }) => ({
    id: `synth-${id}`,
    title,
    note,
    samples: names.map(toEntry).filter(({ name }) => BUILTIN_SYNTHS.has(name)),
  }));

  return [
    {
      id: 'kit',
      title: ['鼓组', 'Drum kit'],
      blurb: ['底鼓、军鼓、镲片等鼓组的各个部件。', 'Kicks, snares, cymbals and the rest of a kit.'],
      groups: kit,
    },
    {
      id: 'machines',
      title: ['经典鼓机', 'Drum machines'],
      blurb: ['经典鼓机的全套音色。也可以写成 s("bd").bank("RolandTR808")。',
        'Every voice of classic drum machines. Also callable as s("bd").bank("RolandTR808").'],
      groups: drumMachineGroups(),
    },
    {
      id: 'percussion',
      title: ['打击乐', 'Percussion'],
      blurb: ['手鼓、木丹加鼓，以及摇、刮、敲的各种小件。', 'Hand drums, mridangam, and things to shake, scrape and strike.'],
      groups: percussion,
    },
    {
      id: 'instruments',
      title: ['旋律采样', 'Instruments'],
      blurb: ['真实乐器的录音，可以用 note() 弹出旋律。', 'Recorded instruments you can play melodies on with note().'],
      groups: instruments,
    },
    {
      id: 'gm',
      title: ['GM 音色', 'General MIDI'],
      blurb: ['General MIDI 标准音色库，配合 note() 使用。首次试听需要下载，请稍候。',
        'The General MIDI sound set, played with note(). The first listen downloads it, so give it a moment.'],
      groups: gmGroups(),
    },
    {
      id: 'synths',
      title: ['合成器', 'Synths'],
      blurb: ['内置振荡器，不需要下载，配合 note() 使用。', 'Built-in oscillators: nothing to download, played with note().'],
      groups: synths,
    },
    {
      id: 'fx',
      title: ['音效与人声', 'FX & voices'],
      blurb: ['人声、自然声、电子音效和碎拍循环。', 'Voices, nature, electronic effects and breakbeats.'],
      groups: fx,
    },
  ];
}

export const SAMPLE_CATALOG: readonly SampleCategory[] = buildCatalog();

/** How many sounds a category holds, across all of its groups. */
export function countSamples(category: SampleCategory): number {
  return category.groups.reduce((sum, group) => sum + group.samples.length, 0);
}
