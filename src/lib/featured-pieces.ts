/**
 * 精选 — the pieces the Featured page shows.
 *
 * Hand-picked work by other people, carried in the bundle rather than fetched:
 * the list is short, it changes when we say so, and a piece has to be playable
 * the moment the page opens. Swapping this module for an API later is a change
 * to this file alone — everything downstream reads `FEATURED_PIECES`.
 *
 * A piece is someone's work. `artist`, `sourceUrl` and `patternUrl` are not
 * decoration: the page shows them, and nothing goes in here without them.
 *
 * The scripts themselves live in `featured-scripts.ts` — they run to hundreds
 * of lines each, and this file is meant to be readable as a list of what the
 * collection holds.
 */

import {
  CHARLI_XCX_360,
  DETERMINATION,
  DETERMINATION_PERMALINK,
  HOME,
  MEGALOVANIA,
  PYRAMID_SONG,
  STRANGER_THINGS,
  SUPER_MARIO_BROS,
  SUPER_MARIO_BROS_PERMALINK,
  VERIDIS_QUO,
  VERIDIS_QUO_PERMALINK,
} from './featured-scripts';

export interface FeaturedPiece {
  /** Stable slug. Identifies the piece in the collection, and in the preview state. */
  id: string;
  /**
   * Where the music comes from: the album the original is off, or the game or
   * series whose soundtrack it is. Every piece names one — the piece's own page
   * says which record it came from, and it can only do that for all of them if
   * none of them is allowed to leave it out.
   *
   * It is also what the shelf groups by: pieces naming the same album stand on
   * it as a single sleeve — see `featuredAlbums`.
   */
  album: string;
  /** The piece's own name — the track's, not the album's. */
  title: string;
  /**
   * Whoever wrote the music being covered. Two credits rather than one,
   * because a live-coded cover has two authors and collapsing them into
   * "artist" would take the song from one and the code from the other.
   */
  originalArtist: string;
  /** Whoever wrote the Strudel. */
  coder: string;
  /**
   * Square artwork, served from `public/featured/` (so `/featured/<file>`).
   * Left out until a piece has any: the grid falls back to a face generated
   * from the id, which keeps an unillustrated collection looking deliberate
   * rather than broken.
   */
  coverUrl?: string;
  /** Genre-ish label, kept alongside the tempo. */
  style: string;
  bpm: number;
  /**
   * How many beats one cycle of the script holds. Four unless a piece says
   * otherwise — `bpm` is `cps × 60 × this`, and a script whose voices are all
   * `.slow(2)` writes half a bar to the cycle, so it says 2. Only the tempo
   * arithmetic reads it; nothing about the piece changes.
   */
  beatsPerCycle?: number;
  /** Where it was published. */
  sourceUrl: string;
  /** The Strudel permalink the code came from. */
  patternUrl: string;
  /** The full, runnable script. */
  code: string;
  /** The voices the script builds, in the order it declares them. */
  layers: readonly FeaturedLayer[];
}

/**
 * One voice in the piece, named after the binding it has in the code so a
 * reader can find it in the code window next to the notes.
 */
export interface FeaturedLayer {
  /**
   * The identifier as written in the script, without the `$` a Strudel voice
   * is bound with: `$lead:` in the code is `lead` here. The sigil says which
   * language the line is in, not which voice it is, and a column of them reads
   * as punctuation before it reads as a name.
   */
  name: string;
  /** What makes the sound, [中文, English]. */
  detail: readonly [string, string];
}

/**
 * Where the collection itself comes from — the curated list these pieces were
 * found in. It credits the collecting, which is its own work: without it none
 * of this would have been in front of us to pick from. Collection-level rather
 * than per-piece, so it stays one link however long the list grows.
 *
 * A piece published in a repo of its own already points at the code, and the
 * page names that instead: two repos side by side only makes the reader pick
 * which one to open.
 */
export const FEATURED_COLLECTION_URL = 'https://github.com/terryds/awesome-strudel';

/** eefano publishes their scripts as one file per song; `sourceUrl` points at the file. */
const EEFANO_COLLECTION = 'https://github.com/eefano/strudel-songs-collection/blob/main';

