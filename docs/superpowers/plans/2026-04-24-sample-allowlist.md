# Sample Allowlist 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 防止 LLM 在 `s("...")` 里幻觉出不存在的采样名，在 Agent 循环内自动检测并报错，让 Agent 自行修正，用户无感知。

**Architecture:** 新建白名单文件 `src/lib/sample-allowlist.ts`；在 `validateCodeRuntime`（`src/services/strudel.ts`）末尾追加采样名检查；在 `AGENT_SYSTEM_PROMPT` 和 `IMPROVISE_SYSTEM_PROMPT`（`src/prompts/system-prompt.ts`）的质量门中加一条提示。

**Tech Stack:** TypeScript，纯字符串处理（正则），无新依赖

---

## 文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `src/lib/sample-allowlist.ts` | 导出 `SAMPLE_ALLOWLIST: Set<string>`，含全量白名单 |
| 修改 | `src/services/strudel.ts` | `validateCodeRuntime` 末尾追加采样名检查 |
| 修改 | `src/prompts/system-prompt.ts` | `AGENT_SYSTEM_PROMPT` quality gate + `IMPROVISE_SYSTEM_PROMPT` 同步 |

---

## Task 1：新建白名单文件

**Files:**
- Create: `src/lib/sample-allowlist.ts`

- [ ] **Step 1: 创建白名单文件**

创建 `src/lib/sample-allowlist.ts`，内容如下（从 sample_library 两份 md 文件提取的全量库名，加上 system prompt 规定的旋律采样，加上内建合成音源）：

```typescript
/**
 * 全量采样白名单。
 * 来源：
 *   - sample_library/strudel.md 的所有 ## 标题（去掉 _base/_808/_909 等内部条目）
 *   - sample_library/tidal-drum-machines.md 的所有 ## 标题（去掉 _base）
 *   - system prompt 规定的旋律采样
 *   - Strudel 内建合成音源（不需要校验，但列在此处供参考）
 *
 * 更新方式：从两份 md 文件重新提取 `## ` 标题即可。
 */

// 内建合成音源 — validate 时直接跳过，无需在白名单中
export const SYNTH_SOURCES = new Set([
  'sawtooth', 'sine', 'square', 'triangle', 'supersaw',
]);

