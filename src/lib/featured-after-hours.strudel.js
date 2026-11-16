/*
  @title The Weeknd - After Hours (cover)
  @by yichuan
*/

// 109 BPM，4/4：一个 cycle 就是一小节
setcps(109 / 240);

samples({
  vox: 'after-hours/vocals.flac'
}, 'https://raw.githubusercontent.com/yiichuan/strudel-samples/main/');

// ───────────── 通用 ─────────────
const SONG_BARS = 164;
const BAR = 240 / 109;          // 一小节的秒数
const ECHO_8D = 3 / 16 * BAR;   // 附点八分音符的秒数，多数回声用它
const rep = (n, x) => Array(n).fill(x);
// 等间隔的小节号：every(56, 124, 4) = 56, 60, …, 124
const every = (from, to, step) => Array.from({ length: (to - from) / step + 1 }, (_, i) => from + i * step);
// 贯穿全曲的轨：在 beat1Bars 这些小节放 onBeat1，在 beat2Bars 这些小节放 onBeat2，其余小节静音
const onBars = (beat1Bars, beat2Bars, onBeat1, onBeat2) => cat(...Array.from({ length: SONG_BARS }, (_, i) =>
  beat2Bars.includes(i + 1) ? onBeat2
    : beat1Bars.includes(i + 1) ? onBeat1
      : silence));

// 音符写成 "eb4:0.8" = 音高 eb4、力度 0.8（轨内相对力度，不写就是 1）。
// Strudel 会把冒号后的数字放进 n，这里挪到 velocity，免得被当成采样编号
const vel = ({ n, ...v }) => (n === undefined ? v : { ...v, velocity: n });
const voice = (sound, p) => note(p).fmap(vel).sound(sound);
const hits = p => s(p).fmap(vel);

// 不少乐器用单独的 orbit：混响大小、回声时间是按 orbit 共享的，分开才能各调各的

// ───────────── 键盘 / pad ─────────────
// pulse — 电钢琴和弦，空间感强、悠远
//   PULSE_GAIN    —— 音量
//   PULSE_ROOM    —— 混响湿声量 0–1，越大越远越空
//   PULSE_LPF     —— 越低越远越朦胧，越高越清晰贴近
//   PULSE_RELEASE —— 松开后余音的秒数
const PULSE_GAIN = .6;
const PULSE_ROOM = .7;
const PULSE_LPF = 3500;
const PULSE_RELEASE = 2;
const pulse = p => voice("gm_epiano1", p)
  .release(PULSE_RELEASE)
  .lpf(PULSE_LPF)
  .room(PULSE_ROOM).roomsize(9)
  .delay(.3).delaytime(ECHO_8D).delayfeedback(.4)
  .gain(PULSE_GAIN)
  .orbit(6);

// pad — 电钢琴铺底（升一个八度）
const pad = p => voice("gm_epiano1", p).gain(.5).room(.5).transpose(12);

// outropad — outro 的铺底：圆润的长音，从空间里慢慢浮起、慢慢散开（升一个八度）
//   OUTRO_GAIN    —— 音量
//   OUTRO_ATTACK  —— 音头浮起来的秒数：越长越不像弹奏，越短越接近"咚"
//   OUTRO_SHEEN   —— 泛音光泽（FM 深度）：0 = 纯正弦，调大更亮，太大会有颗粒感
//   OUTRO_DECAY   —— 浮起来以后的衰减秒数
//   OUTRO_RELEASE —— 松开后的余音秒数
//   OUTRO_ROOM    —— 混响湿声量 0–1
const OUTRO_GAIN = 1.2;
const OUTRO_ATTACK = .6;
const OUTRO_SHEEN = .4;
const OUTRO_DECAY = 2;
const OUTRO_RELEASE = 2;
const OUTRO_ROOM = .9;
const outropad = p => voice("sine", p).transpose(12)
  .fm(OUTRO_SHEEN).fmh(2).fmattack(OUTRO_ATTACK).fmdecay(1.5).fmsustain(.3)
  .attack(OUTRO_ATTACK).decay(OUTRO_DECAY).sustain(0).release(OUTRO_RELEASE)
  .lpf(1800)
  .room(OUTRO_ROOM).roomsize(12)
  .gain(OUTRO_GAIN)
  .orbit(10);

// koto — 古筝：远、虚、带电子感
//   KOTO_LPF    —— 越低越闷越远
//   KOTO_HPF    —— 越高越薄越虚
//   KOTO_ROOM   —— 混响湿声量 0–1
//   KOTO_PHASER —— 相位器深度 0–1，越大越电子，0 = 关闭
const KOTO_LPF = 550;
const KOTO_HPF = 80;
const KOTO_ROOM = .5;
const KOTO_PHASER = .6;
const koto = p => voice("gm_koto", p).gain(1.35)
  .hpf(KOTO_HPF).lpf(KOTO_LPF).lpq(3)
  .phaserrate(.5).phaserdepth(KOTO_PHASER)
  .room(KOTO_ROOM).roomsize(6)
  .delay(.35).delaytime(ECHO_8D).delayfeedback(.4);

// ───────────── 吉他 / 弦 ─────────────
// cleangtr — 清音电吉他：远、虚、空灵
//   GTR_LPF  —— 越低越远越虚
//   GTR_HPF  —— 越高越薄越轻
//   GTR_ROOM —— 混响湿声量 0–1
const GTR_LPF = 3200;
const GTR_HPF = 300;
const GTR_ROOM = .8;
const cleangtr = p => voice("gm_electric_guitar_clean", p)
  .gain(1.0)
  .attack(.015)
  .lpf(GTR_LPF).hpf(GTR_HPF)
  .room(GTR_ROOM).roomsize(8)
  .delay(.3).delaytime(ECHO_8D).delayfeedback(.45)
  .orbit(2);

