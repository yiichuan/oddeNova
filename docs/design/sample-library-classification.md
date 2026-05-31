# 采样库分类文档

本文档对 oddeNova 所有支持的采样库进行整理，Tidal Drum Machines 按 **Bank（鼓机型号）** 聚合展示可用鼓件，并附汇总统计。

## 数据来源

| 库名 | 来源 | 条目数 | 说明 |
|------|------|--------|------|
| Strudel Dirt Samples | `sample_library/strudel.md` | 218 | 综合采样，含鼓机、合成器、环境音等 |
| Tidal Drum Machines | `sample_library/tidal-drum-machines.md` | 683 | 71 台经典硬件鼓机采样 |
| GM Soundfonts | `src/lib/gm-fonts.js` | 128 | 通用 MIDI 128 种标准乐器音色 |
| VCSL | dough-samples/vcsl.json | ~80 | 维也纳交响乐团社区版真实乐器录音 |
| Mridangam | dough-samples/mridangam.json | 13 | 南印度姆里当甘鼓 |
| Melodic Samples | 内置 | 10 | 基础旋律采样（piano / sax / gtr 等） |
| **合计** | — | **~1130+** | — |

---

## 二、GM Soundfonts — 通用 MIDI 实际乐器

通过 `registerSoundfonts()` 加载（见 `src/lib/soundfont-loader.ts`）。使用方式：

```js
note("c4 e4 g4").s("gm_piano")
note("a3 b3 c4").s("gm_violin")
n("0 2 4 7").scale("C:minor").s("gm_flute")
```

> 注意：strudel 使用简化名称，如 `gm_piano`（不是 `gm_acoustic_grand_piano`）、`gm_epiano1`（不是 `gm_electric_piano_1`）。

### 🎹 键盘乐器（Piano / Keys）

| 采样名 | 乐器 |
|--------|------|
| `gm_piano` | 大钢琴（含 Acoustic Grand / Bright / Electric Grand / Honky-Tonk） |
| `gm_epiano1` | 电钢琴 1（Rhodes 风格） |
| `gm_epiano2` | 电钢琴 2（DX7 风格） |
| `gm_harpsichord` | 拨弦古钢琴 |
| `gm_clavinet` | 克拉维内特 |

### 🔔 色彩打击乐（Chromatic Percussion）

| 采样名 | 乐器 |
|--------|------|
| `gm_celesta` | 钢片琴 |
| `gm_glockenspiel` | 钟琴 |
| `gm_music_box` | 音乐盒 |
| `gm_vibraphone` | 颤音琴 |
| `gm_marimba` | 马林巴木琴 |
| `gm_xylophone` | 木琴 |
| `gm_tubular_bells` | 管钟 |
| `gm_dulcimer` | 扬琴 |

### 🎹 风琴（Organ）

| 采样名 | 乐器 |
|--------|------|
| `gm_drawbar_organ` | 拉杆风琴（Hammond 风格） |
| `gm_percussive_organ` | 打击式风琴 |
| `gm_rock_organ` | 摇滚风琴 |
| `gm_church_organ` | 教堂管风琴 |
| `gm_reed_organ` | 簧片风琴 |
| `gm_accordion` | 手风琴 |
| `gm_harmonica` | 口琴 |
| `gm_bandoneon` | 班多钮手风琴 |

### 🎸 吉他（Guitar）

| 采样名 | 乐器 |
|--------|------|
| `gm_acoustic_guitar_nylon` | 尼龙弦古典吉他 |
| `gm_acoustic_guitar_steel` | 钢弦民谣吉他 |
| `gm_electric_guitar_jazz` | 爵士电吉他 |
| `gm_electric_guitar_clean` | 清音电吉他 |
| `gm_electric_guitar_muted` | 闷音电吉他 |
| `gm_overdriven_guitar` | 过载电吉他 |
| `gm_distortion_guitar` | 失真电吉他 |
| `gm_guitar_harmonics` | 吉他泛音 |

### 🎸 贝斯（Bass）

| 采样名 | 乐器 |
|--------|------|
| `gm_acoustic_bass` | 原声贝斯 |
| `gm_electric_bass_finger` | 手指拨弦电贝斯 |
| `gm_electric_bass_pick` | 拨片电贝斯 |
| `gm_fretless_bass` | 无品贝斯 |
| `gm_slap_bass_1` | 扇打贝斯 1 |
| `gm_slap_bass_2` | 扇打贝斯 2 |
| `gm_synth_bass_1` | 合成贝斯 1 |
| `gm_synth_bass_2` | 合成贝斯 2 |

