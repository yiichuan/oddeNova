import source from './featured-after-hours.strudel.js?raw';

const ENGLISH_COMMENTS: Record<string, string> = {
  '109 BPM，4/4：一个 cycle 就是一小节': '109 BPM in 4/4: one cycle equals one bar',
  '───────────── 通用 ─────────────': '───────────── COMMON HELPERS ─────────────',
  '一小节的秒数': 'bar length in seconds',
  '附点八分音符的秒数，多数回声用它': 'dotted-eighth duration in seconds, used by most echoes',
  '等间隔的小节号：every(56, 124, 4) = 56, 60, …, 124': 'Evenly spaced bar numbers: every(56, 124, 4) = 56, 60, …, 124',
  '贯穿全曲的轨：在 beat1Bars 这些小节放 onBeat1，在 beat2Bars 这些小节放 onBeat2，其余小节静音':
    'A full-length track: use onBeat1 at beat1Bars, onBeat2 at beat2Bars, and silence elsewhere',
  '音符写成 "eb4:0.8" = 音高 eb4、力度 0.8（轨内相对力度，不写就是 1）。':
    'A note such as "eb4:0.8" means pitch eb4 at velocity 0.8 (relative to the track; default is 1).',
  'Strudel 会把冒号后的数字放进 n，这里挪到 velocity，免得被当成采样编号':
    'Strudel puts the value after the colon in n; move it to velocity so it is not read as a sample index',
  '不少乐器用单独的 orbit：混响大小、回声时间是按 orbit 共享的，分开才能各调各的':
    'Many instruments use separate orbits: reverb and delay time are shared per orbit, so separate orbits allow individual settings',
  '───────────── 键盘 / pad ─────────────': '───────────── KEYS / PADS ─────────────',
  'pulse — 电钢琴和弦，空间感强、悠远': 'pulse — spacious, distant electric-piano chords',
  'PULSE_GAIN    —— 音量': 'PULSE_GAIN — level',
  'PULSE_ROOM    —— 混响湿声量 0–1，越大越远越空': 'PULSE_ROOM — reverb mix (0–1); higher values sound more distant and spacious',
  'PULSE_LPF     —— 越低越远越朦胧，越高越清晰贴近': 'PULSE_LPF — lower is darker and more distant; higher is clearer and closer',
  'PULSE_RELEASE —— 松开后余音的秒数': 'PULSE_RELEASE — release time in seconds',
  'pad — 电钢琴铺底（升一个八度）': 'pad — electric-piano backing, transposed up one octave',
  'outropad — outro 的铺底：圆润的长音，从空间里慢慢浮起、慢慢散开（升一个八度）':
    'outropad — outro pad: rounded sustained notes that slowly emerge and fade, transposed up an octave',
  'OUTRO_GAIN    —— 音量': 'OUTRO_GAIN — level',
  'OUTRO_ATTACK  —— 音头浮起来的秒数：越长越不像弹奏，越短越接近"咚"':
    'OUTRO_ATTACK — fade-in time in seconds; longer feels less percussive, shorter feels more like a hit',
  'OUTRO_SHEEN   —— 泛音光泽（FM 深度）：0 = 纯正弦，调大更亮，太大会有颗粒感':
    'OUTRO_SHEEN — harmonic sheen (FM depth): 0 is a pure sine; higher is brighter, too high becomes gritty',
  'OUTRO_DECAY   —— 浮起来以后的衰减秒数': 'OUTRO_DECAY — decay time after the fade-in, in seconds',
  'OUTRO_RELEASE —— 松开后的余音秒数': 'OUTRO_RELEASE — release time in seconds',
  'OUTRO_ROOM    —— 混响湿声量 0–1': 'OUTRO_ROOM — reverb mix (0–1)',
  'koto — 古筝：远、虚、带电子感': 'koto — distant, hazy and electronic',
  'KOTO_LPF    —— 越低越闷越远': 'KOTO_LPF — lower is darker and more distant',
  'KOTO_HPF    —— 越高越薄越虚': 'KOTO_HPF — higher is thinner and more ethereal',
  'KOTO_ROOM   —— 混响湿声量 0–1': 'KOTO_ROOM — reverb mix (0–1)',
  'KOTO_PHASER —— 相位器深度 0–1，越大越电子，0 = 关闭':
    'KOTO_PHASER — phaser depth (0–1); higher is more electronic, 0 disables it',
  '───────────── 吉他 / 弦 ─────────────': '───────────── GUITARS / STRINGS ─────────────',
  'cleangtr — 清音电吉他：远、虚、空灵': 'cleangtr — distant, airy clean electric guitar',
  'GTR_LPF  —— 越低越远越虚': 'GTR_LPF — lower is more distant and hazy',
  'GTR_HPF  —— 越高越薄越轻': 'GTR_HPF — higher is thinner and lighter',
  'GTR_ROOM —— 混响湿声量 0–1': 'GTR_ROOM — reverb mix (0–1)',
  'acgtr — 原声吉他': 'acgtr — acoustic guitar',
  'strings — 弦乐：很大的空间 + 附点四分音符的长回声':
    'strings — spacious strings with long dotted-quarter echoes',
  'STRINGS_ROOM —— 混响湿声量 0–1': 'STRINGS_ROOM — reverb mix (0–1)',
  'STRINGS_ECHO —— 回声反馈 0–1，越大回声越多越长，超过 .7 左右会糊':
    'STRINGS_ECHO — delay feedback (0–1); higher adds longer echoes, but values above about 0.7 get muddy',
  'sitar — 西塔琴：大空间 + 附点八分回声': 'sitar — a large room with dotted-eighth echoes',
  'SITAR_ROOM —— 混响湿声量 0–1': 'SITAR_ROOM — reverb mix (0–1)',
  'SITAR_ECHO —— 回声反馈 0–1，越大回声越多越长，太大会糊':
    'SITAR_ECHO — delay feedback (0–1); higher adds longer echoes, too high gets muddy',
  'distgtr — 失真吉他：大空间 + 四分音符回声（和 sitar 的回声错开）':
    'distgtr — spacious distorted guitar with quarter-note echoes, offset from the sitar',
  'DIST_ROOM —— 混响湿声量 0–1': 'DIST_ROOM — reverb mix (0–1)',
  'DIST_ECHO —— 回声反馈 0–1': 'DIST_ECHO — delay feedback (0–1)',
  '───────────── 低音 ─────────────': '───────────── BASS ─────────────',
  'subbass — 纯正弦低音': 'subbass — pure sine sub-bass',
  'SUB_OCT  —— 升几个八度：0 = 原音区（C2 ≈ 65Hz，小喇叭基本放不出来），1 = C3 ≈ 130Hz':
    'SUB_OCT — octave shift: 0 keeps the original register (C2 ≈ 65Hz, hard to hear on small speakers); 1 raises it to C3 ≈ 130Hz',
  'SUB_GAIN —— 音量': 'SUB_GAIN — level',
  'HOOK_SUB_GAIN —— 两段副歌（八度叠音）用的音量，覆盖 SUB_GAIN':
    'HOOK_SUB_GAIN — level for the octave-doubled hooks; overrides SUB_GAIN',
  'bassgtr — 合成器 pad 式低音：单层三角波，音头"涌"上来，音和音连成一片':
    'bassgtr — pad-like synth bass: a single triangle wave with a swelling attack that connects notes',
  'BASS_LPF     —— 越高越亮，低于 ~800 会发闷': 'BASS_LPF — higher is brighter; below ~800 becomes muddy',
  'BASS_ATTACK  —— 音头涌上来的秒数，太大快速的经过音会听不清':
    'BASS_ATTACK — swell time in seconds; too long obscures fast passing notes',
  'BASS_RELEASE —— 音尾秒数，越大越连': 'BASS_RELEASE — release time; higher values sustain longer',
  'BASS_LEGATO  —— 音符长度倍数，1 = 原 MIDI 时值，2 左右基本填满休止':
    'BASS_LEGATO — note-length multiplier: 1 = MIDI duration, around 2 fills most gaps',
  'popsynth — 合成低音（supersaw）': 'popsynth — supersaw synth bass',
  'POP_GAIN —— 音量': 'POP_GAIN — level',
  'POP_OCT  —— 升几个八度：0 = 原音区，1 = 高一个八度，小喇叭上更清楚':
    'POP_OCT — octave shift: 0 keeps the original register; 1 raises it for better small-speaker clarity',
  '───────────── 合成器 ─────────────': '───────────── SYNTHS ─────────────',
  'pluck — 持续、饱满、带鼻音的"嗡"琶音': 'pluck — a sustained, full, nasal humming arpeggio',
  'PLUCK_LPF    —— 越低越闷越像"嗡"，越高越亮越像"哇"':
    'PLUCK_LPF — lower is darker and more humming; higher is brighter and more vowel-like',
  'PLUCK_Q      —— 共振，越大鼻音越重': 'PLUCK_Q — resonance; higher values sound more nasal',
  'PLUCK_DETUNE —— 各层跑调程度，越大越厚、颤动越明显，太大会走音':
    'PLUCK_DETUNE — voice detuning; higher sounds thicker and more wavering, too high goes out of tune',
  'PLUCK_ATTACK —— 音头软硬（秒），太大琶音会听不清':
    'PLUCK_ATTACK — attack time in seconds; too long obscures the arpeggio',
  'bitsine — 温暖、持续的"嗡"鸣，带一点颤音': 'bitsine — a warm, sustained hum with a little vibrato',
  'BIT_GAIN    —— 音量': 'BIT_GAIN — level',
  'BIT_HUM     —— 嗡鸣感（FM 深度），0 = 纯正弦': 'BIT_HUM — humming character (FM depth); 0 is a pure sine',
  'BIT_RATIO   —— 泛音比例：整数（1、2）是和谐的嗡鸣，非整数（3.5、1.4）会变成铃声':
    'BIT_RATIO — harmonic ratio: integers (1, 2) sound harmonious; non-integers (3.5, 1.4) sound bell-like',
  'BIT_ATTACK  —— 音头起来的秒数：越大越柔，越小越接近"咚"':
    'BIT_ATTACK — attack time; longer is softer, shorter sounds more like a hit',
  'BIT_SUSTAIN —— 按住时保持的音量 0–1，0 = 敲一下就衰减':
    'BIT_SUSTAIN — held level (0–1); 0 decays immediately after the hit',
  'BIT_LPF     —— 越低越闷越暗': 'BIT_LPF — lower is darker and more muted',
  'BIT_ROOM    —— 混响湿声量 0–1': 'BIT_ROOM — reverb mix (0–1)',
  '───────────── 鼓 ─────────────': '───────────── DRUMS ─────────────',
  'DRUMS_DRIVE —— 饱和量 0–1：越大越脆越有冲击力，太大会破':
    'DRUMS_DRIVE — saturation (0–1); higher is crisper and punchier, too high distorts',
  'drums — 707 鼓组': 'drums — 707 kit',
  'grooveInDrums — 混搭鼓组，按名字换成各鼓机的采样（表里没有的名字会播成别的同名采样）。':
    'grooveInDrums — a hybrid kit that maps names to drum-machine samples (unknown names fall back to same-named samples).',
  '采样名要用单引号：双引号字符串会被 Strudel 当成 mini-notation':
    'Use single-quoted sample names: Strudel treats double-quoted strings as mini-notation',
  'perc — 808 打击乐（cp、rim、hh）': 'perc — 808 percussion (cp, rim, hh)',
  'openhat — 909 开镲': 'openhat — 909 open hat',
  'crash — 606 吊镲，余音拉长': 'crash — 606 crash with an extended tail',
  'CRASH_GAIN  —— 音量': 'CRASH_GAIN — level',
  'CRASH_SPEED —— 播放速度：<1 放慢，余音变长、音高略降、更厚；太低会发闷':
    'CRASH_SPEED — playback speed: <1 slows and deepens it, extending the tail; too low gets muddy',
  'CRASH_ROOM  —— 混响湿声量 0–1': 'CRASH_ROOM — reverb mix (0–1)',
  'CRASH_SIZE  —— 混响空间大小，越大尾巴越长': 'CRASH_SIZE — room size; higher values extend the tail',
  '───────────── 音效 ─────────────': '───────────── SOUND EFFECTS ─────────────',
  'riser(bars) — 起飞音效：粉红噪声由暗到亮、由弱到强，落在 bars 小节长段落的最后一小节，':
    'riser(bars) — a pink-noise sweep grows brighter and louder, landing in the final bar of a section of length bars,',
  '结束在下一段的第一拍': 'ending on the first beat of the next section',
  'RISER_GAIN  —— 最终峰值音量': 'RISER_GAIN — peak level',
  'RISER_SWEEP —— 滤波打开的幅度，越大最后越亮':
    'RISER_SWEEP — filter-opening range; higher values make the ending brighter',
  'RISER_LEN   —— 时长（16 分音符个数，16 = 1 小节）；加大是更早开始，结束点不变':
    'RISER_LEN — duration in sixteenth-note steps (16 = one bar); higher starts earlier while the end stays fixed',
  'revriser(bars) — 一段均匀的粉红噪声，占住段落第一小节的前 3 拍':
    'revriser(bars) — steady pink noise fills the first three beats of a section’s opening bar',
  'REVRISER_GAIN —— 音量': 'REVRISER_GAIN — level',
  'REVRISER_LPF  —— 低通：越低越暗越闷，20000 = 不切':
    'REVRISER_LPF — low-pass: lower is darker and muddier; 20000 leaves it unfiltered',
  '───────────── 段落 ─────────────': '───────────── SECTIONS ─────────────',
  '段落里 `<A!4 B>` = A 连续 4 小节，然后 B 一小节；`-` = 这一小节静音':
    'In a section, `<A!4 B>` means A repeats for four bars, then B for one; `-` means one bar of silence',
  'intro · 第 1–4 小节 · 古筝': 'intro · bars 1–4 · koto',
  'intro_pad · 第 5–12 小节 · 起飞音效、古筝、电钢琴铺底':
    'intro_pad · bars 5–12 · riser, koto and electric-piano pad',
  'verse_1a · 第 13–16 小节 · 鼓、打击乐': 'verse_1a · bars 13–16 · drums and percussion',
  'break_1 · 第 17–20 小节 · 清音电吉他、原声吉他':
    'break_1 · bars 17–20 · clean electric and acoustic guitars',
  'verse_1b · 第 21–36 小节 · 正弦低音、清音电吉他、鼓、打击乐':
    'verse_1b · bars 21–36 · sine sub, clean electric guitar, drums and percussion',
  'verse_1c · 第 37–44 小节 · 正弦低音、清音电吉他、原声吉他、合成拨弦、鼓':
    'verse_1c · bars 37–44 · sine sub, clean electric and acoustic guitars, synth pluck and drums',
  'interlude · 第 45–48 小节 · 古筝（比 intro 更空灵、更远）':
    'interlude · bars 45–48 · koto, more ethereal and distant than the intro',
  'INTERLUDE_GAIN —— 干声音量，越小越远': 'INTERLUDE_GAIN — dry level; lower sounds more distant',
  'INTERLUDE_LPF  —— 越低越远越虚': 'INTERLUDE_LPF — lower is more distant and hazy',
  'INTERLUDE_ROOM —— 混响湿声量 0–1': 'INTERLUDE_ROOM — reverb mix (0–1)',
  'INTERLUDE_ECHO —— 回声反馈 0–1，越大余音越长，太大会糊':
    'INTERLUDE_ECHO — delay feedback (0–1); higher makes longer tails, too high gets muddy',
  'breakdown · 第 49–60 小节 · 起飞音效、电钢琴铺底、清音电吉他、原声吉他、弦乐':
    'breakdown · bars 49–60 · riser, electric-piano pad, clean electric and acoustic guitars, strings',
  'groove_in · 第 61–68 小节 · 电钢琴铺底、清音电吉他、弦乐、低音、鼓、打击乐、吊镲':
    'groove_in · bars 61–68 · electric-piano pad, clean guitar, strings, bass, drums, percussion and crash',
  'groove · 第 69–84 小节 · 清音电吉他、低音、鼓、打击乐、吊镲':
    'groove · bars 69–84 · clean electric guitar, bass, drums, percussion and crash',
  'hook_1 · 第 85–92 小节 · 正弦低音、合成低音、鼓、打击乐、开镲、吊镲':
    'hook_1 · bars 85–92 · sine sub, synth bass, drums, percussion, open hat and crash',
  'verse_2 · 第 93–108 小节 · 清音电吉他、原声吉他、低音、8-bit 正弦、鼓、打击乐、开镲、吊镲':
    'verse_2 · bars 93–108 · clean electric and acoustic guitars, bass, 8-bit sine, drums, percussion, open hat and crash',
  'hook_2 · 第 109–124 小节 · 粉红噪声、正弦低音、原声吉他、合成低音、鼓、打击乐':
    'hook_2 · bars 109–124 · pink noise, sine sub, acoustic guitar, synth bass, drums and percussion',
  'bridge · 第 125–144 小节 · 电钢琴和弦、电钢琴铺底、弦乐、8-bit 正弦、西塔琴、失真吉他':
    'bridge · bars 125–144 · electric-piano chords and pad, strings, 8-bit sine, sitar and distorted guitar',
  'outro · 第 145–162 小节 · outro 铺底': 'outro · bars 145–162 · outro pad',
  '───────────── 贯穿全曲的轨 ─────────────': '───────────── FULL-LENGTH TRACKS ─────────────',
  'vocals — 原曲人声：每小节从人声文件对应位置开始播放，到小节末切断':
    'vocals — original vocal: play the matching position from the recording each bar, cutting off at the bar line',
  'VOX_OFFSET —— 第 1 小节第 1 拍在人声文件里的秒数':
    'VOX_OFFSET — seconds into the vocal file at beat 1 of bar 1',
  'VOX_LEN    —— 人声文件时长（秒）': 'VOX_LEN — vocal-file duration in seconds',
  'noise_bed — 全程的褐噪声底噪，音量随拍子平滑起伏，像水流':
    'noise_bed — a continuous brown-noise bed that swells smoothly with the beat, like flowing water',
  'NOISE_SWELLS —— 每小节起伏几次（2 = 每两拍一次）':
    'NOISE_SWELLS — swells per bar (2 = once every two beats)',
  'NOISE_GAIN   —— 起伏的峰值音量': 'NOISE_GAIN — peak swell level',
  'NOISE_DEPTH  —— 起伏深度 0–1：0 = 完全平稳，越大越像一阵阵的浪':
    'NOISE_DEPTH — swell depth (0–1): 0 is steady; higher values feel more wave-like',
  'NOISE_LPF    —— 低通，调高更亮更"嘶"，调低更闷':
    'NOISE_LPF — low-pass; higher is brighter and hissier, lower is darker',
  'NOISE_HPF    —— 高通，切掉低频轰隆声': 'NOISE_HPF — high-pass, removing low rumble',
  'NOISE_HISS   —— 叠一层不起伏的粉红噪声"嘶"声，0 = 不要':
    'NOISE_HISS — steady pink-noise hiss layered on top; 0 disables it',
  'NOISE_XFADE  —— 每 4 小节接缝处的交叉淡化秒数':
    'NOISE_XFADE — crossfade time in seconds at each four-bar seam',
  'glass — 轻敲玻璃的一声"叮"': 'glass — a brief, glass-like ping',
  '出现在：第 4、8、12、16、20、28 小节的第 2 拍；第 56、60……124 小节的第 1 拍':
    'Appears on beat 2 of bars 4, 8, 12, 16, 20 and 28, and beat 1 of bars 56, 60, …, 124',
  'GLASS_FREQ  —— 音高（Hz），越高越像薄玻璃，越低越像厚玻璃杯':
    'GLASS_FREQ — pitch (Hz); higher sounds like thin glass, lower like a thick glass',
  'GLASS_TICK  —— 敲击感（FM 深度）：越大音头越脆，0 = 只有纯音':
    'GLASS_TICK — impact (FM depth); higher is sharper, 0 is a pure tone',
  'GLASS_DECAY —— 一声的长短（秒）': 'GLASS_DECAY — hit length in seconds',
  'GLASS_GAIN  —— 音量': 'GLASS_GAIN — level',
  'sizzle — 坏灯泡通电的滋滋声 + 纸片燃烧的噼啪声（crackle 电火花 + fire 火焰录音）':
    'sizzle — a buzzing bulb and burning-paper crackle (electrical sparks plus a fire recording)',
  '出现在：和 glass 相同的位置，外加第 54–124 小节每 2 小节一次（第 1 拍），再整体提前 SIZZLE_LEAD 拍':
    'Appears with glass, plus beat 1 every two bars from 54–124, shifted earlier by SIZZLE_LEAD beats',
  'SIZZLE_GAIN       —— 整层音量（不改变两层之间的比例）':
    'SIZZLE_GAIN — overall level, preserving the balance between its two layers',
  'SIZZLE_LEAD       —— 提前几拍开始：0 = 和 glass 同时':
    'SIZZLE_LEAD — lead-in in beats; 0 starts with glass',
  'SIZZLE_SEC        —— 每声时长（秒），含淡入淡出':
    'SIZZLE_SEC — duration per hit in seconds, including fades',
  'SIZZLE_FADE       —— 淡入淡出秒数，越短越像一下子通电、一下子断电':
    'SIZZLE_FADE — fade time; shorter sounds more abruptly switched on and off',
  'SIZZLE_DENSITY    —— 噼啪的密度：越大越密越"滋滋"，越小越像零星的火星':
    'SIZZLE_DENSITY — crackle density; higher is busier, lower leaves sparse sparks',
  'SIZZLE_ZAP        —— crackle 层音量（电流感）': 'SIZZLE_ZAP — crackle-layer level (electrical bite)',
  'SIZZLE_FIRE       —— fire 层音量（燃烧感）': 'SIZZLE_FIRE — fire-layer level (burning texture)',
  'SIZZLE_FIRE_SPEED —— fire 录音的播放速度：<1 放慢，噼啪间隔变长、音调变低':
    'SIZZLE_FIRE_SPEED — fire playback speed; <1 slows it down, widening crackle gaps and lowering pitch',
  '每声占一拍的格子，按拍数拉长': 'grid steps per hit, stretched to the requested number of beats',
  '───────────── 编排 ─────────────': '───────────── ARRANGEMENT ─────────────',
  '留给人声尾音，并让总长和人声一致（164 小节）':
    'leave room for the vocal tail and match its total length (164 bars)',
};

function translateComment(line: string): string {
  const marker = line.indexOf('//');
  if (marker < 0) return line;

  const commentStart = marker + 2;
  const comment = line.slice(commentStart).trim();
  const translation = ENGLISH_COMMENTS[comment];
  if (!translation) return line;

  const spacing = line.slice(commentStart).match(/^\s*/)?.[0] ?? '';
  return `${line.slice(0, commentStart)}${spacing}${translation}`;
}

export const AFTER_HOURS_CODE_ZH = source;
export const AFTER_HOURS_CODE_EN = source.split('\n').map(translateComment).join('\n');