// acgtr — 原声吉他
const acgtr = p => voice("gm_acoustic_guitar_steel", p).gain(.45);

// strings — 弦乐：很大的空间 + 附点四分音符的长回声
//   STRINGS_ROOM —— 混响湿声量 0–1
//   STRINGS_ECHO —— 回声反馈 0–1，越大回声越多越长，超过 .7 左右会糊
const STRINGS_ROOM = .85;
const STRINGS_ECHO = .6;
const strings = p => voice("gm_string_ensemble_1", p).gain(.55)
  .release(1)
  .room(STRINGS_ROOM).roomsize(10)
  .delay(.5).delaytime(3 / 8 * BAR).delayfeedback(STRINGS_ECHO)
  .orbit(9);

// sitar — 西塔琴：大空间 + 附点八分回声
//   SITAR_ROOM —— 混响湿声量 0–1
//   SITAR_ECHO —— 回声反馈 0–1，越大回声越多越长，太大会糊
const SITAR_ROOM = .6;
const SITAR_ECHO = .55;
const sitar = p => voice("gm_sitar", p).gain(.5)
  .room(SITAR_ROOM).roomsize(7)
  .delay(.4).delaytime(ECHO_8D).delayfeedback(SITAR_ECHO)
  .orbit(7);

// distgtr — 失真吉他：大空间 + 四分音符回声（和 sitar 的回声错开）
//   DIST_ROOM —— 混响湿声量 0–1
//   DIST_ECHO —— 回声反馈 0–1
const DIST_ROOM = .55;
const DIST_ECHO = .5;
const distgtr = p => voice("gm_distortion_guitar", p).gain(.35)
  .room(DIST_ROOM).roomsize(8)
  .delay(.4).delaytime(1 / 4 * BAR).delayfeedback(DIST_ECHO)
  .orbit(8);

// ───────────── 低音 ─────────────
// subbass — 纯正弦低音
//   SUB_OCT  —— 升几个八度：0 = 原音区（C2 ≈ 65Hz，小喇叭基本放不出来），1 = C3 ≈ 130Hz
//   SUB_GAIN —— 音量
//   HOOK_SUB_GAIN —— 两段副歌（八度叠音）用的音量，覆盖 SUB_GAIN
const SUB_OCT = 0;
const SUB_GAIN = 2.0;
const HOOK_SUB_GAIN = 1.0;
const subbass = p => voice("sine", p).transpose(12 * SUB_OCT).gain(SUB_GAIN).release(.5);

// bassgtr — 合成器 pad 式低音：单层三角波，音头"涌"上来，音和音连成一片
//   BASS_LPF     —— 越高越亮，低于 ~800 会发闷
//   BASS_ATTACK  —— 音头涌上来的秒数，太大快速的经过音会听不清
//   BASS_RELEASE —— 音尾秒数，越大越连
//   BASS_LEGATO  —— 音符长度倍数，1 = 原 MIDI 时值，2 左右基本填满休止
const BASS_LPF = 1500;
const BASS_ATTACK = .04;
const BASS_RELEASE = .3;
const BASS_LEGATO = 1.8;
const bassgtr = p => voice("triangle", p)
  .lpf(BASS_LPF).lpq(.5)
  .attack(BASS_ATTACK).decay(0).sustain(1).release(BASS_RELEASE)
  .legato(BASS_LEGATO)
  .gain(1.0);

// popsynth — 合成低音（supersaw）
//   POP_GAIN —— 音量
//   POP_OCT  —— 升几个八度：0 = 原音区，1 = 高一个八度，小喇叭上更清楚
const POP_GAIN = 1.0;
const POP_OCT = 0;
const popsynth = p => voice("supersaw", p).transpose(12 * POP_OCT)
  .lpf(900).gain(POP_GAIN).release(.5);

// ───────────── 合成器 ─────────────
// pluck — 持续、饱满、带鼻音的"嗡"琶音
//   PLUCK_LPF    —— 越低越闷越像"嗡"，越高越亮越像"哇"
//   PLUCK_Q      —— 共振，越大鼻音越重
//   PLUCK_DETUNE —— 各层跑调程度，越大越厚、颤动越明显，太大会走音
//   PLUCK_ATTACK —— 音头软硬（秒），太大琶音会听不清
const PLUCK_LPF = 800;
const PLUCK_Q = 4;
const PLUCK_DETUNE = .2;
const PLUCK_ATTACK = .015;
const pluck = p => voice("supersaw", p).unison(5).detune(PLUCK_DETUNE)
  .lpf(PLUCK_LPF).lpq(PLUCK_Q)
  .attack(PLUCK_ATTACK).sustain(1).release(.12)
  .gain(.4);

// bitsine — 温暖、持续的"嗡"鸣，带一点颤音
//   BIT_GAIN    —— 音量
//   BIT_HUM     —— 嗡鸣感（FM 深度），0 = 纯正弦
//   BIT_RATIO   —— 泛音比例：整数（1、2）是和谐的嗡鸣，非整数（3.5、1.4）会变成铃声
//   BIT_ATTACK  —— 音头起来的秒数：越大越柔，越小越接近"咚"
//   BIT_SUSTAIN —— 按住时保持的音量 0–1，0 = 敲一下就衰减
//   BIT_LPF     —— 越低越闷越暗
//   BIT_ROOM    —— 混响湿声量 0–1
const BIT_GAIN = .4;
const BIT_HUM = .7;
const BIT_RATIO = 1;
const BIT_ATTACK = .06;
const BIT_SUSTAIN = .8;
const BIT_LPF = 1400;
const BIT_ROOM = .65;
const bitsine = p => voice("sine", p)
  .fm(BIT_HUM).fmh(BIT_RATIO).fmsustain(1)
  .attack(BIT_ATTACK).decay(.4).sustain(BIT_SUSTAIN).release(1.2)
  .vib(5).vibmod(.08)
  .lpf(BIT_LPF)
  .room(BIT_ROOM).roomsize(6)
  .delay(.2).delaytime(ECHO_8D).delayfeedback(.25)
  .gain(BIT_GAIN)
  .orbit(5);

