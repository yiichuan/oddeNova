import { CodeBlock } from '../../components';

// Verbatim from strudel.cc's website/src/examples.mjs — attribution comments
// and formatting are part of the examples, so they stay untranslated.
const EXAMPLES = [
  `// "coastline" @by eddyflux
// @version 1.0
samples('github:eddyflux/crate')
setcps(.75)
let chords = chord("<Bbm9 Fm9>/4").dict('ireal')
stack(
  stack( // DRUMS
    s("bd").struct("<[x*<1 2> [~@3 x]] x>"),
    s("~ [rim, sd:<2 3>]").room("<0 .2>"),
    n("[0 <1 3>]*<2!3 4>").s("hh"),
    s("rd:<1!3 2>*2").mask("<0 0 1 1>/16").gain(.5)
  ).bank('crate')
  .mask("<[0 1] 1 1 1>/16".early(.5))
  , // CHORDS
  chords.offset(-1).voicing().s("gm_epiano1:1")
  .phaser(4).room(.5)
  , // MELODY
  n("<0!3 1*2>").set(chords).mode("root:g2")
  .voicing().s("gm_acoustic_bass"),
  chords.n("[0 <4 3 <2 5>>*2](<3 5>,8)")
  .anchor("D5").voicing()
  .segment(4).clip(rand.range(.4,.8))
  .room(.75).shape(.3).delay(.25)
  .fm(sine.range(3,8).slow(8))
  .lpf(sine.range(500,1000).slow(8)).lpq(5)
  .rarely(ply("2")).chunk(4, fast(2))
  .gain(perlin.range(.6, .9))
  .mask("<0 1 1 0>/16")
)
.late("[0 .01]*4").late("[0 .01]*2").size(4)`,
  `// "broken cut 1" @by froos
// @version 1.0

samples('github:tidalcycles/dirt-samples')
samples({
  'slap': 'https://cdn.freesound.org/previews/495/495416_10350281-lq.mp3',
  'whirl': 'https://cdn.freesound.org/previews/495/495313_10350281-lq.mp3',
  'attack': 'https://cdn.freesound.org/previews/494/494947_10350281-lq.mp3'
})

setcps(1.25)

note("[c2 ~](3,8)*2,eb,g,bb,d").s("sawtooth")
  .noise(0.3)
  .lpf(perlin.range(800,2000).mul(0.6))
  .lpenv(perlin.range(1,5)).lpa(.25).lpd(.1).lps(0)
  .add.mix(note("<0!3 [1 <4!3 12>]>")).late(.5)
  .vib("4:.2")
  .room(1).roomsize(4).slow(4)
  .stack(
    s("bd").late("<0.01 .251>"),
    s("breaks165:1/2").fit()
    .chop(4).sometimesBy(.4, ply("2"))
    .sometimesBy(.1, ply("4")).release(.01)
    .gain(1.5).sometimes(mul(speed("1.05"))).cut(1)
    ,
    s("<whirl attack>?").delay(".8:.1:.8").room(2).slow(8).cut(2),
  ).reset("<x@30 [x*[8 [8 [16 32]]]]@2>".late(2))`,
  `// "acidic tooth" @by eddyflux
// @version 1.0
  setcps(1)
  stack(
    note("[<g1 f1>/8](<3 5>,8)")
    .clip(perlin.range(.15,1.5))
    .release(.1)
    .s("sawtooth")
    .lpf(sine.range(400,800).slow(16))
    .lpq(cosine.range(6,14).slow(3))
    .lpenv(sine.mul(4).slow(4))
    .lpd(.2).lpa(.02)
    .ftype('24db')
    .rarely(add(note(12)))
    .room(.2).shape(.3).postgain(.5)
    .superimpose(x=>x.add(note(12)).delay(.5).bpf(1000))
    .gain("[.2 1@3]*2") // fake sidechain
    ,
    stack(
      s("bd*2").mask("<0@4 1@16>"),
      s("hh*8").gain(saw.mul(saw.fast(2))).clip(sine)
      .mask("<0@8 1@16>")
    ).bank('RolandTR909')
  )`,
];

export default function GettingStarted() {
  return (
    <>
      {/* Floats beside the intro on wide screens and stacks above it on narrow
          ones, same as the source page's `w-32 animate-pulse md:float-right ml-8`.
          The float is cleared before the next section below. */}
      <img
        src="/learn-img/strudel-icon.png"
        alt="Strudel 图标"
        className="w-32 animate-pulse md:float-right md:ml-8 mb-4"
      />

      <h2>欢迎</h2>
      <p>
        欢迎来到 Strudel 文档！如果你想学习如何用代码创作音乐，那你来对地方了。
      </p>

      <h2>什么是 Strudel？</h2>
      <p>
        用 Strudel，你可以富有表现力地写出灵动的音乐作品。它是{' '}
        <a href="https://tidalcycles.org/" target="_blank" rel="noopener noreferrer">Tidal Cycles</a>{' '}
        pattern 语言的官方 JavaScript 移植版本。你不需要懂 JavaScript 或 Tidal
        Cycles，也能用 Strudel 做音乐。这份互动教程会带你了解 Strudel 的基础知识。
        真正用 Strudel 创作音乐的地方，是{' '}
        <a href="https://strudel.cc/" target="_blank" rel="noopener noreferrer">Strudel REPL</a>。
      </p>

      <div className="clear-both" />

      <h2>用 Strudel 能做什么？</h2>
      <ul>
        <li>live code 音乐：实时用代码创作音乐</li>
        <li>算法作曲：用 Tidal 那套独特的 pattern 操作方式来编曲</li>
        <li>教学：入门门槛低，很适合同时教音乐和代码</li>
        <li>接入已有的音乐设备：通过 MIDI 或 OSC，把 Strudel 当作一个非常灵活的音序器来用</li>
      </ul>

      <h2>示例</h2>
      <p>下面是一些 Strudel 能做出的声音（用右上角的箭头切换示例）：</p>
      <CodeBlock code={EXAMPLES} />
      <p>
        这些例子还远不足以涵盖你能做的所有事情，你可以去看看{' '}
        <a href="https://strudel.cc/intro/showcase/" target="_blank" rel="noopener noreferrer">showcase</a>
        ，那里有一些别人用 Strudel 演出的视频。
      </p>

      <h2>开始学习</h2>
      <p>学习 Strudel 最好的方式就是这份 workshop。准备好的话，我们从下一篇「初识声音」开始。</p>
    </>
  );
}