export const FEATURED_PIECES: readonly FeaturedPiece[] = [
  {
    id: 'kaixi-charli-xcx-360',
    album: 'Brat',
    title: '360 (cover / remix)',
    originalArtist: 'Charli XCX',
    coder: 'KAIXI',
    coverUrl: '/featured/brat.jpg',
    style: 'Hyperpop',
    bpm: 120,
    sourceUrl: 'https://x.com/xxkaixi/status/1926482951174234429',
    patternUrl: 'https://strudel.cc/?2ErYTSUotoaQ',
    code: CHARLI_XCX_360,
    // Read off the script's own bindings rather than described from listening,
    // so the notes and the code window never drift apart.
    layers: [
      { name: 'lead_synth', detail: ['锯齿波主音，低通 300Hz 加包络扫频，带 1/4 拍延迟', 'Sawtooth lead, 300Hz filter with an envelope sweep, quarter-note delay'] },
      { name: 'bass', detail: ['GM synth bass 2，低通 1800Hz', 'GM synth bass 2 under an 1800Hz filter'] },
      { name: 'sub_bass', detail: ['贝斯下移一个八度，垫住低频', 'The bass transposed an octave down, holding the bottom'] },
      { name: 'bass_drum', detail: ['TR-808 底鼓', 'TR-808 kick'] },
      { name: 'clap', detail: ['TR-808 拍手', 'TR-808 clap'] },
      { name: 'hihats', detail: ['TR-808 踩镲，第六段进入', 'TR-808 hats, entering in section six'] },
      { name: 'lead_saw', detail: ['GM lead 2 锯齿波，副歌的方波式点缀', 'GM lead 2 sawtooth, the stabs over the chorus'] },
      { name: 'vox', detail: ['人声采样，按 32 片切开逐拍取用', 'The vocal sample, sliced 32 ways and taken a slice at a time'] },
      { name: 'camera_flash', detail: ['相机快门采样，每四个 cycle 闪一次', 'A camera-shutter sample, once every four cycles'] },
    ],
  },
  {
    id: 'eefano-stranger-things',
    album: 'Stranger Things',
    title: 'Stranger Things',
    originalArtist: 'Kyle Dixon & Michael Stein',
    coder: 'eefano',
    coverUrl: '/featured/Stranger-Things.jpg',
    style: 'Synthwave',
    bpm: 168,
    sourceUrl: `${EEFANO_COLLECTION}/strangerthings.js`,
    patternUrl: 'https://strudel.cc/?jq8RmPcjADF9',
    code: STRANGER_THINGS,
    layers: [
      { name: 'p1', detail: ['supersaw 琶音，过失真后再叠一层微失谐的自己，滤波由 perlin 噪声驱动', 'A supersaw arpeggio through distortion, doubled by a slightly detuned copy of itself, its filter driven by perlin noise'] },
      { name: 'p2', detail: ['supersaw 低音，两小节换一次音，每拍敲八下', 'Supersaw bass, one note every two bars, struck eight times a cycle'] },
    ],
  },
  {
    id: 'eefano-pyramid-song',
    album: 'Amnesiac',
    title: 'Pyramid Song',
    originalArtist: 'Radiohead',
    coder: 'eefano',
    coverUrl: '/featured/Amnesiac.jpg',
    style: 'Art rock',
    bpm: 104,
    sourceUrl: `${EEFANO_COLLECTION}/pyramidsong.js`,
    patternUrl: 'https://strudel.cc/?MeMCjUtlCAoK',
    code: PYRAMID_SONG,
    layers: [
      { name: 'piano', detail: ['钢琴，每个和弦拆成两半分别给力度，带 0.6 混响', 'Piano, each chord split in two halves that take their own velocity, under a 0.6 room'] },
      { name: 'ooooh', detail: ['三角波唱的那句人声线，带颤音和长混响', 'The wordless vocal line as a triangle wave, with vibrato and a long room'] },
      { name: 'drums', detail: ['Linn 9000 与 Roland MT-32 拼起来的鼓组，按段落切换四套花样', 'A kit built from a Linn 9000 and a Roland MT-32, switching between four patterns as the sections go by'] },
    ],
  },
  {
    id: 'claffystic-determination',
    album: 'UNDERTALE',
    title: 'Determination (cover)',
    originalArtist: 'Toby Fox',
    coder: 'Claffystic',
    coverUrl: '/featured/UNDERTALE.jpg',
    style: 'Chiptune',
    bpm: 115,
    sourceUrl: 'https://github.com/Claffystic/StudelProjects',
    patternUrl: DETERMINATION_PERMALINK,
    code: DETERMINATION,
    layers: [
      { name: 'lead', detail: ['方波主旋律，左右各失谐 5 音分撑开宽度，带 0.5 混响', 'Square-wave lead, detuned ±5 cents to open it out, under a 0.5 room'] },
      { name: 'harmony', detail: ['三角波和声，轻微削波', 'Triangle-wave harmony, lightly shaped'] },
      { name: 'bass', detail: ['方波贝斯', 'Square-wave bass'] },
    ],
  },
  {
    id: 'tzwaan-home',
    album: 'UNDERTALE',
    title: 'Home (cover)',
    originalArtist: 'Toby Fox',
    coder: 'tzwaan / Swan',
    coverUrl: '/featured/UNDERTALE.jpg',
    style: 'Chiptune',
    bpm: 110,
    sourceUrl: FEATURED_COLLECTION_URL,
    patternUrl: 'https://strudel.cc/',
    code: HOME,
    layers: [
      { name: 'chords', detail: ['和声：十四个和弦按段落取出来，切成八分再琶音展开', 'Harmony: fourteen chords picked section by section, cut into eighths and arpeggiated'] },
      { name: 'tempo', detail: ['静音的十六分踩镲，只为承载 cps —— 让速度绕着 110 起伏，后段落到 124 和 115', 'A muted sixteenth hi-hat that exists only to carry cps — the tempo breathes around 110, then steps to 124 and 115'] },
      { name: 'bass', detail: ['低音声部，从 e2 起算', 'The bass line, reckoned up from e2'] },
      { name: 'melody', detail: ['主旋律，从 e4 起算，前 32 圈带摇摆', 'The melody, reckoned up from e4, swung for its first 32 cycles'] },
      { name: 'all', detail: ['四个声部统一送进尼龙吉他音色，3 秒释放、0.5 混响', 'All four voices go through one nylon guitar, a 3-second release and a 0.5 room'] },
    ],
  },
  {
    id: 'mariaareadne-megalovania',
    album: 'UNDERTALE',
    title: 'Megalovania (cover)',
    originalArtist: 'Toby Fox',
    coder: 'MariaAreadne',
    coverUrl: '/featured/UNDERTALE.jpg',
    style: 'Chiptune',
    bpm: 120,
    // Every voice is `.slow(2)`, so a bar of this one spans two cycles.
    beatsPerCycle: 2,
    sourceUrl: 'https://github.com/Mariaareadne1/maria-live-codes/blob/master/songs/megalovania.js',
    patternUrl: 'https://strudel.cc/',
    code: MEGALOVANIA,
    layers: [
      { name: 'lead', detail: ['锯齿波主题，八圈低八度、八圈高八度轮着来，1/8 拍延迟，单独走一路 orbit', 'The tune on a sawtooth, eight cycles an octave low and eight an octave high, with an eighth-note delay, on an orbit of its own'] },
      { name: 'chords', detail: ['和弦声位取自 iReal 字典，用 GM synth bass 1 发声，滤波跟着一条 16 cycle 的正弦开合', 'Chord voicings out of the iReal dictionary, sounded on a GM synth bass, filter following a sine 16 cycles long'] },
      { name: 'guitar', detail: ['干净电吉他弹同一条低音动机，整条上移八度', 'The same bass figure on a clean electric guitar, the whole line transposed up an octave'] },
      { name: 'bass', detail: ['同一节奏的锯齿低音，450Hz 低通压住', 'The same rhythm as a sawtooth bass, held under a 450Hz filter'] },
      { name: 'drums', detail: ['Akai Linn 的底鼓、镲片与军鼓，配 Linn 9000 的踩镲', 'Kick, crash and snare from an Akai Linn, hats from a Linn 9000'] },
    ],
  },
  {
    id: 'flowhacker-super-mario-bros',
    album: 'Super Mario Bros.',
    title: 'Super Mario Bros. Theme (cover)',
    originalArtist: 'Koji Kondo',
    coder: 'Flowhacker',
    coverUrl: '/featured/super-mario-bros.jpg',
    style: 'Chiptune',
    bpm: 200,
    sourceUrl: 'https://www.instagram.com/flowhacker_livecoding/reel/DXXSj6Qs_K2/',
    patternUrl: SUPER_MARIO_BROS_PERMALINK,
    code: SUPER_MARIO_BROS,
    layers: [
      { name: 'sqr1Sound', detail: ['第一条方波：主旋律，位深压到 4 bit', 'Square 1: the melody, crushed to 4 bits'] },
      { name: 'sqr2Sound', detail: ['第二条方波：跟着主旋律走的和声', 'Square 2: the harmony that shadows the melody'] },
      { name: 'triangleSound', detail: ['三角波：低音声部，NES 上就是它顶着低频', 'Triangle: the bass line, the voice that holds the bottom on an NES'] },
      { name: 'whitenoise', detail: ['噪声打击乐，粉噪加三层白噪拼出鼓组', 'Noise percussion — pink plus three layers of white, assembled into a kit'] },
      { name: 'whitenoise_bridge', detail: ['过门段落换的另一套噪声花样', 'The other noise pattern, used through the bridges'] },
    ],
  },
  {
    id: 'mariaareadne-veridis-quo',
    album: 'Discovery',
    title: 'Veridis Quo',
    originalArtist: 'Daft Punk',
    coder: 'MariaAreadne',
    coverUrl: '/featured/Discovery.jpg',
    style: 'French house',
    bpm: 116,
    sourceUrl: 'https://github.com/Mariaareadne1/maria-live-codes/blob/master/songs/vardis-quo.js',
    patternUrl: VERIDIS_QUO_PERMALINK,
    code: VERIDIS_QUO,
    layers: [
      { name: 'flute', detail: ['GM 长笛主旋律，八句一轮，带附点延迟', 'GM flute on the tune, eight phrases to a round, with a dotted delay'] },
      { name: 'chords', detail: ['supersaw 和弦垫，滤波跟着一条 32 cycle 的正弦开合', 'A supersaw pad, its filter following a sine 32 cycles long'] },
      { name: 'bass', detail: ['爵士电吉他音色的低音，一小节一个根音', 'Bass on a jazz electric guitar, one root note to a bar'] },
      { name: 'drums', detail: ['Boss DR-550 的底鼓与嗵鼓，配 Yamaha RM50 的踩镲', 'Kick and toms from a Boss DR-550, hats from a Yamaha RM50'] },
    ],
  },
];