// ───────────── 鼓 ─────────────
//   DRUMS_DRIVE —— 饱和量 0–1：越大越脆越有冲击力，太大会破
const DRUMS_DRIVE = 0.9;
// drums — 707 鼓组
const drums = p => hits(p).bank("RolandTR707").gain(.55).shape(DRUMS_DRIVE).hpf(50);
// grooveInDrums — 混搭鼓组，按名字换成各鼓机的采样（表里没有的名字会播成别的同名采样）。
// 采样名要用单引号：双引号字符串会被 Strudel 当成 mini-notation
const GROOVE_IN_KIT = {
  bd: { s: 'RolandTR707_bd', n: 0 },
  sd: { s: 'RolandTR909_sd', n: 2 },
  hh: { s: 'RolandTR808_hh', n: 0 },
  cr: { s: 'RolandTR707_cr', n: 0 },
};
const grooveInDrums = p => hits(p).fmap(v => ({ ...v, ...GROOVE_IN_KIT[v.s] }))
  .gain(.55).shape(DRUMS_DRIVE).hpf(50);
// perc — 808 打击乐（cp、rim、hh）
const perc = p => hits(p).bank("RolandTR808").gain(.4);
// openhat — 909 开镲
const openhat = p => hits(p).bank("RolandTR909").gain(.4);
// crash — 606 吊镲，余音拉长
//   CRASH_GAIN  —— 音量
//   CRASH_SPEED —— 播放速度：<1 放慢，余音变长、音高略降、更厚；太低会发闷
//   CRASH_ROOM  —— 混响湿声量 0–1
//   CRASH_SIZE  —— 混响空间大小，越大尾巴越长
const CRASH_GAIN = .7;
const CRASH_SPEED = .8;
const CRASH_ROOM = .5;
const CRASH_SIZE = 8;
const crash = p => hits(p).bank("RolandTR606")
  .speed(CRASH_SPEED)
  .room(CRASH_ROOM).roomsize(CRASH_SIZE)
  .gain(CRASH_GAIN)
  .orbit(4);

// ───────────── 音效 ─────────────
// riser(bars) — 起飞音效：粉红噪声由暗到亮、由弱到强，落在 bars 小节长段落的最后一小节，
// 结束在下一段的第一拍
//   RISER_GAIN  —— 最终峰值音量
//   RISER_SWEEP —— 滤波打开的幅度，越大最后越亮
//   RISER_LEN   —— 时长（16 分音符个数，16 = 1 小节）；加大是更早开始，结束点不变
const RISER_GAIN = 1.2;
const RISER_SWEEP = 2;
const RISER_LEN = 24;
const RISER_SEC = RISER_LEN / 16 * BAR;
const riser = bars => cat(...rep(bars - 1, silence), s("pink"))
  .legato(RISER_LEN / 16)
  .early((RISER_LEN - 16) / 16)
  .gain(RISER_GAIN).attack(RISER_SEC).release(.005)
  .lpf(200).lpenv(RISER_SWEEP).lpattack(RISER_SEC).lpsustain(1)
  .hpf(60).shape(.3);

// revriser(bars) — 一段均匀的粉红噪声，占住段落第一小节的前 3 拍
//   REVRISER_GAIN —— 音量
//   REVRISER_LPF  —— 低通：越低越暗越闷，20000 = 不切
const REVRISER_GAIN = .5;
const REVRISER_LPF = 6000;
const revriser = bars => cat(s("[pink@3 -]"), ...rep(bars - 1, silence))
  .attack(.01).sustain(1).release(.01)
  .lpf(REVRISER_LPF).hpf(60)
  .gain(REVRISER_GAIN);

// ───────────── 段落 ─────────────
// 段落里 `<A!4 B>` = A 连续 4 小节，然后 B 一小节；`-` = 这一小节静音
// intro · 第 1–4 小节 · 古筝
let intro = koto("<[c3@8 c3@6 c3@2]>");

// intro_pad · 第 5–12 小节 · 起飞音效、古筝、电钢琴铺底
let intro_pad = stack(
  riser(8),
  koto("<[c3@8 c3@6 c3@2]>"),
  pad(`<
    [c2,eb2] [c2,eb2] [bb2,g2] [bb2,g2]
    [c2,eb2] [c2,eb2] [bb2,g2] [ab2,f2]
  >`)
);

// verse_1a · 第 13–16 小节 · 鼓、打击乐
let verse_1a = stack(
  drums("<bd:0.8>"),
  perc("<[cp:0.7,rim]>")
);

// break_1 · 第 17–20 小节 · 清音电吉他、原声吉他
let break_1 = stack(
  cleangtr("[c4@2 -@2 c4@2 - c4 - c4@2 - c4@2 -@2]"),
  acgtr("[c4:0.55@2 -@2 c4:0.55@2 - c4:0.55 - c4:0.55@2 - c4:0.55@2 -@2]"),
);

// verse_1b · 第 21–36 小节 · 正弦低音、清音电吉他、鼓、打击乐
let verse_1b = stack(
  subbass("<c2 c2 bb1 [ab1 -]>"),
  cleangtr(`<
    [c4@2 -@2 c4@2 - c4 - c4@2 - c4@2 -@2]!4
    [c4@2 -@2 c4@2 - c4 - c4@2 - c4:0.8@2 -@2]
    [c4@2 -@2 c4@2 - c4 - c4@2 - c4@2 -@2]!11
  >`),
  drums("<bd:0.6>"),
  perc("<[cp:0.7,rim]>")
);