### 🎻 弦乐（Strings）

| 采样名 | 乐器 |
|--------|------|
| `gm_violin` | 小提琴 |
| `gm_viola` | 中提琴 |
| `gm_cello` | 大提琴 |
| `gm_contrabass` | 低音提琴 |
| `gm_tremolo_strings` | 弦乐震音 |
| `gm_pizzicato_strings` | 弦乐拨奏 |
| `gm_orchestral_harp` | 竖琴 |
| `gm_timpani` | 定音鼓 |

### 🎶 弦乐合奏 / 合唱（Ensemble）

| 采样名 | 乐器 |
|--------|------|
| `gm_string_ensemble_1` | 弦乐合奏 1 |
| `gm_string_ensemble_2` | 弦乐合奏 2 |
| `gm_synth_strings_1` | 合成弦乐 1 |
| `gm_synth_strings_2` | 合成弦乐 2 |
| `gm_choir_aahs` | 合唱（Aah） |
| `gm_voice_oohs` | 人声（Ooh） |
| `gm_synth_choir` | 合成人声合唱 |
| `gm_orchestra_hit` | 管弦乐击音 |

### 🎺 铜管乐器（Brass）

| 采样名 | 乐器 |
|--------|------|
| `gm_trumpet` | 小号 |
| `gm_trombone` | 长号 |
| `gm_tuba` | 大号 |
| `gm_muted_trumpet` | 弱音小号 |
| `gm_french_horn` | 圆号 |
| `gm_brass_section` | 铜管乐组 |
| `gm_synth_brass_1` | 合成铜管 1 |
| `gm_synth_brass_2` | 合成铜管 2 |

### 🎷 木管乐器（Reed / Woodwind）

| 采样名 | 乐器 |
|--------|------|
| `gm_soprano_sax` | 高音萨克斯 |
| `gm_alto_sax` | 中音萨克斯 |
| `gm_tenor_sax` | 次中音萨克斯 |
| `gm_baritone_sax` | 上低音萨克斯 |
| `gm_oboe` | 双簧管 |
| `gm_english_horn` | 英国管 |
| `gm_bassoon` | 巴松管 |
| `gm_clarinet` | 单簧管 |

### 🪈 管乐（Pipe）

| 采样名 | 乐器 |
|--------|------|
| `gm_piccolo` | 短笛 |
| `gm_flute` | 长笛 |
| `gm_recorder` | 竖笛 |
| `gm_pan_flute` | 排箫 |
| `gm_blown_bottle` | 吹瓶声 |
| `gm_shakuhachi` | 尺八（日本竹笛） |
| `gm_whistle` | 口哨 |
| `gm_ocarina` | 陶笛 |

### 🎹 合成音色 Lead / Pad / FX

| 采样名 | 音色 |
|--------|------|
| `gm_lead_1_square` ~ `gm_lead_8_bass_lead` | 8 种 Lead 合成音色 |
| `gm_pad_new_age` ~ `gm_pad_sweep` | 8 种 Pad 垫音音色 |
| `gm_fx_rain` ~ `gm_fx_sci_fi` | 8 种合成特效音色 |

### 🌍 民族乐器（Ethnic）

| 采样名 | 乐器 |
|--------|------|
| `gm_sitar` | 印度西塔琴 |
| `gm_banjo` | 班卓琴 |
| `gm_shamisen` | 三味线 |
| `gm_koto` | 筝（日本古筝） |
| `gm_kalimba` | 卡林巴（非洲拇指琴） |
| `gm_bagpipe` | 风笛 |
| `gm_fiddle` | 民间提琴 |
| `gm_shanai` | 沙奈（印度双簧管） |

### 🥁 GM 打击乐器（Percussive）

| 采样名 | 乐器 |
|--------|------|
| `gm_tinkle_bell` | 铃铛 |
| `gm_agogo` | 阿戈戈铃 |
| `gm_steel_drums` | 钢鼓（加勒比钢鼓） |
| `gm_woodblock` | 木鱼 |
| `gm_taiko_drum` | 太鼓 |
| `gm_melodic_tom` | 旋律嗵鼓 |
| `gm_synth_drum` | 合成鼓 |
| `gm_reverse_cymbal` | 反转镲 |