export const SAMPLE_ALLOWLIST = new Set<string>([
  // ── 旋律采样（system prompt 规定） ─────────────────────────────
  'piano', 'arpy', 'bass', 'moog', 'juno', 'sax', 'gtr', 'pluck', 'sitar', 'stab',

  // ── Dirt-Samples（strudel.md） ──────────────────────────────────
  '808bd', '808cy', '808hc', '808ht', '808lc', '808lt', '808mc', '808mt', '808oh', '808sd',
  'ab', 'ade', 'ades2', 'ades3', 'ades4', 'alex', 'alphabet', 'amencutup', 'armora', 'arp',
  'auto', 'baa', 'baa2', 'bass0', 'bass1', 'bass2', 'bass3', 'bassdm', 'bassfoo',
  'battles', 'bd', 'bend', 'bev', 'bin', 'birds', 'birds3', 'bleep', 'blip', 'blue',
  'bottle', 'breaks125', 'breaks152', 'breaks157', 'breaks165', 'breath', 'bubble',
  'can', 'casio', 'cb', 'cc', 'chin', 'circus', 'clak', 'click', 'clubkick', 'co',
  'coins', 'control', 'cosmicg', 'cp', 'cr', 'crow',
  'd', 'db', 'diphone', 'diphone2', 'dist', 'dork2', 'dorkbot', 'dr', 'dr2', 'dr55',
  'dr_few', 'drum', 'drumtraks',
  'e', 'east', 'electro1', 'em2', 'erk',
  'f', 'feel', 'feelfx', 'fest', 'fire', 'flick', 'fm', 'foo', 'future',
  'gab', 'gabba', 'gabbaloud', 'gabbalouder', 'glasstap', 'glitch', 'glitch2', 'gretsch',
  'h', 'hand', 'hardcore', 'hardkick', 'haw', 'hc', 'hh', 'hh27', 'hit', 'hmm', 'ho',
  'hoover', 'house', 'ht',
  'if', 'ifdrums', 'incoming', 'industrial', 'insect', 'invaders',
  'jazz', 'jungbass', 'jungle', 'jvbass',
  'kicklinn', 'koy', 'kurt',
  'latibro', 'led', 'less', 'lighter', 'linnhats', 'lt',
  'made', 'made2', 'mash', 'mash2', 'metal', 'miniyeah', 'monsterb', 'mouth',
  'mp3', 'msg', 'mt', 'mute',
  'newnotes', 'noise', 'noise2', 'notes', 'num', 'numbers',
  'oc', 'odx', 'off', 'outdoor',
  'pad', 'padlong', 'pebbles', 'perc', 'peri', 'pluck', 'popkick', 'print',
  'proc', 'procshort', 'psr',
  'rave', 'rave2', 'ravemono', 'realclaps', 'reverbkick', 'rm', 'rs',
  'sd', 'seawolf', 'sequential', 'sf', 'sheffield', 'short', 'sid', 'simplesine',
  'sn', 'space', 'speakspell', 'speech', 'speechless', 'speedupdown', 'stomp',
  'subroc3d', 'sugar', 'sundance',
  'tabla', 'tabla2', 'tablex', 'tacscan', 'tech', 'techno', 'tink', 'tok', 'toys', 'trump',
  'ul', 'ulgab', 'uxay',
  'v', 'voodoo',
  'wind', 'wobble', 'world',
  'xmas',
  'yeah',

  // ── tidal-drum-machines（tidal-drum-machines.md） ───────────────
  'AJKPercusyn_bd', 'AJKPercusyn_cb', 'AJKPercusyn_ht', 'AJKPercusyn_sd',
  'AkaiLinn_bd', 'AkaiLinn_cb', 'AkaiLinn_cp', 'AkaiLinn_cr', 'AkaiLinn_hh',
  'AkaiLinn_ht', 'AkaiLinn_lt', 'AkaiLinn_mt', 'AkaiLinn_oh', 'AkaiLinn_rd',
  'AkaiLinn_sd', 'AkaiLinn_sh', 'AkaiLinn_tb',
  'AkaiMPC60_bd', 'AkaiMPC60_cp', 'AkaiMPC60_cr', 'AkaiMPC60_hh', 'AkaiMPC60_ht',
  'AkaiMPC60_lt', 'AkaiMPC60_misc', 'AkaiMPC60_mt', 'AkaiMPC60_oh', 'AkaiMPC60_perc',
  'AkaiMPC60_rd', 'AkaiMPC60_rim', 'AkaiMPC60_sd',
  'AkaiXR10_bd', 'AkaiXR10_cb', 'AkaiXR10_cp', 'AkaiXR10_cr', 'AkaiXR10_hh',
  'AkaiXR10_ht', 'AkaiXR10_lt', 'AkaiXR10_misc', 'AkaiXR10_mt', 'AkaiXR10_oh',
  'AkaiXR10_perc', 'AkaiXR10_rd', 'AkaiXR10_rim', 'AkaiXR10_sd', 'AkaiXR10_sh', 'AkaiXR10_tb',
  'AlesisHR16_bd', 'AlesisHR16_cp', 'AlesisHR16_hh', 'AlesisHR16_ht', 'AlesisHR16_lt',
  'AlesisHR16_oh', 'AlesisHR16_perc', 'AlesisHR16_rim', 'AlesisHR16_sd', 'AlesisHR16_sh',
  'AlesisSR16_bd', 'AlesisSR16_cb', 'AlesisSR16_cp', 'AlesisSR16_cr', 'AlesisSR16_hh',
  'AlesisSR16_misc', 'AlesisSR16_oh', 'AlesisSR16_perc', 'AlesisSR16_rd', 'AlesisSR16_rim',
  'AlesisSR16_sd', 'AlesisSR16_sh', 'AlesisSR16_tb',
  'BossDR110_bd', 'BossDR110_cp', 'BossDR110_cr', 'BossDR110_hh', 'BossDR110_oh',
  'BossDR110_rd', 'BossDR110_sd',
  'BossDR220_bd', 'BossDR220_cp', 'BossDR220_cr', 'BossDR220_hh', 'BossDR220_ht',
  'BossDR220_lt', 'BossDR220_mt', 'BossDR220_oh', 'BossDR220_perc', 'BossDR220_rd', 'BossDR220_sd',
  'BossDR55_bd', 'BossDR55_hh', 'BossDR55_rim', 'BossDR55_sd',
  'BossDR550_bd', 'BossDR550_cb', 'BossDR550_cp', 'BossDR550_cr', 'BossDR550_hh',
  'BossDR550_ht', 'BossDR550_lt', 'BossDR550_misc', 'BossDR550_mt', 'BossDR550_oh',
  'BossDR550_perc', 'BossDR550_rd', 'BossDR550_rim', 'BossDR550_sd', 'BossDR550_sh', 'BossDR550_tb',
  'CasioRZ1_bd', 'CasioRZ1_cb', 'CasioRZ1_cp', 'CasioRZ1_cr', 'CasioRZ1_hh',
  'CasioRZ1_ht', 'CasioRZ1_lt', 'CasioRZ1_mt', 'CasioRZ1_rd', 'CasioRZ1_rim', 'CasioRZ1_sd',
  'CasioSK1_bd', 'CasioSK1_hh', 'CasioSK1_ht', 'CasioSK1_mt', 'CasioSK1_oh', 'CasioSK1_sd',
  'CasioVL1_bd', 'CasioVL1_hh', 'CasioVL1_sd',
  'DoepferMS404_bd', 'DoepferMS404_hh', 'DoepferMS404_lt', 'DoepferMS404_oh', 'DoepferMS404_sd',
  'EmuDrumulator_bd', 'EmuDrumulator_cb', 'EmuDrumulator_cp', 'EmuDrumulator_cr',
  'EmuDrumulator_hh', 'EmuDrumulator_ht', 'EmuDrumulator_lt', 'EmuDrumulator_mt',
  'EmuDrumulator_oh', 'EmuDrumulator_perc', 'EmuDrumulator_rim', 'EmuDrumulator_sd',
  'EmuModular_bd', 'EmuModular_misc', 'EmuModular_perc',
  'EmuSP12_bd', 'EmuSP12_cb', 'EmuSP12_cp', 'EmuSP12_cr', 'EmuSP12_hh', 'EmuSP12_ht',
  'EmuSP12_lt', 'EmuSP12_misc', 'EmuSP12_mt', 'EmuSP12_oh', 'EmuSP12_perc',
  'EmuSP12_rd', 'EmuSP12_rim', 'EmuSP12_sd',
  'KorgDDM110_bd', 'KorgDDM110_cp', 'KorgDDM110_cr', 'KorgDDM110_hh', 'KorgDDM110_ht',
  'KorgDDM110_lt', 'KorgDDM110_oh', 'KorgDDM110_rim', 'KorgDDM110_sd',
  'KorgKPR77_bd', 'KorgKPR77_cp', 'KorgKPR77_hh', 'KorgKPR77_oh', 'KorgKPR77_sd',
  'KorgKR55_bd', 'KorgKR55_cb', 'KorgKR55_cr', 'KorgKR55_hh', 'KorgKR55_ht',
  'KorgKR55_oh', 'KorgKR55_perc', 'KorgKR55_rim', 'KorgKR55_sd',
  'KorgKRZ_bd', 'KorgKRZ_cr', 'KorgKRZ_fx', 'KorgKRZ_hh', 'KorgKRZ_ht', 'KorgKRZ_lt',
  'KorgKRZ_misc', 'KorgKRZ_oh', 'KorgKRZ_rd', 'KorgKRZ_sd',
  'KorgM1_bd', 'KorgM1_cb', 'KorgM1_cp', 'KorgM1_cr', 'KorgM1_hh', 'KorgM1_ht',
  'KorgM1_misc', 'KorgM1_mt', 'KorgM1_oh', 'KorgM1_perc', 'KorgM1_rd', 'KorgM1_rim',
  'KorgM1_sd', 'KorgM1_sh', 'KorgM1_tb',
  'KorgMinipops_bd', 'KorgMinipops_hh', 'KorgMinipops_misc', 'KorgMinipops_oh', 'KorgMinipops_sd',
  'KorgPoly800_bd',
  'KorgT3_bd', 'KorgT3_cp', 'KorgT3_hh', 'KorgT3_misc', 'KorgT3_oh', 'KorgT3_perc',
  'KorgT3_rim', 'KorgT3_sd', 'KorgT3_sh',
  'Linn9000_bd', 'Linn9000_cb', 'Linn9000_cr', 'Linn9000_hh', 'Linn9000_ht', 'Linn9000_lt',
  'Linn9000_mt', 'Linn9000_oh', 'Linn9000_perc', 'Linn9000_rd', 'Linn9000_rim',
  'Linn9000_sd', 'Linn9000_tb',
  'LinnDrum_bd', 'LinnDrum_cb', 'LinnDrum_cp', 'LinnDrum_cr', 'LinnDrum_hh', 'LinnDrum_ht',
  'LinnDrum_lt', 'LinnDrum_mt', 'LinnDrum_oh', 'LinnDrum_perc', 'LinnDrum_rd', 'LinnDrum_rim',
  'LinnDrum_sd', 'LinnDrum_sh', 'LinnDrum_tb',
  'LinnLM1_bd', 'LinnLM1_cb', 'LinnLM1_cp', 'LinnLM1_hh', 'LinnLM1_ht', 'LinnLM1_lt',
  'LinnLM1_oh', 'LinnLM1_perc', 'LinnLM1_rim', 'LinnLM1_sd', 'LinnLM1_sh', 'LinnLM1_tb',
  'LinnLM2_bd', 'LinnLM2_cb', 'LinnLM2_cp', 'LinnLM2_cr', 'LinnLM2_hh', 'LinnLM2_ht',
  'LinnLM2_lt', 'LinnLM2_mt', 'LinnLM2_oh', 'LinnLM2_rd', 'LinnLM2_rim',
  'LinnLM2_sd', 'LinnLM2_sh', 'LinnLM2_tb',
  'MFB512_bd', 'MFB512_cp', 'MFB512_cr', 'MFB512_hh', 'MFB512_ht', 'MFB512_lt',
  'MFB512_mt', 'MFB512_oh', 'MFB512_sd',
  'MPC1000_bd', 'MPC1000_cp', 'MPC1000_hh', 'MPC1000_oh', 'MPC1000_perc',
  'MPC1000_sd', 'MPC1000_sh',
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
  'RolandCompurhythm1000_perc', 'RolandCompurhythm1000_rd', 'RolandCompurhythm1000_rim',
  'RolandCompurhythm1000_sd',
  'RolandCompurhythm78_bd', 'RolandCompurhythm78_cb', 'RolandCompurhythm78_hh',
  'RolandCompurhythm78_misc', 'RolandCompurhythm78_oh', 'RolandCompurhythm78_perc',
  'RolandCompurhythm78_sd', 'RolandCompurhythm78_tb',
  'RolandCompurhythm8000_bd', 'RolandCompurhythm8000_cb', 'RolandCompurhythm8000_cp',
  'RolandCompurhythm8000_cr', 'RolandCompurhythm8000_hh', 'RolandCompurhythm8000_ht',
  'RolandCompurhythm8000_lt', 'RolandCompurhythm8000_mt', 'RolandCompurhythm8000_oh',
  'RolandCompurhythm8000_perc', 'RolandCompurhythm8000_rim', 'RolandCompurhythm8000_sd',
  'RolandD110_bd', 'RolandD110_cb', 'RolandD110_cr', 'RolandD110_hh', 'RolandD110_lt',
  'RolandD110_oh', 'RolandD110_perc', 'RolandD110_rd', 'RolandD110_rim',
  'RolandD110_sd', 'RolandD110_sh', 'RolandD110_tb',
  'RolandD70_bd', 'RolandD70_cb', 'RolandD70_cp', 'RolandD70_cr', 'RolandD70_hh',
  'RolandD70_lt', 'RolandD70_mt', 'RolandD70_oh', 'RolandD70_perc', 'RolandD70_rd',
  'RolandD70_rim', 'RolandD70_sd', 'RolandD70_sh',
  'RolandDDR30_bd', 'RolandDDR30_ht', 'RolandDDR30_lt', 'RolandDDR30_sd',
  'RolandJD990_bd', 'RolandJD990_cb', 'RolandJD990_cp', 'RolandJD990_cr', 'RolandJD990_hh',
  'RolandJD990_ht', 'RolandJD990_lt', 'RolandJD990_misc', 'RolandJD990_mt', 'RolandJD990_oh',
  'RolandJD990_perc', 'RolandJD990_rd', 'RolandJD990_sd', 'RolandJD990_tb',
  'RolandMC202_bd', 'RolandMC202_ht', 'RolandMC202_perc',
  'RolandMC303_bd', 'RolandMC303_cb', 'RolandMC303_cp', 'RolandMC303_fx', 'RolandMC303_hh',
  'RolandMC303_ht', 'RolandMC303_lt', 'RolandMC303_misc', 'RolandMC303_mt', 'RolandMC303_oh',
  'RolandMC303_perc', 'RolandMC303_rd', 'RolandMC303_rim', 'RolandMC303_sd',
  'RolandMC303_sh', 'RolandMC303_tb',
  'RolandMT32_bd', 'RolandMT32_cb', 'RolandMT32_cp', 'RolandMT32_cr', 'RolandMT32_hh',
  'RolandMT32_ht', 'RolandMT32_lt', 'RolandMT32_mt', 'RolandMT32_oh', 'RolandMT32_perc',
  'RolandMT32_rd', 'RolandMT32_rim', 'RolandMT32_sd', 'RolandMT32_sh', 'RolandMT32_tb',
  'RolandR8_bd', 'RolandR8_cb', 'RolandR8_cp', 'RolandR8_cr', 'RolandR8_hh', 'RolandR8_ht',
  'RolandR8_lt', 'RolandR8_mt', 'RolandR8_oh', 'RolandR8_perc', 'RolandR8_rd', 'RolandR8_rim',
  'RolandR8_sd', 'RolandR8_sh', 'RolandR8_tb',
  'RolandS50_bd', 'RolandS50_cb', 'RolandS50_cp', 'RolandS50_cr', 'RolandS50_ht',
  'RolandS50_lt', 'RolandS50_misc', 'RolandS50_mt', 'RolandS50_oh', 'RolandS50_perc',
  'RolandS50_rd', 'RolandS50_sd', 'RolandS50_sh', 'RolandS50_tb',
  'RolandSH09_bd',
  'RolandSystem100_bd', 'RolandSystem100_hh', 'RolandSystem100_misc',
  'RolandSystem100_oh', 'RolandSystem100_perc', 'RolandSystem100_sd',
  'RolandTR505_bd', 'RolandTR505_cb', 'RolandTR505_cp', 'RolandTR505_cr', 'RolandTR505_hh',
  'RolandTR505_ht', 'RolandTR505_lt', 'RolandTR505_mt', 'RolandTR505_oh', 'RolandTR505_perc',
  'RolandTR505_rd', 'RolandTR505_rim', 'RolandTR505_sd',
  'RolandTR606_bd', 'RolandTR606_cr', 'RolandTR606_hh', 'RolandTR606_ht',
  'RolandTR606_lt', 'RolandTR606_oh', 'RolandTR606_sd',
  'RolandTR626_bd', 'RolandTR626_cb', 'RolandTR626_cp', 'RolandTR626_cr', 'RolandTR626_hh',
  'RolandTR626_ht', 'RolandTR626_lt', 'RolandTR626_mt', 'RolandTR626_oh', 'RolandTR626_perc',
  'RolandTR626_rd', 'RolandTR626_rim', 'RolandTR626_sd', 'RolandTR626_sh', 'RolandTR626_tb',
  'RolandTR707_bd', 'RolandTR707_cb', 'RolandTR707_cp', 'RolandTR707_cr', 'RolandTR707_hh',
  'RolandTR707_ht', 'RolandTR707_lt', 'RolandTR707_mt', 'RolandTR707_oh',
  'RolandTR707_rim', 'RolandTR707_sd', 'RolandTR707_tb',
  'RolandTR727_perc', 'RolandTR727_sh',
  'RolandTR808_bd', 'RolandTR808_cb', 'RolandTR808_cp', 'RolandTR808_cr', 'RolandTR808_hh',
  'RolandTR808_ht', 'RolandTR808_lt', 'RolandTR808_mt', 'RolandTR808_oh', 'RolandTR808_perc',
  'RolandTR808_rim', 'RolandTR808_sd', 'RolandTR808_sh',
  'RolandTR909_bd', 'RolandTR909_cp', 'RolandTR909_cr', 'RolandTR909_hh', 'RolandTR909_ht',
  'RolandTR909_lt', 'RolandTR909_mt', 'RolandTR909_oh', 'RolandTR909_rd', 'RolandTR909_rim',
  'RolandTR909_sd',
  'SakataDPM48_bd', 'SakataDPM48_cp', 'SakataDPM48_cr', 'SakataDPM48_hh', 'SakataDPM48_ht',
  'SakataDPM48_lt', 'SakataDPM48_mt', 'SakataDPM48_oh', 'SakataDPM48_perc',
  'SakataDPM48_rd', 'SakataDPM48_rim', 'SakataDPM48_sd', 'SakataDPM48_sh',
  'SequentialCircuitsDrumtracks_bd', 'SequentialCircuitsDrumtracks_cb',
  'SequentialCircuitsDrumtracks_cp', 'SequentialCircuitsDrumtracks_cr',
  'SequentialCircuitsDrumtracks_hh', 'SequentialCircuitsDrumtracks_ht',
  'SequentialCircuitsDrumtracks_oh', 'SequentialCircuitsDrumtracks_rd',
  'SequentialCircuitsDrumtracks_rim', 'SequentialCircuitsDrumtracks_sd',
  'SequentialCircuitsDrumtracks_sh', 'SequentialCircuitsDrumtracks_tb',
  'SequentialCircuitsTom_bd', 'SequentialCircuitsTom_cp', 'SequentialCircuitsTom_cr',
  'SequentialCircuitsTom_hh', 'SequentialCircuitsTom_ht', 'SequentialCircuitsTom_oh',
  'SequentialCircuitsTom_sd',
  'SergeModular_bd', 'SergeModular_misc', 'SergeModular_perc',
  'SimmonsSDS400_ht', 'SimmonsSDS400_lt', 'SimmonsSDS400_mt', 'SimmonsSDS400_sd',
  'SimmonsSDS5_bd', 'SimmonsSDS5_hh', 'SimmonsSDS5_ht', 'SimmonsSDS5_lt',
  'SimmonsSDS5_mt', 'SimmonsSDS5_oh', 'SimmonsSDS5_rim', 'SimmonsSDS5_sd',
  'SoundmastersR88_bd', 'SoundmastersR88_cr', 'SoundmastersR88_hh',
  'SoundmastersR88_oh', 'SoundmastersR88_sd',
  'UnivoxMicroRhythmer12_bd', 'UnivoxMicroRhythmer12_hh',
  'UnivoxMicroRhythmer12_oh', 'UnivoxMicroRhythmer12_sd',
  'ViscoSpaceDrum_bd', 'ViscoSpaceDrum_cb', 'ViscoSpaceDrum_hh', 'ViscoSpaceDrum_ht',
  'ViscoSpaceDrum_lt', 'ViscoSpaceDrum_misc', 'ViscoSpaceDrum_mt', 'ViscoSpaceDrum_oh',
  'ViscoSpaceDrum_perc', 'ViscoSpaceDrum_rim', 'ViscoSpaceDrum_sd',
  'XdrumLM8953_bd', 'XdrumLM8953_cr', 'XdrumLM8953_hh', 'XdrumLM8953_ht', 'XdrumLM8953_lt',
  'XdrumLM8953_mt', 'XdrumLM8953_oh', 'XdrumLM8953_rd', 'XdrumLM8953_rim',
  'XdrumLM8953_sd', 'XdrumLM8953_tb',
  'YamahaRM50_bd', 'YamahaRM50_cb', 'YamahaRM50_cp', 'YamahaRM50_cr', 'YamahaRM50_hh',
  'YamahaRM50_ht', 'YamahaRM50_lt', 'YamahaRM50_misc', 'YamahaRM50_mt', 'YamahaRM50_oh',
  'YamahaRM50_perc', 'YamahaRM50_rd', 'YamahaRM50_sd', 'YamahaRM50_sh', 'YamahaRM50_tb',
  'YamahaRX21_bd', 'YamahaRX21_cp', 'YamahaRX21_cr', 'YamahaRX21_hh', 'YamahaRX21_ht',
  'YamahaRX21_lt', 'YamahaRX21_mt', 'YamahaRX21_oh', 'YamahaRX21_sd',
  'YamahaRX5_bd', 'YamahaRX5_cb', 'YamahaRX5_fx', 'YamahaRX5_hh', 'YamahaRX5_lt',
  'YamahaRX5_oh', 'YamahaRX5_rim', 'YamahaRX5_sd', 'YamahaRX5_sh', 'YamahaRX5_tb',
  'YamahaRY30_bd', 'YamahaRY30_cb', 'YamahaRY30_cp', 'YamahaRY30_cr', 'YamahaRY30_hh',
  'YamahaRY30_ht', 'YamahaRY30_lt', 'YamahaRY30_misc', 'YamahaRY30_mt', 'YamahaRY30_oh',
  'YamahaRY30_perc', 'YamahaRY30_rd', 'YamahaRY30_rim', 'YamahaRY30_sd',
  'YamahaRY30_sh', 'YamahaRY30_tb',
  'YamahaTG33_bd', 'YamahaTG33_cb', 'YamahaTG33_cp', 'YamahaTG33_cr', 'YamahaTG33_fx',
  'YamahaTG33_ht', 'YamahaTG33_lt', 'YamahaTG33_misc', 'YamahaTG33_mt', 'YamahaTG33_oh',
  'YamahaTG33_perc', 'YamahaTG33_rd', 'YamahaTG33_rim', 'YamahaTG33_sd',
  'YamahaTG33_sh', 'YamahaTG33_tb',
]);