// verse_1c · 第 37–44 小节 · 正弦低音、清音电吉他、原声吉他、合成拨弦、鼓
let verse_1c = stack(
  subbass("<- c2:0.6 bb1:0.6 [ab1:0.6 -]>"),
  cleangtr(`<
    [c4:0.7@2 -@2 c4:0.6@2 - c4:0.5 - c4:0.4@2 - c4:0.3@2 -@2] - - -
    - - [c4:0.7 -@7] -
  >`),
  acgtr(`<
    [c4:0.4@2 -@2 c4:0.35@2 - c4:0.3 - c4:0.2@2 - c4:0.15@2 -@2] - - -
    - - [c4:0.4 -@7] -
  >`),
  pluck(`<
    [-@4 eb3:0.65 c3:0.65 g3:0.65 eb3:0.65 eb3 c3 g3 eb3 eb3 c3 g3 eb3]
    [eb3 c3 g3 eb3]*4!7
  >`),
  drums("<bd:0.6 - - - - - - ->")
);

// interlude · 第 45–48 小节 · 古筝（比 intro 更空灵、更远）
//   INTERLUDE_GAIN —— 干声音量，越小越远
//   INTERLUDE_LPF  —— 越低越远越虚
//   INTERLUDE_ROOM —— 混响湿声量 0–1
//   INTERLUDE_ECHO —— 回声反馈 0–1，越大余音越长，太大会糊
const INTERLUDE_GAIN = .9;
const INTERLUDE_LPF = 400;
const INTERLUDE_ROOM = .85;
const INTERLUDE_ECHO = .6;
let interlude = koto("<[c3@8 c3@6 c3@2]>")
  .gain(INTERLUDE_GAIN)
  .attack(.02)
  .lpf(INTERLUDE_LPF)
  .room(INTERLUDE_ROOM).roomsize(10)
  .delay(.45).delayfeedback(INTERLUDE_ECHO)
  .orbit(3);

// breakdown · 第 49–60 小节 · 起飞音效、电钢琴铺底、清音电吉他、原声吉他、弦乐
let breakdown = stack(
  riser(12),
  pad(`<
    - - - -
    [[c3,eb3]@7 -@5 [c3,eb3]@2 -@2] [[c3,eb3]@7 -@5 [c3,eb3]@2 -@2] [[bb2,g2]@7 -@5 [bb2,g2]@2 -@2] [[ab2,f2]@7 -@5 [ab2,f2]@2 -@2]
    [[c3,eb3]@7 -@5 [c3,eb3]@2 -@2] [[c3,eb3]@7 -@5 [c3,eb3]@2 -@2] [[bb2,g2]@7 -@5 [bb2,g2]@2 -@2] [[ab2,f2]@7 -@5 [ab2,f2]@2 -@2]
  >`),
  cleangtr("[c4@2 -@2 c4@2 - c4 - c4@2 - c4@2 -@2]"),
  acgtr("[c4:0.55@2 -@2 c4:0.55@2 - c4:0.55 - c4:0.55@2 - c4:0.55@2 -@2]"),
  strings(`<
    - - - [-@7 c3]
    - [-@7 c3] - [-@7 c3]
    - [-@7 c3] - [-@7 c3]
  >`)
);

// groove_in · 第 61–68 小节 · 电钢琴铺底、清音电吉他、弦乐、低音、鼓、打击乐、吊镲
let groove_in = stack(
  pad(`<
    [[c3,eb3]@7 -@5 [c3,eb3]@2 -@2] [[c3,eb3]@7 -@5 [c3,eb3]@2 -@2] [[bb2,g2]@7 -@5 [bb2,g2]@2 -@2] [[ab2,f2]@7 -@5 [ab2,f2]@2 -@2]
  >`),
  cleangtr("[c4@2 -@2 c4@2 - c4 - c4@2 - c4@2 -@2]"),
  strings(`<
    - [-@7 c3] - [-@7 c3]
    - [-@7 c3] - -
  >`),
  bassgtr(`<
    [-@2 c2@2 -@2 c2@2 -@2 c2@2 -@2 c2 d2@2 - c2@2 -@2 c2@2 -@2 c2@2 - c2 d2 eb2]@2 [-@2 g1@2 -@2 g1@2 -@2 g1@2 - g1 a1 bb1@2 - f1@2 -@2 f1@2 -@2 f1@2 -@2 d2 eb2]@2
  >`),
  grooveInDrums("[[bd:0.5,hh:0.15] hh:0.15!3 [bd:0.3,hh:0.15,sd:0.5] hh:0.15!3]*2"),
  perc("[rim hh rim hh]"),
  crash("<cr - - - - - - ->")
);

// groove · 第 69–84 小节 · 清音电吉他、低音、鼓、打击乐、吊镲
let groove = stack(
  cleangtr(`<
    [-@6 c4:0.7 -]
    [c4:0.7@2 -@2 c4:0.7@2 - c4:0.7 - c4:0.7@2 - c4:0.7@2 -@2]!9
    [c4@2 -@2 c4@2 - c4 - c4@2 - c4@2 -@2]!6
  >`),
  bassgtr(`<
    [-@14 c2 d2@2 - c2@2 -@2 c2@2 -@2 c2@2 - c2 d2 eb2]@2 [-@2 g1@2 -@2 g1@2 -@2 g1@2 - g1 a1 bb1@2 - f1@2 -@2 f1@2 -@2 f1@2 -@2 d2 eb2]@2
    [-@2 c2@2 -@2 c2@2 -@2 c2@2 -@2 c2 d2@2 - c2@2 -@2 c2@2 -@2 c2@2 - c2 d2 eb2]@2 [-@2 g1@2 -@2 g1@2 -@2 g1@2 - g1 a1 bb1@2 - f1@2 -@2 f1@2 -@2 f1@2 -@2 d2 eb2]@2
    [-@2 c2@2 -@2 c2@2 -@2 c2@2 -@2 c2 d2@2 - c2@2 -@2 c2@2 -@2 c2@2 - c2 d2 eb2]@2 [-@2 g1@2 -@2 g1@2 -@2 g1@2 - g1 a1 bb1@2 - f1@2 -@2 f1@2 -@2 f1@2 -@2 d2 eb2]@2
    [-@2 c2@2 -@2 c2@2 -@2 c2@2 -@2 c2 d2@2 - c2@2 -@2 c2@2 -@2 c2@2 - c2 d2 eb2]@2 [-@2 g1@2 -@2 g1@2 -@2 g1@2 - g1 a1 bb1@2 - f1@2 -@2 f1@2 -@2 f1@2 -@2 d2 eb2]@2
  >`),
  grooveInDrums(`<
    [-@12 [bd:0.3,hh:0.15,sd:0.5] hh:0.15!3]
    [[bd:0.5,hh:0.15] hh:0.15!3 [bd:0.3,hh:0.15,sd:0.5] hh:0.15!3]*2!15
  >`),
  perc("<[-@3 hh] [rim hh rim hh]!15>"),
  crash("<[-@3 cr] - - - - - - - cr - - - - - - ->")
);