---

## 三、VCSL — 维也纳交响乐团真实录音

来源：`dough-samples/vcsl.json`（CC0 许可），真实乐器多力度多奏法录音。

### 🎹 键盘 / 钢琴（Piano / Keyboard）

`kawai` `steinway` `piano1` `clavisynth` `fmpiano`

### 🎻 弦乐（Strings / Plucked）

`harp` `folkharp` `strumstick` `dantranh`（越南箏） `dantranh_tremolo` `dantranh_vibrato` `psaltery_pluck` `psaltery_spiccato` `psaltery_bow`

### 🎷 管乐（Wind）

`recorder_alto_stacc` `recorder_alto_vib` `recorder_alto_sus`
`recorder_bass_stacc`
`recorder_soprano_stacc` `recorder_soprano_sus`
`recorder_tenor_stacc` `recorder_tenor_sus`
`ocarina` `ocarina_small` `ocarina_small_stacc` `ocarina_vib`
`harmonica` `harmonica_soft` `super64` `didgeridoo`
`saxello` `saxello_stacc` `saxello_vib` `sax_stacc` `sax_vib`

### 🎹 风琴（Organ / Pipe）

`pipeorgan_loud` `pipeorgan_loud_pedal` `pipeorgan_quiet` `pipeorgan_quiet_pedal`
`organ_4inch` `organ_8inch` `organ_full`

### 🔔 打击乐 / 音色打击乐（Tuned / Untuned Percussion）

`vibraphone` `vibraphone_soft` `vibraphone_bowed`
`xylophone` `xylophone_soft`
`marimba`
`tubularbells` `tubularbells2`
`kalimba` `kalimba2` `kalimba3` `kalimba4` `kalimba5`
`balafon`

### 🥁 管弦鼓（Orchestral Drums）

`timpani` `timpani_roll` `timpani2`
`bassdrum1` `bassdrum2`
`snare_hi` `snare_low` `snare_rim`
`tom_mallet` `tom_stick` `tom_rim`
`tom2_mallet` `tom2_stick` `tom2_rim`

### 🪘 世界打击乐（World Percussion）

`bongo` `conga` `darbuka` `framedrum`

### 🎵 效果器 / 其他

`wineglass` `brakedrum` `belltree` `clash1` `clash2` `cowbell`
`fingercymbal` `flexatone` `gong` `gong2` `handbells` `handchimes`
`hihat_cymbal` `sus_cymbal` `sus_cymbal2` `tambourine1` `tambourine2` `triangles`
`shaker_large` `shaker_small` `slapstick` `sleighbells` `oceandrum` `marktrees`
`ballwhistle` `trainwhistle` `siren`

---

## 四、Mridangam — 南印度传统鼓

来源：`dough-samples/mridangam.json`。共 13 种击打音色，对应姆里当甘鼓不同的击打手法：

`gumki` `ka` `nam` `ta` `ki` `dhin` `na` `chaapu` `dhum` `ardha` `thom` `dhi` `tha`

---

## 五、旋律采样（Melodic Samples）

系统提示词中明确列出的基础旋律采样，加载自 Strudel 内置及 `piano.json`：

| 采样名 | 音色说明 |
|--------|---------|
| `piano` | 钢琴 |
| `arpy` | 琶音音色 |
| `bass` | 贝斯 |
| `moog` | Moog 合成器 |
| `juno` | Roland Juno 合成器 |
| `sax` | 萨克斯 |
| `gtr` | 吉他 |
| `pluck` | 拨弦音色 |
| `sitar` | 西塔琴 |
| `stab` | Stab 刺音 |

---

## 六、Strudel Dirt Samples — 综合电子采样

### 部件缩写说明

| 缩写 | 含义 |
|------|------|
| `bd` | 底鼓（Bass Drum） |
| `sd` | 军鼓（Snare Drum） |
| `hh` | 踩镲—闭合（Closed Hi-Hat） |
| `oh` | 踩镲—开放（Open Hi-Hat） |
| `ht` | 高嗵（High Tom） |
| `mt` | 中嗵（Mid Tom） |
| `lt` | 低嗵（Low Tom） |
| `cp` | 拍手（Clap） |
| `cr` | 碎音镲（Crash Cymbal） |
| `rd` | 叮叮镲（Ride Cymbal） |
| `rim` | 边击（Rim Shot） |
| `cb` | 牛铃（Cowbell） |
| `sh` | 沙锤（Shaker） |
| `tb` | 铃鼓（Tambourine） |
| `perc` | 打击乐（Percussion） |
| `misc` | 杂项 |
| `fx` | 音效（Effects） |

