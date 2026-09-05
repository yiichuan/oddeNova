import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';
import {
  BUILTIN_SYNTHS,
  GM_NAME_ALIASES,
  SAMPLE_ALLOWLIST,
  findUnknownSamples,
  normalizeGmSampleNames,
} from '../sample-allowlist';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — gm-fonts.js is a plain JS ESM file with no type declarations
import gmFonts from '../gm-fonts.js';
import { VERIDIS_QUO } from '../featured-scripts';

describe('findUnknownSamples', () => {
  it('合法 sample 不报错', () => {
    expect(findUnknownSamples('s("bd ~ sd ~")')).toEqual([]);
  });

  it('非法 sample 返回未知名称', () => {
    const result = findUnknownSamples('s("superpad violin")');
    expect(result).toEqual(['superpad', 'violin']);
  });

  it('808/909 鼓机文件夹名合法', () => {
    expect(findUnknownSamples('s("808 909")')).toEqual([]);
  });

  it('GM soundfont 名合法', () => {
    expect(findUnknownSamples('s("gm_acoustic_grand_piano")')).toEqual([]);
  });

  it('合法 GM soundfont 混合非法 sample', () => {
    const result = findUnknownSamples('s("gm_acoustic_grand_piano rhodes")');
    expect(result).toEqual(['rhodes']);
  });

  it('内置合成器（sawtooth、sine 等）合法', () => {
    expect(findUnknownSamples('s("sawtooth")')).toEqual([]);
    expect(findUnknownSamples('s("sine")')).toEqual([]);
  });

  it('~ 静音符号不视为 sample', () => {
    expect(findUnknownSamples('s("bd ~ ~ sd")')).toEqual([]);
  });

  it('mini-notation 括号内的 token 正确解析', () => {
    // Only use tokens confirmed to exist in DIRT_SAMPLES: bd, sd, hh, hh27
    const result = findUnknownSamples('s("[bd sd] ~ [hh <hh27 hh>]")');
    expect(result).toEqual([]);
  });

  it('不含 s() 调用的代码返回空数组', () => {
    expect(findUnknownSamples('note("c4 e4").gain(0.5)')).toEqual([]);
  });

  it('sound() 别名等同于 s()', () => {
    const result = findUnknownSamples('sound("fakesample")');
    expect(result).toEqual(['fakesample']);
  });

  it('.bank() 合法组合不报错', () => {
    // bd is a valid suffix in VALID_BANK_SUFFIXES and RolandTR808_bd exists in the allowlist
    expect(findUnknownSamples('s("bd").bank("RolandTR808")')).toEqual([]);
  });

  it('.bank() 非法组合返回 bank_suffix 形式的未知 token', () => {
    // arp is in SAMPLE_ALLOWLIST (DIRT_SAMPLES) but is not in VALID_BANK_SUFFIXES,
    // and RolandTR808_arp does not exist in the allowlist
    expect(findUnknownSamples('s("arp").bank("RolandTR808")')).toEqual(['RolandTR808_arp']);
  });

  it('逗号分隔的多轨 mini-notation 不误报', () => {
    // s("bd*4, ~ sd ~ sd, hh*8") — commas are multi-track separators, not part of sample names
    expect(findUnknownSamples('s("bd*4, ~ sd ~ sd, hh*8")')).toEqual([]);
  });

  it('精选曲目的鼓机小写 alias 可通过 sample 校验', () => {
    expect(findUnknownSamples(VERIDIS_QUO)).toEqual([]);
  });

  it('鼓机 alias 保留原大小写形式', () => {
    expect(findUnknownSamples('s("DR550_bd DR550_lt RM50_hh")')).toEqual([]);
  });

  it('当前代码中的 samples() 直接标识符键可作为合法 sample', () => {
    expect(findUnknownSamples(`
      samples({
        camera_flash: "https://example.com/camera.wav",
        vox: "https://example.com/vox.wav",
      });
      s("camera_flash vox");
    `)).toEqual([]);
  });

  it('被局部 samples 绑定遮蔽时不声明自定义 sample', () => {
    const code = 'const samples = () => undefined; samples({ shadow_custom_xyz: "..." }); s("shadow_custom_xyz");';

    expect(findUnknownSamples(code)).toEqual(['shadow_custom_xyz']);
  });

  it('samples() 后换行接 instanceof 时不把调用当作独立注册语句', () => {
    const code = 'samples({ infix_custom_xyz: "..." })\ninstanceof Object; s("infix_custom_xyz");';

    expect(findUnknownSamples(code)).toEqual(['infix_custom_xyz']);
  });

  it('samples() 的双引号字面量键可作为合法 sample', () => {
    expect(findUnknownSamples(`
      samples({ "quoted_vox": "https://example.com/vox.wav" });
      s("quoted_vox");
    `)).toEqual([]);
  });

  it('samples() 的单引号字面量键可作为合法 sample', () => {
    expect(findUnknownSamples("samples({ 'single_quoted_vox': 'https://example.com/vox.wav' }); s(\"single_quoted_vox\")")).toEqual([]);
  });

  it('注释、字符串和模板字符串中的 samples() 不声明 sample', () => {
    const code = [
      '// samples({ comment_only: "https://example.com/comment.wav" })',
      'const text = \'samples({ string_only: "https://example.com/string.wav" })\';',
      'const template = `samples({ template_only: "https://example.com/template.wav" })`;',
      's("comment_only string_only template_only")',
    ].join('\n');

    expect(findUnknownSamples(code)).toEqual(['comment_only', 'string_only', 'template_only']);
  });

  it('computed、spread、shorthand、变量对象、动态和嵌套键不会声明 sample', () => {
    const cases = [
      ['computed', 'const key = "computed_sample"; samples({ [key]: "..." }); s("computed_sample")'],
      ['spread', 'samples({ ...{ spread_sample: "..." } }); s("spread_sample")'],
      ['shorthand', 'const shorthand_sample = "..."; samples({ shorthand_sample }); s("shorthand_sample")'],
      ['variable-object', 'const definitions = { variable_sample: "..." }; samples(definitions); s("variable_sample")'],
      ['dynamic', 'const dynamic_key = "dynamic_sample"; samples({ [dynamic_key]: "..." }); s("dynamic_sample")'],
      ['nested', 'samples({ outer: { nested_sample: "..." } }); s("nested_sample")'],
    ] as const;

    for (const [, code] of cases) {
      const sample = code.match(/s\("([^"]+)"\)/)?.[1];
      expect(sample).toBeDefined();
      expect(findUnknownSamples(code)).toEqual([sample]);
    }
  });

  it('mini-notation 的 hold token 和 slash-rate modifier 不视为 sample', () => {
    const code = 'samples({ camera_flash: "..." }); s("<[- [- camera_flash] - -] [-]>/4")';

    expect(findUnknownSamples(code)).toEqual([]);
  });

  it('未知 sample 按首次出现顺序去重，已声明 sample 不返回', () => {
    const code = 'samples({ vox: "..." }); s("voxx voxx vox voxx")';

    expect(findUnknownSamples(code)).toEqual(['voxx']);
  });

  it('限定名 samples() 调用不会声明 sample', () => {
    const code = 'const obj = {}; obj.samples({ qualified_sample: "..." }); s("qualified_sample")';

    expect(findUnknownSamples(code)).toEqual(['qualified_sample']);
  });

  it('点号和 samples() 之间的注释也不会绕过限定名判断', () => {
    const code = 'const obj = {}; obj. /* text /* nested-looking */ samples({ qualified_comment_sample: "..." }); s("qualified_comment_sample")';

    expect(findUnknownSamples(code)).toEqual(['qualified_comment_sample']);
  });

  it('对象方法签名中的 samples() 不会声明 sample', () => {
    const code = 'const obj = { samples({ method_sample: value }) { return value; } }; s("method_sample")';

    expect(findUnknownSamples(code)).toEqual(['method_sample']);
  });

  it('正则字面量中的 samples() 不会声明 sample', () => {
    const code = 'const pattern = /samples({ regex_sample: "..." })/; s("regex_sample")';

    expect(findUnknownSamples(code)).toEqual(['regex_sample']);
  });

  it('控制流闭括号后的正则字面量不会声明 sample', () => {
    const code = 'if (true /* ) */) /samples({ regex_control_sample: "..." })/.test("x"); s("regex_control_sample")';

    expect(findUnknownSamples(code)).toEqual(['regex_control_sample']);
  });

  it('块结束后的合法 regex 内 samples() 不会声明 sample', () => {
    const code = 'function f() {} /foo; samples({ fake: "..." });bar/; s("fake")';

    expect(findUnknownSamples(code)).toEqual(['fake']);
  });

  it('division 与 regex 不混淆且对象值中的 division 不阻断注册', () => {
    expect(findUnknownSamples('n++ / 2; samples({ real: "..." }); s("real")')).toEqual([]);
    expect(findUnknownSamples('samples({ divided_value: 1 / 2, later_key: "..." }); s("later_key")')).toEqual([]);
  });

  it('nested function declaration 闭合后的 regex 不污染外层 block 深度', () => {
    const code = 'function outer(){ function inner(){} /[}]/; samples({ fake: "..." }); }; samples({ real: "..." }); s("fake real")';

    expect(findUnknownSamples(code)).toEqual(['fake']);
  });

  it('class expression 闭合后保留 division 上下文', () => {
    const code = 'const C = class {} / 2; samples({ real: "..." }); s("real")';

    expect(findUnknownSamples(code)).toEqual([]);
  });

  it('完成分号语句后只接受顶层裸 samples() 注册且允许 baseUrl 参数', () => {
    const code = [
      'const before = 1;',
      '/* leading comment */',
      'samples({ statement_sample: "..." }, baseUrl);',
      's("statement_sample")',
    ].join('\n');

    expect(findUnknownSamples(code)).toEqual([]);
  });

  it('赋值、return 和除法表达式中的裸 samples() 均保持未知', () => {
    const code = [
      'const assigned = samples({ assigned_sample: "..." });',
      'function register() { return samples({ returned_sample: "..." }); }',
      'const divided = 1 / samples({ divided_sample: "..." });',
      's("assigned_sample returned_sample divided_sample")',
    ].join('\n');

    expect(findUnknownSamples(code)).toEqual([
      'assigned_sample',
      'returned_sample',
      'divided_sample',
    ]);
  });

  it('构造器、箭头函数和函数签名中的 samples() 均保持未知', () => {
    const code = [
      'new samples({ constructor_sample: "..." });',
      'const arrow = () => samples({ arrow_sample: "..." });',
      'function samples({ function_signature_sample: value }) { return value; }',
      's("constructor_sample arrow_sample function_signature_sample")',
    ].join('\n');

    expect(findUnknownSamples(code)).toEqual([
      'constructor_sample',
      'arrow_sample',
      'function_signature_sample',
    ]);
  });

  it('const、let、var、function、class、import 和参数绑定均 fail closed', () => {
    const cases = [
      'const samples = () => undefined; samples({ bound_sample: "..." }); s("bound_sample")',
      'let samples = () => undefined; samples({ bound_sample: "..." }); s("bound_sample")',
      'var samples = () => undefined; samples({ bound_sample: "..." }); s("bound_sample")',
      'function samples() {} samples({ bound_sample: "..." }); s("bound_sample")',
      'class samples {} samples({ bound_sample: "..." }); s("bound_sample")',
      'import samples from "module"; samples({ bound_sample: "..." }); s("bound_sample")',
      'function render(samples) { return samples; } samples({ bound_sample: "..." }); s("bound_sample")',
      'const render = (samples) => samples; samples({ bound_sample: "..." }); s("bound_sample")',
    ];

    for (const code of cases) {
      expect(findUnknownSamples(code)).toEqual(['bound_sample']);
    }
  });

  it('samples 被直接赋值或解构赋值时 fail closed', () => {
    const cases = [
      'samples = () => undefined; samples({ assigned_sample: "..." }); s("assigned_sample")',
      '({ samples } = source); samples({ destructured_sample: "..." }); s("destructured_sample")',
      '([samples] = source); samples({ array_destructured_sample: "..." }); s("array_destructured_sample")',
      '({ nested: { samples } } = source); samples({ nested_destructured_sample: "..." }); s("nested_destructured_sample")',
    ];

    for (const code of cases) {
      expect(findUnknownSamples(code)).toEqual([code.match(/s\("([^"]+)"\)/)?.[1]]);
    }
  });

  it('对象属性 samples 的赋值不屏蔽真正的顶层注册', () => {
    const cases = [
      'const obj = {}; obj.samples = fn; samples({ property_assignment_sample: "..." }); s("property_assignment_sample")',
      'getContainer()[samples] = fn; samples({ computed_member_assignment_sample: "..." }); s("computed_member_assignment_sample")',
    ];

    for (const code of cases) {
      expect(findUnknownSamples(code)).toEqual([]);
    }
  });

  it('rest 解构和全局 samples 写入 fail closed', () => {
    const cases = [
      ['({ ...samples } = source); samples({ object_rest_sample: "..." }); s("object_rest_sample")', 'object_rest_sample'],
      ['([...samples] = source); samples({ array_rest_sample: "..." }); s("array_rest_sample")', 'array_rest_sample'],
      ['samples += fn; samples({ compound_assignment_sample: "..." }); s("compound_assignment_sample")', 'compound_assignment_sample'],
      ['++samples; samples({ prefix_increment_sample: "..." }); s("prefix_increment_sample")', 'prefix_increment_sample'],
      ['samples--; samples({ postfix_decrement_sample: "..." }); s("postfix_decrement_sample")', 'postfix_decrement_sample'],
      ['globalThis.samples = fn; samples({ global_assignment_sample: "..." }); s("global_assignment_sample")', 'global_assignment_sample'],
      ['++globalThis.samples; samples({ global_prefix_sample: "..." }); s("global_prefix_sample")', 'global_prefix_sample'],
      ['--window.samples; samples({ window_prefix_sample: "..." }); s("window_prefix_sample")', 'window_prefix_sample'],
      ['self.samples += fn; samples({ self_compound_sample: "..." }); s("self_compound_sample")', 'self_compound_sample'],
    ] as const;

    for (const [code, expected] of cases) {
      expect(findUnknownSamples(code)).toEqual([expected]);
    }
  });

  it('解构模式中的读取和嵌套成员写入不误伤顶层注册', () => {
    const cases = [
      'foo.globalThis.samples = fn; samples({ chained_global_member_sample: "..." }); s("chained_global_member_sample")',
      '({ [foo[samples]]: alias } = source); samples({ nested_computed_read_sample: "..." }); s("nested_computed_read_sample")',
      '({ value = get(samples) } = source); samples({ default_value_read_sample: "..." }); s("default_value_read_sample")',
    ];

    for (const code of cases) {
      expect(findUnknownSamples(code)).toEqual([]);
    }
  });

  it('声明式解构只识别真正的 samples 绑定目标', () => {
    const falsePositiveCases = [
      'const { samples: alias } = source; samples({ declaration_property_sample: "..." }); s("declaration_property_sample")',
      'let { [foo[samples]]: alias } = source; samples({ declaration_computed_sample: "..." }); s("declaration_computed_sample")',
      'var { value = get(samples) } = source; samples({ declaration_default_sample: "..." }); s("declaration_default_sample")',
    ];
    const bindingCases = [
      'const { samples } = source; samples({ declaration_binding_sample: "..." }); s("declaration_binding_sample")',
      'let { nested: { samples } } = source; samples({ declaration_nested_binding_sample: "..." }); s("declaration_nested_binding_sample")',
    ];

    for (const code of falsePositiveCases) {
      expect(findUnknownSamples(code)).toEqual([]);
    }
    for (const code of bindingCases) {
      expect(findUnknownSamples(code)).toEqual([code.match(/s\("([^"]+)"\)/)?.[1]]);
    }
  });

  it('普通 slash 保持为未知 sample token', () => {
    expect(findUnknownSamples('s("foo/bar")')).toEqual(['foo/bar']);
  });

  it('带非数字后缀的 slash token 保持完整未知名称', () => {
    expect(findUnknownSamples('s("bass/4foo")')).toEqual(['bass/4foo']);
  });

  it('sample 末尾 slash 保持为未知 sample token', () => {
    expect(findUnknownSamples('s("gm_piano/")')).toEqual(['gm_piano/']);
  });

  it('slash-rate modifier /4.25 不视为 sample', () => {
    expect(findUnknownSamples('samples({ camera_flash: "..." }); s("camera_flash/4.25")')).toEqual([]);
  });

  it('slash-rate modifier /.5 不视为 sample', () => {
    expect(findUnknownSamples('samples({ camera_flash: "..." }); s("camera_flash/.5")')).toEqual([]);
  });
});

describe('normalizeGmSampleNames', () => {
  it('把 MIDI 标准名改写为 strudel 规范名', () => {
    expect(normalizeGmSampleNames('s("gm_acoustic_grand_piano")')).toBe('s("gm_piano")');
    expect(normalizeGmSampleNames('note("c4").s("gm_pad_2_warm")')).toBe('note("c4").s("gm_pad_warm")');
    expect(normalizeGmSampleNames('s("gm_lead_square")')).toBe('s("gm_lead_1_square")');
  });

  it('honky_tonk_piano 优先于 honky_tonk（最长匹配）', () => {
    expect(normalizeGmSampleNames('s("gm_honky_tonk_piano")')).toBe('s("gm_piano")');
    expect(normalizeGmSampleNames('s("gm_honky_tonk")')).toBe('s("gm_piano")');
  });

  it('已是规范名时保持不变', () => {
    expect(normalizeGmSampleNames('s("gm_piano gm_epiano1")')).toBe('s("gm_piano gm_epiano1")');
  });

  it('改写后的代码通过 sample 校验', () => {
    expect(findUnknownSamples(normalizeGmSampleNames('s("gm_acoustic_grand_piano")'))).toEqual([]);
  });
});

// The allowlist only earns its keep while it matches what prebake() actually
// registers. Drift in either direction is a real bug: a name that is registered
// but not allowed gets rejected by validate() even though it plays, and a name
// that is allowed but not registered validates and then plays silence.
// These tests read the same files prebake() does, so upstream changes surface
// here instead of in generated music.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const INDEX_DIR = join(ROOT, 'public/sample-index');
// Not a sample index: maps long drum-machine names onto the short bank prefixes
// used by the sample keys, consumed by aliasBank() rather than samples().
const BANK_ALIAS_FILE = 'tidal-drum-machines-alias.json';

const SAMPLE_INDEX_FILES = readdirSync(INDEX_DIR)
  .filter((file) => file.endsWith('.json') && file !== BANK_ALIAS_FILE);

const readIndex = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(INDEX_DIR, file), 'utf8')) as Record<string, unknown>;

const indexKeys = (file: string): string[] =>
  Object.keys(readIndex(file)).filter((key) => !key.startsWith('_'));

// superdough normalises both registration keys and lookups this way
// (superdough.mjs registerSound / getSound), so comparisons must too.
const soundKey = (name: string): string => name.toLowerCase().replace(/\s+/g, '_');

/** Every key superdough's soundMap holds once strudel.ts prebake() has finished. */
function registeredSoundNames(): Set<string> {
  const names = new Set<string>();
  for (const file of SAMPLE_INDEX_FILES) {
    for (const key of indexKeys(file)) names.add(soundKey(key));
  }

  // aliasBank() re-registers every existing `bank_suffix` sound under each alias
  // of that bank, so `RolandTR808_bd` also becomes `tr808_bd`.
  const aliasMap = readIndex(BANK_ALIAS_FILE) as Record<string, string | string[]>;
  const aliasByBank = new Map(
    Object.entries(aliasMap).map(([bank, alias]) => [bank.toLowerCase(), alias]),
  );
  for (const name of [...names]) {
    const sep = name.indexOf('_');
    if (sep <= 0) continue;
    const alias = aliasByBank.get(name.slice(0, sep));
    if (alias === undefined) continue;
    for (const one of Array.isArray(alias) ? alias : [alias]) {
      names.add(soundKey(`${one}_${name.slice(sep + 1)}`));
    }
  }

  // registerSoundfonts() registers the canonical gm_* names plus every alias.
  for (const name of Object.keys(gmFonts as Record<string, unknown>)) names.add(soundKey(name));
  for (const alias of Object.keys(GM_NAME_ALIASES)) names.add(soundKey(alias));

  for (const name of BUILTIN_SYNTHS) names.add(soundKey(name));
  return names;
}

describe('sample-allowlist 与 prebake() 实际注册的声音同步', () => {
  it.each(SAMPLE_INDEX_FILES)('%s 里的每个名称都被校验器接受', (file) => {
    const rejected = indexKeys(file).filter(
      (key) => !SAMPLE_ALLOWLIST.has(key) && !BUILTIN_SYNTHS.has(key),
    );
    expect(rejected, `${file} 里的这些名称能播放，却会被 validate() 判为幻觉`).toEqual([]);
  });

  it('allowlist 里的每个名称都真的注册过', () => {
    const registered = registeredSoundNames();
    const dead = [...SAMPLE_ALLOWLIST].filter((name) => !registered.has(soundKey(name)));
    expect(dead, '这些名称会通过 validate()，播放时却找不到声音').toEqual([]);
  });
});

// Mirrors superdough's registerSynthSounds(), the only synth registration
// prebake() performs. Parsed from the installed package so that a synth added
// upstream fails here instead of silently staying unusable.
describe('BUILTIN_SYNTHS 覆盖 registerSynthSounds() 注册的全部声音', () => {
  // Registered, but deliberately not offered to the agent — none of them is an
  // audible voice, so allowing them would only let a mistake through.
  const NOT_A_VOICE = new Set([
    'user', // needs .partials(); without it superdough falls back to triangle
    'one',  // constant DC source, for modulation
    'bus',  // bus input node (type 'input')
  ]);

  const readSuperdough = (file: string): string =>
    readFileSync(join(ROOT, 'node_modules/superdough', file), 'utf8');

  const stringsIn = (source: string, pattern: RegExp): string[] => {
    const match = pattern.exec(source);
    if (match === null) return [];
    return [...match[1].matchAll(/'([^']+)'/g)].map(([, name]) => name);
  };

  it('没有遗漏任何已注册的合成器名', () => {
    const synth = readSuperdough('synth.mjs');
    const registered = [
      ...stringsIn(synth, /const waveforms\s*=\s*\[([^\]]*)\]/),
      ...stringsIn(readSuperdough('helpers.mjs'), /export const noises\s*=\s*\[([^\]]*)\]/),
      ...stringsIn(synth, /const waveformAliases\s*=\s*\[([\s\S]*?)\];/),
      ...[...synth.matchAll(/registerSound\(\s*'([a-z0-9_]+)'/g)].map(([, name]) => name),
    ];
    // A superdough refactor that breaks the parsing must fail loudly, not pass.
    expect(registered.length).toBeGreaterThan(10);
    expect(registered.filter((name) => !BUILTIN_SYNTHS.has(name) && !NOT_A_VOICE.has(name))).toEqual([]);
  });
});