// hook_1 · 第 85–92 小节 · 正弦低音、合成低音、鼓、打击乐、开镲、吊镲
let hook_1 = stack(
  subbass(`<
    [-@3 [c2,c3]@5]@2 [g1,g2] [f1,f2]
    [c2,c3] [c2,c3] [g1,g2] f1
  >`).gain(HOOK_SUB_GAIN),
  popsynth(`<
    [-@3 c2@5]@2 g1:0.8 f1:0.6
    c2 c2 g1:0.8 f1:0.6
  >`),
  grooveInDrums(`<
    [-@12 [bd:0.5,hh:0.15,sd] hh:0.15!3]
    [[bd:0.5,hh:0.15] hh:0.15!3 [bd:0.3,hh:0.15,sd:0.5] hh:0.15!3]*2!7
  >`),
  perc("<[-@3 hh] [rim hh rim hh]!7>"),
  openhat("<[-@3 oh] - - - - - - ->"),
  crash("<[-@3 cr] - - - - - - ->")
);

// verse_2 · 第 93–108 小节 · 清音电吉他、原声吉他、低音、8-bit 正弦、鼓、打击乐、开镲、吊镲
let verse_2 = stack(
  cleangtr("<-!8 [c4@2 -@2 c4@2 - c4 - c4@2 - c4@2 -@2]!8>"),
  acgtr("<-!8 [c4:0.55@2 -@2 c4:0.55@2 - c4:0.55 - c4:0.55@2 - c4:0.55@2 -@2]!8>"),
  bassgtr(`<
    [-@2 c2:0.5@2 -@2 c2:0.5@2 -@2 c2:0.5@2 -@2 c2:0.5 d2:0.5@2 - c2:0.5@2 -@2 c2:0.5@2 -@2 c2:0.5@2 - c2:0.5 d2:0.5 eb2:0.5]@2 [-@2 g1:0.5@2 -@2 g1:0.5@2 -@2 g1:0.5@2 - g1:0.5 a1:0.5 bb1:0.5@2 - f1:0.5@2 -@2 f1:0.5@2 -@2 f1:0.5@2 -@2 d2:0.5 eb2:0.5]@2
  >`),
  bitsine(`<
    [c3:0.8 g2 [eb3,g3] eb3] [c3 - [eb3,g3] eb3] [f3 bb2 [bb3,d4] bb3] [ab3 bb2 [ab3,c4] ab3]
  >`),
  grooveInDrums("[[bd:0.5,hh:0.15] hh:0.15!3 [bd:0.3,hh:0.15,sd:0.5] hh:0.15!3]*2"),
  perc("[rim hh rim hh]"),
  openhat("<oh - - - - - - ->"),
  crash("<cr - - - - - - ->")
);

// hook_2 · 第 109–124 小节 · 粉红噪声、正弦低音、原声吉他、合成低音、鼓、打击乐
let hook_2 = stack(
  revriser(16),
  subbass(`<
    [-@3 [c2,c3]@5]@2 [g1,g2] [f1,f2]
    [c2,c3] [c2,c3] [g1,g2] f1
    [c2,c3] [c2,c3] [g1,g2] f1
    [c2,c3] [c2,c3] [g1,g2] f1
  >`).gain(HOOK_SUB_GAIN),
  acgtr("<-!8 [c4@2 -@2 c4@2 - c4 - c4@2 - c4@2 -@2]!8>"),
  popsynth(`<
    [-@3 c2@5]@2 g1:0.8 f1:0.6
    c2 c2 g1:0.8 f1:0.6
    c2 c2 g1:0.8 f1:0.6
    c2 c2 g1:0.8 f1:0.6
  >`),
  grooveInDrums(`<
    [-@12 [bd:0.5,hh:0.15,sd] hh:0.15!3]
    [[bd:0.5,hh:0.15] hh:0.15!3 [bd:0.3,hh:0.15,sd:0.5] hh:0.15!3]*2!15
  >`),
  perc("<[-@3 hh] [rim hh rim hh]!15>")
);