/**
 * One entry on the gallery shelf: an album, and the tracks it holds.
 *
 * The shelf lists albums rather than pieces — three UNDERTALE covers stand on
 * it as one UNDERTALE sleeve, and opening that sleeve is what shows the three.
 * A piece that names no album is an album of one: a single is a record too, and
 * the shelf then has only one kind of thing on it.
 *
 * Which is why the title is worked out rather than written down. An album of
 * one goes by its track's own name — a cover of one song off Brat is "360",
 * not "Brat" — and an album of several by the album's, so nothing in the
 * collection has to carry a second title for the gallery, and adding a second
 * track to a single turns it into an album with no other edit.
 */
export interface FeaturedAlbum {
  /** The album's name, or the id of the one track it holds. */
  id: string;
  /** What the gallery writes under the cover. */
  title: string;
  /** Whoever wrote the music, each named once, in the order the tracks run. */
  originalArtists: readonly string[];
  /** Whoever wrote the Strudel, each named once. */
  coders: readonly string[];
  /**
   * The tracks, in the order the collection lists them. Never empty — the first
   * one is the album's face, and its artwork is the sleeve the gallery shows.
   */
  tracks: readonly FeaturedPiece[];
}

/** Kept in first-seen order: two tracks by one coder credit them once. */
const distinct = (values: readonly string[]) => [...new Set(values)];