---

### 🥁 底鼓 / 踢鼓（Kick / Bass Drum）

`808bd` `bd` `bassdm` `clubkick` `hardkick` `kicklinn` `popkick` `reverbkick`

### 🥁 军鼓（Snare Drum）

`808sd` `sd` `sn`

### 🎵 踩镲（Hi-Hat）

`808hc`（闭合） `808oh`（开放） `hh` `hh27` `hc` `ho` `linnhats`

### 🎵 镲片（Cymbal）

`808cy`（拍镲） `cr`（碎音镲）

### 🥁 嗵鼓（Tom-Tom）

`808ht`（高嗵） `808lt`（低嗵） `808mt`（中嗵） `808mc`（中康加） `808lc`（低康加） `ht` `lt` `mt`

### 👏 拍手 / 打击（Clap / Snappy）

`cp` `realclaps` `cb`（牛铃） `rm`（边击） `rs`

### 🪘 手打 / 民族打击乐（Hand / World Percussion）

`tabla` `tabla2` `tablex` `hand` `perc` `peri` `clak` `click` `glasstap` `tink` `tok` `stomp` `pebbles` `can` `bottle` `coins`

### 🎸 节奏循环 / Breaks（Drum Loops / Breakbeats）

`amencutup` `breaks125` `breaks152` `breaks157` `breaks165` `drum` `drumtraks` `dr` `dr2` `dr55` `dr_few` `gretsch` `ifdrums` `jungle`

### 🎹 合成器贝斯（Synth Bass）

`bass` `bass0` `bass1` `bass2` `bass3` `bassfoo` `jungbass` `jvbass` `hoover`

### 🎹 合成器音色（Synth Lead / Pad / Keys）

`juno` `moog` `casio` `psr` `fm` `arpy` `arp` `pad` `padlong` `bleep` `blip` `stab` `pluck` `simplesine` `sid` `monsterb`

### 🎷 管乐（Wind / Brass）

`sax`

### 🎸 弦拨乐器（String / Plucked）

`sitar` `gtr`

### 🎵 钢琴 / 键盘（Piano / Keys）

`jazz`

### 🗣 人声 / 语音（Vocals / Speech）

`speech` `speakspell` `speechless` `diphone` `diphone2` `mouth` `alphabet` `numbers` `num` `trump` `hmm` `yeah` `kurt` `bev` `erk` `koy` `crow`

### 🌿 自然 / 环境音（Nature / Ambient）

`birds` `birds3` `wind` `insect` `fire` `outdoor` `breath` `bubble` `space`

### ⚡ 电子特效 / 故障音（Electronic FX / Glitch）

`glitch` `glitch2` `noise` `noise2` `dist` `industrial` `metal` `wobble` `speedupdown` `flick`

### 🕹 复古游戏音效（8-bit / Arcade）

`invaders` `tacscan` `subroc3d` `casio`

### 🎧 电子音乐风格（Genre Samples）

`gabba` `gabbaloud` `gabbalouder` `gab` `rave` `rave2` `ravemono` `hardcore` `house` `techno` `tech` `electro1` `hoover`

### 📦 杂项（Miscellaneous）

`_808` `_909` `ab` `ade` `ades2` `ades3` `ades4` `alex` `armora` `auto` `baa` `baa2` `battles` `bend` `bin` `blue` `cc` `chin` `circus` `co` `control` `cosmicg` `d` `db` `e` `east` `em2` `f` `feel` `feelfx` `fest` `foo` `future` `h` `haw` `hit` `if` `incoming` `latibro` `led` `less` `lighter` `made` `made2` `mash` `mash2` `miniyeah` `mp3` `msg` `mute` `newnotes` `notes` `oc` `odx` `off` `print` `proc` `procshort` `seawolf` `sequential` `sf` `sheffield` `short` `sugar` `sundance` `toys` `ul` `ulgab` `uxay` `v` `voodoo` `world` `xmas`

---

## 七、Tidal Drum Machines — 按 Bank 聚合