// bridge · 第 125–144 小节 · 电钢琴和弦、电钢琴铺底、弦乐、8-bit 正弦、西塔琴、失真吉他
let bridge = stack(
  pulse(`<
    [[c4:0.75,eb4:0.75,g4:0.55]@4 -@9 [c4:0.75,eb4:0.75,g4:0.55]@3] [[c4:0.75,eb4:0.75,g4:0.55]@3 -@10 [c4:0.75,eb4:0.75,g4:0.55]@3] [[bb3:0.75,d4:0.75,g3:0.75]@3 -@9 [bb3:0.75,d4:0.75,g3:0.75]@3 [ab3:0.75,c4:0.75,f3:0.75]@3 -@10 [ab3:0.75,c4:0.75,f3:0.75]@4]@2
    - - - -
    - - - -
    - - - -
    - - - -
  >`),
  pad(`<
    [[c3:0.4,eb3:0.4]@5 - [c3:0.4,eb3:0.4] -] [[c3:0.4,eb3:0.4]@5 - [c3:0.4,eb3:0.4] -] [[bb2:0.4,g2:0.4]@5 - [bb2:0.4,g2:0.4] -] [[ab2:0.4,f2:0.4]@5 - [ab2:0.4,f2:0.4] -]
    [[bb3:0.8,c4:0.8,eb4:0.8] [bb3:0.6,c4:0.6,eb4:0.6] [bb3:0.4,c4:0.4,eb4:0.4] [bb3:0.3,c4:0.3,eb4:0.3], [bb4:0.5,bb5:0.5,c5:0.5,c6:0.5,eb5:0.5,eb6:0.5]@3 -] [[bb3:0.2,c4:0.2,eb4:0.2] [bb3:0.1,c4:0.1,eb4:0.1] -@2] [[bb3:0.8,f3:0.8,g3:0.8] [bb3:0.6,f3:0.6,g3:0.6] [bb3:0.4,f3:0.4,g3:0.4] [bb3:0.3,f3:0.3,g3:0.3], [bb4:0.5,bb5:0.5,c5:0.5,c6:0.5,d5:0.5,d6:0.5]@3 -] [[bb3:0.2,f3:0.2,g3:0.2] [bb3:0.1,f3:0.1,g3:0.1] -@2]
    [[ab2:0.8,c3:0.8,eb3:0.8] [ab2:0.6,c3:0.6,eb3:0.6] [ab2:0.4,c3:0.4,eb3:0.4] [ab2:0.3,c3:0.3,eb3:0.3], [ab4:0.5,ab5:0.5,c5:0.5,c6:0.5,f4:0.5,f5:0.5]@3 -] [[ab2:0.2,c3:0.2,eb3:0.2] [ab2:0.1,c3:0.1,eb3:0.1] -@2] [[bb3:0.8,eb3:0.8,g3:0.8] [bb3:0.6,eb3:0.6,g3:0.6] [bb3:0.4,eb3:0.4,g3:0.4] [bb3:0.3,eb3:0.3,g3:0.3], [c5:0.5,c6:0.5,eb5:0.5,eb6:0.5,g5:0.5,g6:0.5]@3 -] [[bb3:0.2,eb3:0.2,g3:0.2] [bb3:0.1,eb3:0.1,g3:0.1] [ab5:0.5,ab6:0.5,eb5:0.5,eb6:0.5,f5:0.5,f6:0.5]@2]
    [[ab3:0.8,c4:0.8,f3:0.8] [ab3:0.6,c4:0.6,f3:0.6] [ab3:0.4,c4:0.4,f3:0.4] [ab3:0.3,c4:0.3,f3:0.3]] [[ab3:0.2,c4:0.2,f3:0.2] [ab3:0.1,c4:0.1,f3:0.1] -@2] [[bb3:0.8,d4:0.8,g3:0.8] [bb3:0.6,d4:0.6,g3:0.6] [bb3:0.4,d4:0.4,g3:0.4] [bb3:0.3,d4:0.3,g3:0.3]] [[bb3:0.2,d4:0.2,g3:0.2] [bb3:0.1,d4:0.1,g3:0.1] -@2]
    [[c4:0.8,f4:0.8,g4:0.8] [c4:0.6,f4:0.6,g4:0.6] [c4:0.4,f4:0.4,g4:0.4] [c4:0.3,f4:0.3,g4:0.3]] [[c4:0.2,f4:0.2,g4:0.2] [c4:0.1,f4:0.1,g4:0.1] -@2] [[bb3:0.8,c4:0.8,eb4:0.8] [bb3:0.6,c4:0.6,eb4:0.6] [bb3:0.4,c4:0.4,eb4:0.4] [bb3:0.3,c4:0.3,eb4:0.3]] [[bb3:0.2,c4:0.2,eb4:0.2] [bb3:0.1,c4:0.1,eb4:0.1] -@2]
  >`),
  strings(`<
    - [-@14 c3:0.3 -] - [-@14 c3:0.3 -]
    - - - -
    - - - -
    - - - [- [d5:0.6,f5:0.6]@2 [c5:0.6,eb5:0.6]@3 -@2]
    - - - -
  >`),
  bitsine(`<
    - - - -
    - - - -
    - - - -
    - [-@3 [eb2,eb3]@2 [c2,c3]@2 -] - -
    - - - -
  >`),
  sitar(`<
    - - - [-@7 c6:0.25]
    [c6@2 - c6:0.6@2 - eb6:0.9@2 [c5:0.15,c6:0.6] eb6:0.85@2 [c5:0.15,c6:0.6] eb6:0.75@2 [c5:0.15,c6:0.4] eb6:0.65@2 -@15, - [bb4:0.5,bb5:0.65] -@2 [bb4:0.15,bb5:0.6] -@27]@2 [d6:0.9@2 [bb4:0.15,c6:0.6] d6:0.85@2 [bb4:0.15,c6:0.6] d6:0.75@2 [bb4:0.15,c6:0.4] d6:0.65@2 -@5] -
    [c6:0.9@2 [ab4:0.15,bb5:0.6] c6:0.85@2 [ab4:0.15,bb5:0.6] c6:0.75@2 [ab4:0.15,bb5:0.4] c6:0.65@2 -@5] [-@30 c6:0.85 eb6:0.85] [f6:0.85 -@3 c6:0.65 eb6:0.65 f6:0.65 g6:0.85@4 eb6:0.65 f6:0.65 g6:0.75@4 eb6:0.65 f6:0.65 g6:0.65@4 -@9, g6:0.9@4 - [eb5:0.15,f6:0.6]@2 -@3 c6:0.65 [eb5:0.15,f6:0.6]@2 -@3 c6:0.65 [eb5:0.15,f6:0.4]@2 -@13] [-@8 ab6:0.9@2 [eb5:0.1,gb6:0.5] ab6:0.75@2 [eb5:0.1,gb6:0.5] ab6:0.65@2]
    [g6:0.65@2 [eb5:0.1,f6:0.5] g6:0.75@2 [eb5:0.1,f6:0.5] g6:0.65@2 [eb5:0.1,f6:0.5] g6:0.65@2 -@5] - [[eb5:0.1,eb6:0.1] [c5:0.1,c6:0.1] [eb5:0.25,eb6:0.25] [c5:0.25,c6:0.25] [eb5:0.25,eb6:0.25] [g5:0.25,g6:0.25] [eb5:0.25,eb6:0.25] [g5:0.25,g6:0.25] [eb5:0.25,eb6:0.25] [g5:0.25,g6:0.25] [eb5:0.25,eb6:0.25] [g5:0.25,g6:0.25]] -
    [[eb5:0.1,eb6:0.1] [c5:0.1,c6:0.1] [eb5:0.25,eb6:0.25] [c5:0.25,c6:0.25] [eb5:0.25,eb6:0.25] [g5:0.25,g6:0.25] [eb5:0.25,eb6:0.25] [g5:0.25,g6:0.25] [eb5:0.25,eb6:0.25] [g5:0.25,g6:0.25] [eb5:0.25,eb6:0.25] [bb5:0.25,bb6:0.25]] [[ab5:0.25,ab6:0.25] [bb5:0.25,bb6:0.25] [ab5:0.25,ab6:0.25] [bb5:0.25,bb6:0.25] [ab5:0.25,ab6:0.25] [bb5:0.25,bb6:0.25] -@6] [c6:0.4@2 - c6:0.25 [eb5:0.4,eb6:0.4]@2 - [eb5:0.25,eb6:0.25] [f5:0.4,f6:0.4]@2 -@6] -
  >`),
  distgtr(`<
    - - - [-@13 c5@3]
    [-@3 c5:0.65@3 [c5:0.35,eb5:0.35]@3 [c5:0.35,eb5:0.35]@3 c5:0.35 -@3, -@7 c5@2 - c5:0.65@2 eb5:0.35@3 -] - [[c5:0.65,d5:0.35]@3 [bb4:0.35,d5:0.35]@3 bb4:0.35 -@9, - bb4@2 - bb4:0.65@2 d5:0.35@3 -@7] -
    [- ab4@2 ab4:0.35@3 ab4:0.35 c5:0.35@3 -@6, - c5:0.35@3 ab4:0.65@2 -@10, -@4 c5:0.35@3 -@9] - - -
    - - [-@3 [c5:0.35,c6:0.35] [eb5:0.35,eb6:0.35] [g5:0.35,g6:0.35] -@6] -
    [-@3 [c5:0.35,c6:0.35] [eb5:0.35,eb6:0.35] [g5:0.35,g6:0.35] -@6] - - -
  >`)
);