/**
 * 从一段 Strudel 代码里提取所有 s()/sound() 参数中的采样名 token。
 * 剥离 mini-notation 语法后按空白分词，过滤 ~ 和空字符串。
 */
export function extractSampleNames(code: string): string[] {
  const names: string[] = [];
  // 匹配 s("...") / s('...') / sound("...") / sound('...')
  // 跳过模板字符串（含 ` 的情况）
  const pattern = /\b(?:s|sound)\s*\(\s*["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(code)) !== null) {
    const raw = m[1];
    // 剥离 mini-notation：*N (N,M) :N !N @N ? 及括号类字符
    const stripped = raw
      .replace(/\*[\d.]+/g, '')
      .replace(/\(\d+,\s*\d+\)/g, '')
      .replace(/:\d+/g, '')
      .replace(/!\d*/g, '')
      .replace(/@[\d.]+/g, '')
      .replace(/[?[\]<>{}]/g, ' ');
    // 分词，过滤 ~ 和空
    const tokens = stripped.split(/\s+/).filter(t => t && t !== '~');
    names.push(...tokens);
  }
  return names;
}

/**
 * 检查代码中的采样名是否全部在白名单内。
 * 返回非法名列表（空数组表示全部合法）。
 */
export function findUnknownSamples(code: string): string[] {
  const names = extractSampleNames(code);
  const unknown: string[] = [];
  for (const name of names) {
    if (!SYNTH_SOURCES.has(name) && !SAMPLE_ALLOWLIST.has(name)) {
      if (!unknown.includes(name)) unknown.push(name);
    }
  }
  return unknown;
}
```

- [ ] **Step 2: 验证 TypeScript 编译通过**

```bash
cd /Users/chaycao/workspace/Vibe-Live-Music && npx tsc --noEmit 2>&1
```

预期：无报错输出（exit code 0）

- [ ] **Step 3: Commit**

```bash
cd /Users/chaycao/workspace/Vibe-Live-Music
git add src/lib/sample-allowlist.ts
git commit -m "feat: add sample allowlist with extraction helpers"
```

---

## Task 2：在 validateCodeRuntime 中追加采样名检查

**Files:**
- Modify: `src/services/strudel.ts`（`validateCodeRuntime` 函数末尾）

- [ ] **Step 1: 在 validateCodeRuntime 中 import 并调用 findUnknownSamples**

在 `src/services/strudel.ts` 文件顶部已有 import 区域，在其末尾（第一个非注释 import 行之后）加一行 import：

```typescript
import { findUnknownSamples } from '../lib/sample-allowlist';
```

然后在 `validateCodeRuntime` 函数里，将最后的 `return { ok: true }` 替换为：

```typescript
    // 采样名白名单检查
    const unknownSamples = findUnknownSamples(code);
    if (unknownSamples.length > 0) {
      return {
        ok: false,
        error: `Unknown sample name(s): ${unknownSamples.map(n => `"${n}"`).join(', ')}. Only use approved sample names (piano, arpy, bass, bd, sd, hh, etc.). See the quality gate in your system prompt.`,
      };
    }
    return { ok: true };
```

完整的 `validateCodeRuntime` 函数修改后如下（仅展示末尾变化部分）：

```typescript
  try {
    new Function('__s__', `with (__s__) { ${stripped} }`)(proxy);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // 采样名白名单检查
  const unknownSamples = findUnknownSamples(code);
  if (unknownSamples.length > 0) {
    return {
      ok: false,
      error: `Unknown sample name(s): ${unknownSamples.map(n => `"${n}"`).join(', ')}. Only use approved sample names (piano, arpy, bass, bd, sd, hh, etc.). See the quality gate in your system prompt.`,
    };
  }
  return { ok: true };
}
```

- [ ] **Step 2: 验证编译通过**

```bash
cd /Users/chaycao/workspace/Vibe-Live-Music && npx tsc --noEmit 2>&1
```

预期：无报错（exit code 0）

- [ ] **Step 3: 手动冒烟测试**

在浏览器控制台或临时测试文件里验证：

```typescript
import { findUnknownSamples } from './src/lib/sample-allowlist';

// 应返回 ["superpad"]
console.log(findUnknownSamples('s("bd ~ sd ~").gain(0.8)\n  .chain(s("superpad*4").gain(0.3))'));

// 应返回 []
console.log(findUnknownSamples('s("bd ~ sd hh*8").gain(0.8)'));

// 应返回 []（sawtooth 是内建合成音源）
console.log(findUnknownSamples('note("c3").s("sawtooth").gain(0.5)'));

// 应返回 []（808bd 在白名单里）
console.log(findUnknownSamples('note("c1 ~ ~ eb1").s("808bd").gain(0.9)'));
```

- [ ] **Step 4: Commit**

```bash
cd /Users/chaycao/workspace/Vibe-Live-Music
git add src/services/strudel.ts
git commit -m "feat: validate sample names against allowlist in validateCodeRuntime"
```

---

## Task 3：更新 system prompt 的质量门

**Files:**
- Modify: `src/prompts/system-prompt.ts`

`AGENT_SYSTEM_PROMPT` 里的 quality gate 区块（`## Before you commit (quality gate)`）末尾追加一条，`IMPROVISE_SYSTEM_PROMPT` 里的约束区块同步新增。

- [ ] **Step 1: 在 AGENT_SYSTEM_PROMPT quality gate 末尾追加采样名规则**

找到 `AGENT_SYSTEM_PROMPT` 数组里 quality gate 的最后一条：
```
  '- **lead / melody layer**: must use the same `.scale("X:mode")` string as the first harmonic layer already in the stack.',
```

在其后、`''`（空行）之前插入：
```typescript
  '- **sample names**: every `s("...")` must use only approved names. Synths (`sawtooth`, `sine`, `square`, `triangle`) are fine. Melodic: `piano arpy bass moog juno sax gtr pluck sitar stab`. Drums: `bd sd hh oh cp cb cr` and tidal-drum-machines names (e.g. `RolandTR808_bd`). NEVER invent names like "superpad", "rhodes", "strings", "violin". The `validate` tool will catch unknown names and force a retry.',
```

- [ ] **Step 2: 在 IMPROVISE_SYSTEM_PROMPT 约束区块追加相同规则**

找到 `IMPROVISE_SYSTEM_PROMPT` 数组里禁用规则相关的区块（搜索 `NEVER use` 或 `.lpfq`），在该区块末尾追加：
```typescript
  '- Sample names in `s("...")` must be from the approved list only. Synths: `sawtooth sine square triangle`. Melodic: `piano arpy bass moog juno sax gtr pluck sitar stab`. Drums: `bd sd hh oh cp cb cr` etc. NEVER invent sample names.',
```

- [ ] **Step 3: 验证编译通过**

```bash
cd /Users/chaycao/workspace/Vibe-Live-Music && npx tsc --noEmit 2>&1
```

预期：无报错（exit code 0）

- [ ] **Step 4: Commit**

```bash
cd /Users/chaycao/workspace/Vibe-Live-Music
git add src/prompts/system-prompt.ts
git commit -m "feat: add sample name quality gate to agent and improvise prompts"
```