共收录 **71 台**经典硬件鼓机，按厂商分组展示。

表中 **●** 表示该 bank 包含对应鼓件采样。

列顺序：`bd` / `sd` / `hh` / `oh` / `ht` / `mt` / `lt` / `cp` / `cr` / `rd` / `rim` / `cb` / `sh` / `tb` / `perc` / `misc` / `fx` / **总计**

---

### AJK

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| AJKPercusyn | ● | ● | | | ● | | | | | | | ● | | | | | | **4** |

---

### Akai

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| AkaiLinn | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | | ● | ● | ● | | | | **13** |
| AkaiMPC60 | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | | | | ● | ● | | **13** |
| AkaiXR10 | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | | **16** |
| MPC1000 | ● | ● | ● | ● | | | | ● | | | | | ● | | ● | | | **7** |

---

### Alesis

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| AlesisHR16 | ● | ● | ● | ● | ● | | ● | ● | | | ● | | ● | | ● | | | **10** |
| AlesisSR16 | ● | ● | ● | ● | | | | ● | ● | ● | ● | ● | ● | ● | ● | ● | | **13** |

---

### Boss（Roland 旗下品牌）

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| BossDR55 | ● | ● | ● | | | | | | | | ● | | | | | | | **4** |
| BossDR110 | ● | ● | ● | ● | | | | ● | ● | ● | | | | | | | | **7** |
| BossDR220 | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | | | | | ● | | | **11** |
| BossDR550 | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | | **16** |

---

### Casio

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| CasioRZ1 | ● | ● | ● | | ● | ● | ● | ● | ● | ● | ● | ● | | | | | | **11** |
| CasioSK1 | ● | ● | ● | ● | ● | ● | | | | | | | | | | | | **6** |
| CasioVL1 | ● | ● | ● | | | | | | | | | | | | | | | **3** |
| XdrumLM8953 | ● | ● | ● | ● | ● | ● | ● | | ● | ● | ● | | | ● | | | | **11** |

---

### Doepfer

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| DoepferMS404 | ● | ● | ● | ● | | | ● | | | | | | | | | | | **5** |

---

### E-mu

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| EmuDrumulator | ● | ● | ● | ● | ● | ● | ● | ● | ● | | ● | ● | | | ● | | | **12** |
| EmuModular | ● | | | | | | | | | | | | | | ● | ● | | **3** |
| EmuSP12 | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | | | ● | ● | | **14** |

---

### Korg

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| KorgDDM110 | ● | ● | ● | ● | ● | | ● | ● | ● | | ● | | | | | | | **9** |
| KorgKPR77 | ● | ● | ● | ● | | | | ● | | | | | | | | | | **5** |
| KorgKR55 | ● | ● | ● | ● | ● | | | | ● | | ● | ● | | | ● | | | **9** |
| KorgKRZ | ● | ● | ● | ● | ● | | ● | | ● | ● | | | | | | ● | ● | **10** |
| KorgM1 | ● | ● | ● | ● | ● | ● | | ● | ● | ● | ● | ● | ● | ● | ● | ● | | **15** |
| KorgMinipops | ● | ● | ● | ● | | | | | | | | | | | | ● | | **5** |
| KorgPoly800 | ● | | | | | | | | | | | | | | | | | **1** |
| KorgT3 | ● | ● | ● | ● | | | | ● | | | ● | | ● | | ● | ● | | **9** |

---

### Linn

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| LinnLM1 | ● | ● | ● | ● | ● | | ● | ● | | | ● | ● | ● | ● | ● | | | **12** |
| LinnLM2 | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | | | | **14** |
| LinnDrum | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | | | **15** |
| Linn9000 | ● | ● | ● | ● | ● | ● | ● | | ● | ● | ● | ● | | ● | ● | | | **13** |

---

### MFB

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| MFB512 | ● | ● | ● | ● | ● | ● | ● | ● | ● | | | | | | | | | **9** |

---

### Moog

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| MoogConcertMateMG1 | ● | ● | | | | | | | | | | | | | | | | **2** |

---

### Oberheim

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| OberheimDMX | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | | ● | ● | | | | **13** |

---

### Rhodes / Ace Tone

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| RhodesPolaris | ● | ● | | | | | | | | | | | | | | ● | | **3** |
| RhythmAce | ● | ● | ● | ● | ● | | ● | | | | | | | | ● | | | **7** |