// outro · 第 145–162 小节 · outro 铺底
let outro = outropad(`<
  [[c2:0.2,c3:0.2,eb2:0.2,eb3:0.2] [c2:0.1,c3:0.1,eb2:0.1,eb3:0.1]] - [[bb1:0.2,bb2:0.2,g1:0.2,g2:0.2] [bb1:0.1,bb2:0.1,g1:0.1,g2:0.1]] -
  [[ab1:0.2,ab2:0.2,f1:0.2,f2:0.2] [ab1:0.1,ab2:0.1,f1:0.1,f2:0.1]] - [[bb1:0.2,c1:0.2,c2:0.2] [bb1:0.1,c1:0.1,c2:0.1]] [[c2:0.2,c3:0.2,d1:0.2,d2:0.2,d3:0.2] [c2:0.1,c3:0.1,d1:0.1,d2:0.1,d3:0.1]]
  [[c2:0.2,c3:0.2,eb2:0.2,eb3:0.2] [c2:0.1,c3:0.1,eb2:0.1,eb3:0.1]] - [[bb1:0.2,bb2:0.2,g1:0.2,g2:0.2] [bb1:0.1,bb2:0.1,g1:0.1,g2:0.1]] -
  [[ab1:0.2,ab2:0.2,f1:0.2,f2:0.2] [ab1:0.1,ab2:0.1,f1:0.1,f2:0.1]] - [[bb1:0.2,c1:0.2,c2:0.2] [bb1:0.1,c1:0.1,c2:0.1]] [[c2:0.2,c3:0.2,d1:0.2,d2:0.2,d3:0.2] [c2:0.1,c3:0.1,d1:0.1,d2:0.1,d3:0.1]]
  [c1:0.2,c2:0.2,c3:0.2] -
>`);

// ───────────── 贯穿全曲的轨 ─────────────
// vocals — 原曲人声：每小节从人声文件对应位置开始播放，到小节末切断
//   VOX_OFFSET —— 第 1 小节第 1 拍在人声文件里的秒数
//   VOX_LEN    —— 人声文件时长（秒）
const VOX_OFFSET = 0.045;
const VOX_LEN = 361.0267;
const VOX_BEGIN = Array.from({ length: SONG_BARS }, (_, bar) => (VOX_OFFSET + bar * BAR) / VOX_LEN);
let vocals = s("vox").begin(slowcat(...VOX_BEGIN)).clip(1).release(.02);