/**
 * The collection as the gallery shows it.
 *
 * An album takes the place of its first track, so the shelf reads in the order
 * this file lists things and a collection with no albums in it comes back
 * exactly as it went in.
 */
export function featuredAlbums(
  pieces: readonly FeaturedPiece[] = FEATURED_PIECES,
): readonly FeaturedAlbum[] {
  const grouped = new Map<string, FeaturedPiece[]>();
  for (const piece of pieces) {
    const tracks = grouped.get(piece.album);
    if (tracks) tracks.push(piece);
    else grouped.set(piece.album, [piece]);
  }

  return [...grouped].map(([name, tracks]) => ({
    // Known by the record's name when there is a record's worth of it, and by
    // its one track otherwise — the same rule as the title, and for the same
    // reason: a single is a track before it is an album.
    id: tracks.length > 1 ? name : tracks[0].id,
    title: tracks.length > 1 ? name : tracks[0].title,
    originalArtists: distinct(tracks.map((track) => track.originalArtist)),
    coders: distinct(tracks.map((track) => track.coder)),
    tracks,
  }));
}

/** The piece with this id, or undefined once it has been retired from the list. */
export function findFeaturedPiece(id: string | null): FeaturedPiece | undefined {
  if (!id) return undefined;
  return FEATURED_PIECES.find((piece) => piece.id === id);
}