---

### Roland

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| RolandCompurhythm78 | ● | ● | ● | ● | | | | | | | | ● | | ● | ● | ● | | **8** |
| RolandCompurhythm1000 | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | | | ● | | | **13** |
| RolandCompurhythm8000 | ● | ● | ● | ● | ● | ● | ● | ● | ● | | ● | ● | | | ● | | | **12** |
| RolandSystem100 | ● | ● | ● | ● | | | | | | | | | | | ● | ● | | **6** |
| RolandSH09 | ● | | | | | | | | | | | | | | | | | **1** |
| RolandDDR30 | ● | ● | | | ● | | ● | | | | | | | | | | | **4** |
| RolandMC202 | ● | | | | ● | | | | | | | | | | ● | | | **3** |
| RolandMC303 | ● | ● | ● | ● | ● | ● | ● | ● | | ● | ● | ● | ● | ● | ● | ● | ● | **16** |
| RolandD110 | ● | ● | ● | ● | | | ● | | ● | ● | ● | ● | ● | ● | ● | | | **12** |
| RolandD70 | ● | ● | ● | ● | | ● | ● | ● | ● | ● | ● | ● | ● | | ● | | | **13** |
| RolandMT32 | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | | | **15** |
| RolandS50 | ● | ● | | ● | ● | ● | ● | ● | ● | ● | | ● | ● | ● | ● | ● | | **14** |
| RolandJD990 | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | | ● | | ● | ● | ● | | **14** |
| RolandR8 | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | | | **15** |
| RolandTR505 | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | | | ● | | | **13** |
| RolandTR606 | ● | ● | ● | ● | ● | | ● | | ● | | | | | | | | | **7** |
| RolandTR626 | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | | | **15** |
| RolandTR707 | ● | ● | ● | ● | ● | ● | ● | ● | ● | | ● | ● | | ● | | | | **12** |
| RolandTR727 | | | | | | | | | | | | | ● | | ● | | | **2** |
| RolandTR808 | ● | ● | ● | ● | ● | ● | ● | ● | ● | | ● | ● | ● | | ● | | | **13** |
| RolandTR909 | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | | | | | | | **11** |

---

### Sakata

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| SakataDPM48 | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | | ● | | ● | | | **13** |

---

### Sequential Circuits

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| SequentialCircuitsDrumtracks | ● | ● | ● | ● | ● | | | ● | ● | ● | ● | ● | ● | ● | | | | **12** |
| SequentialCircuitsTom | ● | ● | ● | ● | ● | | | ● | ● | | | | | | | | | **7** |

---

### Serge

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| SergeModular | ● | | | | | | | | | | | | | | ● | ● | | **3** |

---

### Simmons

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| SimmonsSDS400 | | ● | | | ● | ● | ● | | | | | | | | | | | **4** |
| SimmonsSDS5 | ● | ● | ● | ● | ● | ● | ● | | | | ● | | | | | | | **8** |

---

### Soundmaster / Univox / Visco

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| SoundmastersR88 | ● | ● | ● | ● | | | | | ● | | | | | | | | | **5** |
| UnivoxMicroRhythmer12 | ● | ● | ● | ● | | | | | | | | | | | | | | **4** |
| ViscoSpaceDrum | ● | ● | ● | ● | ● | ● | ● | | | | ● | ● | | | ● | ● | | **11** |

---

### Yamaha

| Bank | bd | sd | hh | oh | ht | mt | lt | cp | cr | rd | rim | cb | sh | tb | perc | misc | fx | 总计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:--:|:----:|:----:|:--:|:---:|
| YamahaRX21 | ● | ● | ● | ● | ● | ● | ● | ● | ● | | | | | | | | | **9** |
| YamahaRX5 | ● | ● | ● | ● | | | ● | | | | ● | ● | ● | ● | | | ● | **10** |
| YamahaRM50 | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | | ● | ● | ● | ● | ● | | **15** |
| YamahaRY30 | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | | **16** |
| YamahaTG33 | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | **16** |

---

## 八、汇总统计

### 按采样库汇总