// noise_bed — 全程的褐噪声底噪，音量随拍子平滑起伏，像水流
//   NOISE_SWELLS —— 每小节起伏几次（2 = 每两拍一次）
//   NOISE_GAIN   —— 起伏的峰值音量
//   NOISE_DEPTH  —— 起伏深度 0–1：0 = 完全平稳，越大越像一阵阵的浪
//   NOISE_LPF    —— 低通，调高更亮更"嘶"，调低更闷
//   NOISE_HPF    —— 高通，切掉低频轰隆声
//   NOISE_HISS   —— 叠一层不起伏的粉红噪声"嘶"声，0 = 不要
//   NOISE_XFADE  —— 每 4 小节接缝处的交叉淡化秒数
const NOISE_SWELLS = 2;
const NOISE_GAIN = .84;
const NOISE_DEPTH = .35;
const NOISE_LPF = 4000;
const NOISE_HPF = 150;
const NOISE_HISS = .04;
const NOISE_XFADE = .6;
let noise_bed = stack(
  s("brown").gain(NOISE_GAIN)
    .tremolosync(NOISE_SWELLS).tremolodepth(NOISE_DEPTH).tremoloshape("sine"),
  s("pink").gain(NOISE_HISS)
).slow(4).attack(NOISE_XFADE).release(NOISE_XFADE).lpf(NOISE_LPF).hpf(NOISE_HPF);

// glass — 轻敲玻璃的一声"叮"
//   出现在：第 4、8、12、16、20、28 小节的第 2 拍；第 56、60……124 小节的第 1 拍
//   GLASS_FREQ  —— 音高（Hz），越高越像薄玻璃，越低越像厚玻璃杯
//   GLASS_TICK  —— 敲击感（FM 深度）：越大音头越脆，0 = 只有纯音
//   GLASS_DECAY —— 一声的长短（秒）
//   GLASS_GAIN  —— 音量
const GLASS_FREQ = 2600;
const GLASS_TICK = 3;
const GLASS_DECAY = .06;
const GLASS_GAIN = 0.8;
const GLASS_ON_BEAT2 = [4, 8, 12, 16, 20, 28];
const GLASS_ON_BEAT1 = every(56, 124, 4);
let glass = onBars(GLASS_ON_BEAT1, GLASS_ON_BEAT2, s("[sine - - -]"), s("[- sine - -]"))
  .freq(GLASS_FREQ)
  .fm(GLASS_TICK).fmh(2.76).fmattack(.001).fmdecay(.03).fmsustain(0)
  .attack(.001).decay(GLASS_DECAY).sustain(0).release(.01)
  .hpf(400)
  .gain(GLASS_GAIN);

// sizzle — 坏灯泡通电的滋滋声 + 纸片燃烧的噼啪声（crackle 电火花 + fire 火焰录音）
//   出现在：和 glass 相同的位置，外加第 54–124 小节每 2 小节一次（第 1 拍），再整体提前 SIZZLE_LEAD 拍
//   SIZZLE_GAIN       —— 整层音量（不改变两层之间的比例）
//   SIZZLE_LEAD       —— 提前几拍开始：0 = 和 glass 同时
//   SIZZLE_SEC        —— 每声时长（秒），含淡入淡出
//   SIZZLE_FADE       —— 淡入淡出秒数，越短越像一下子通电、一下子断电
//   SIZZLE_DENSITY    —— 噼啪的密度：越大越密越"滋滋"，越小越像零星的火星
//   SIZZLE_ZAP        —— crackle 层音量（电流感）
//   SIZZLE_FIRE       —— fire 层音量（燃烧感）
//   SIZZLE_FIRE_SPEED —— fire 录音的播放速度：<1 放慢，噼啪间隔变长、音调变低
const SIZZLE_GAIN = 1.2;
const SIZZLE_LEAD = 2;
const SIZZLE_SEC = 2;
const SIZZLE_FADE = .3;
const SIZZLE_DENSITY = .05;
const SIZZLE_ZAP = .3;
const SIZZLE_FIRE = .5;
const SIZZLE_FIRE_SPEED = .5;
const SIZZLE_ON_BEAT2 = GLASS_ON_BEAT2;
const SIZZLE_ON_BEAT1 = every(54, 124, 2);
const SIZZLE_HOLD = (SIZZLE_SEC - SIZZLE_FADE) / (BAR / 4);  // 每声占一拍的格子，按拍数拉长
let sizzle = stack(
  onBars(SIZZLE_ON_BEAT1, SIZZLE_ON_BEAT2, s("[crackle - - -]"), s("[- crackle - -]"))
    .density(SIZZLE_DENSITY)
    .bpf(3000).bpq(1.5)
    .shape(.4)
    .gain(SIZZLE_ZAP),
  onBars(SIZZLE_ON_BEAT1, SIZZLE_ON_BEAT2, s("[fire - - -]"), s("[- fire - -]"))
    .speed(SIZZLE_FIRE_SPEED)
    .hpf(300).lpf(7000)
    .gain(SIZZLE_FIRE)
).clip(SIZZLE_HOLD)
  .early(SIZZLE_LEAD / 4)
  .attack(SIZZLE_FADE).release(SIZZLE_FADE)
  .room(.2).roomsize(3)
  .postgain(SIZZLE_GAIN)
  .orbit(12);

// ───────────── 编排 ─────────────
let instrumental = arrange(
  [ 4, intro],
  [ 8, intro_pad],
  [ 4, verse_1a],
  [ 4, break_1],
  [16, verse_1b],
  [ 8, verse_1c],
  [ 4, interlude],
  [12, breakdown],
  [ 8, groove_in],
  [16, groove],
  [ 8, hook_1],
  [16, verse_2],
  [16, hook_2],
  [20, bridge],
  [18, outro],
  [ 2, silence]  // 留给人声尾音，并让总长和人声一致（164 小节）
);

stack(instrumental, noise_bed, vocals, glass, sizzle)
  .theme("<emberText amberText>/2")
  .color("[#C83D2C #F5D397]")
  .punchcard({
    vertical: 1, flipTime: 1, fold: 0, stroke: 1,
    playheadColor: 'rgba(0, 0, 0, 0)', blur: 2.5,
  })
  ;