| 库名 | 音色 / 采样数 | 主要内容 |
|------|:----------:|---------|
| GM Soundfonts | 128 | 通用 MIDI 全类实际乐器 |
| VCSL | ~80 | 维也纳管弦乐真实录音 |
| Tidal Drum Machines | 683 (部件) | 71 台经典硬件鼓机 |
| Strudel Dirt Samples | 218 | 电子采样综合库 |
| Melodic Samples | 10 | 基础旋律采样 |
| Mridangam | 13 | 南印度鼓击奏法 |
| **合计** | **~1130+** | — |

### Strudel Dirt Samples 按类别统计

| 类别 | 采样数量 |
|------|---------|
| 底鼓 / 踢鼓（Kick Drum） | 8 |
| 军鼓（Snare Drum） | 3 |
| 踩镲（Hi-Hat） | 7 |
| 镲片（Cymbal） | 2 |
| 嗵鼓（Tom-Tom） | 8 |
| 拍手 / 打击（Clap / Snappy） | 5 |
| 手打 / 民族打击乐 | 16 |
| 节奏循环 / Breaks | 14 |
| 合成器贝斯（Synth Bass） | 9 |
| 合成器音色（Synth Lead / Pad） | 16 |
| 管乐（Wind / Brass） | 1 |
| 弦拨乐器（String / Plucked） | 2 |
| 钢琴 / 键盘（Piano / Keys） | 1 |
| 人声（Vocals / Speech） | 17 |
| 自然 / 环境音（Nature / Ambient） | 9 |
| 电子特效（Electronic FX） | 10 |
| 复古游戏音效（8-bit / Arcade） | 4 |
| 电子音乐风格（Genre Samples） | 13 |
| 杂项（Miscellaneous） | 73 |
| **合计** | **218** |

### GM Soundfonts 按乐器族统计

| 乐器族 | 音色数 |
|--------|:-----:|
| 键盘（Piano / Keys） | 5 |
| 色彩打击乐（Chromatic Percussion） | 8 |
| 风琴（Organ） | 8 |
| 吉他（Guitar） | 8 |
| 贝斯（Bass） | 8 |
| 弦乐（Strings） | 8 |
| 合奏 / 合唱（Ensemble） | 8 |
| 铜管（Brass） | 8 |
| 木管（Reed） | 8 |
| 管乐（Pipe） | 8 |
| 合成 Lead | 8 |
| 合成 Pad | 8 |
| 合成特效（FX） | 8 |
| 民族乐器（Ethnic） | 8 |
| 打击乐器（Percussive） | 8 |
| 音效（Sound Effects） | 8 |
| **合计** | **128** |

### Tidal Drum Machines — 按鼓件类型汇总

| 鼓件类型 | 缩写 | 包含该部件的 Bank 数 |
|---------|------|:-------------------:|
| 底鼓（Bass Drum） | `bd` | **69** |
| 军鼓（Snare Drum） | `sd` | **65** |
| 踩镲—闭合（Closed Hi-Hat） | `hh` | **58** |
| 踩镲—开放（Open Hi-Hat） | `oh` | **57** |
| 高嗵（High Tom） | `ht` | **48** |
| 低嗵（Low Tom） | `lt` | **45** |
| 碎音镲（Crash Cymbal） | `cr` | **42** |
| 拍手（Clap） | `cp` | **41** |
| 打击乐（Percussion） | `perc` | **39** |
| 边击（Rim Shot） | `rim` | **38** |
| 中嗵（Mid Tom） | `mt` | **37** |
| 牛铃（Cowbell） | `cb` | **34** |
| 叮叮镲（Ride Cymbal） | `rd` | **32** |
| 沙锤（Shaker） | `sh` | **27** |
| 铃鼓（Tambourine） | `tb` | **25** |
| 杂项（Misc） | `misc` | **21** |
| 音效（FX） | `fx` | **4** |
| **合计** | — | **682** |

### Tidal Drum Machines — 按厂商统计 Bank 数

| 厂商 | Bank 数 |
|------|:-------:|
| Roland | 21 |
| Korg | 8 |
| Yamaha | 5 |
| Akai | 4 |
| Boss | 4 |
| Casio | 4 |
| Linn | 4 |
| Alesis | 2 |
| E-mu | 3 |
| Sequential Circuits | 2 |
| Simmons | 2 |
| 其他（各 1 台） | 12 |
| **合计** | **71** |

---

*生成时间：2026-05-30*  
*数据来源：`sample_library/strudel.md`、`sample_library/tidal-drum-machines.md`、`src/lib/sample-allowlist.ts`*
