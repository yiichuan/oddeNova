import { CodeBlock } from '../../components';

export default function Recipes() {
  return (
    <>
      <p>
        这一章展示了实现一些常见（或者不那么常见）音乐目标的各种可能写法。同一个效果往往有很多种实现方式，没有对错之分——有意思的地方在于，不同的写法在即兴演奏时会给你不同的灵感。
      </p>

      <h2>琶音（Arpeggios）</h2>
      <p>琶音就是把和弦里的音符依次播放出来。可以手动写出每个音符：</p>
      <CodeBlock
        code={`note("c eb g c4")
.clip(2).s("gm_electric_guitar_clean")`}
        punchcard
      />
      <p>……也可以借助 scale：</p>
      <CodeBlock
        code={`n("0 2 4 7").scale("C:minor")
.clip(2).s("gm_electric_guitar_clean")`}
        punchcard
      />
      <p>……或者用和弦符号：</p>
      <CodeBlock
        code={`n("0 1 2 3").chord("Cm").mode("above:c3").voicing()
.clip(2).s("gm_electric_guitar_clean")`}
        punchcard
      />
      <p>
        ……还可以用 <code>off</code>：
      </p>
      <CodeBlock
        code={`"0"
  .off(1/3, add(2))
  .off(1/2, add(4))
  .n()
  .scale("C:minor")
  .s("gm_electric_guitar_clean")`}
        punchcard
      />

      <h2>切片打碎 break（Chopping Breaks）</h2>
      <p>一个采样可以像这样被循环并切碎：</p>
      <CodeBlock
        code={`samples('github:yaxu/clean-breaks')
s("amen/4").fit().chop(32)`}
        punchcard
      />
      <p>
        这里把一整段 break 塞进 8 个 cycle 里，并切成 16 片。目前还听不出切片的效果，因为我们还没对它做任何处理。加一点随机的重复和倒放试试：
      </p>
      <CodeBlock
        code={`samples('github:yaxu/clean-breaks')
s("amen/4").fit().chop(16).cut(1)
.sometimesBy(.5, ply("2"))
.sometimesBy(.25, mul(speed("-1")))`}
        punchcard
      />
      <p>
        如果想指定采样片段的播放顺序，可以把 <code>chop</code> 换成 <code>slice</code>：
      </p>
      <CodeBlock
        code={`samples('github:yaxu/clean-breaks')
s("amen/4").fit()
  .slice(8, "<0 1 2 3 4*2 5 6 [6 7]>*2")
  .cut(1).rarely(ply("2"))`}
        punchcard
      />
      <p>
        如果用 <code>splice</code> 代替 <code>slice</code>，播放速度会跟着每个事件的时长自动调整：
      </p>
      <CodeBlock
        code={`samples('github:yaxu/clean-breaks')
s("amen")
  .splice(8, "<0 1 2 3 4*2 5 6 [6 7]>*2")
  .cut(1).rarely(ply("2"))`}
        punchcard
      />
      <p>
        注意这里不需要再用 <code>fit</code>，因为 <code>splice</code> 本身就会处理这件事。
      </p>

      <h2>滤波器包络（Filter Envelopes）</h2>
      <p>
        用 <code>lpenv</code> 可以让滤波器动起来：
      </p>
      <CodeBlock
        code={`note("g1 bb1 <c2 eb2> d2")
  .s("sawtooth")
  .lpf(400).lpenv(4)
  .scope()`}
      />
      <p>
        包络的类型取决于你设置的方法。我们来设一下 <code>lpa</code>：
      </p>
      <CodeBlock
        code={`note("g1 bb1 <c2 eb2> d2")
  .s("sawtooth").lpq(8)
  .lpf(400).lpa(.2).lpenv(4)
  .scope()`}
      />
      <p>现在滤波器变成起音（attack）而不是之前默认的衰减（decay）。也可以两个都设置：</p>
      <CodeBlock
        code={`note("g1 bb1 <c2 eb2> d2")
  .s("sawtooth").lpq(8)
  .lpf(400).lpa(.1).lpd(.1).lpenv(4)
  .scope()`}
      />
      <p>
        可以试试调整 <code>lpa</code>、<code>lpd</code>、<code>lps</code>、<code>lpr</code>，看看滤波器包络会发生什么变化。
      </p>

      <h2>叠加声音（Layering Sounds）</h2>
      <p>
        用逗号「,」隔开就可以叠加多个声音：
      </p>
      <CodeBlock
        code={`note("<g1 bb1 d2 f1>")
.s("sawtooth, square") // <------
.scope()`}
      />
      <p>可以像这样单独控制每个声音的音量：</p>
      <CodeBlock
        code={`note("<g1 bb1 d2 f1>")
.s("sawtooth, square:0:.5") // <--- "name:number:gain"
.scope()`}
      />
      <p>
        如果想对每个声部做更精细的控制，可以用 <code>layer</code>：
      </p>
      <CodeBlock
        code={`note("<g1 bb1 d2 f1>").layer(
  x=>x.s("sawtooth").vib(4),
  x=>x.s("square").add(note(12))
).scope()`}
      />
      <p>
        这里给 sawtooth 加了颤音（vibrato），square 则被移高了一个八度。用 <code>layer</code>{' '}
        时，每个声部都可以用任何 pattern 方法，可玩性非常高。
      </p>

      <h2>振荡器失谐（Oscillator Detune）</h2>
      <p>给一个声音叠加一个稍微失谐的版本，可以让声音变得更饱满：</p>
      <CodeBlock
        code={`note("<g1 bb1 d2 f1>")
.add(note("0,.1")) // <------ chorus
.s("sawtooth").scope()`}
        punchcard
      />
      <p>试试不同的数值，或者再叠加一个声部！</p>

      <h2>复合节奏（Polyrhythms）</h2>
      <p>下面是一个复合节奏（polyrhythm）的简单例子：</p>
      <CodeBlock code={`s("bd*2,hh*3")`} punchcard />
      <p>复合节奏指的是两种不同速度同时进行。</p>

      <h2>复合拍号（Polymeter）</h2>
      <p>这是一个复合拍号（polymeter）：</p>
      <CodeBlock code={`s("<bd rim, hh hh oh>*4")`} punchcard />
      <p>复合拍号指的是两种不同小节长度以相同速度同时演奏。</p>

      <h2>相位（Phasing）</h2>
      <p>这是相位（phasing）的例子：</p>
      <CodeBlock code={`note("<C D G A Bb D C A G D Bb A>*[6,6.1]").piano()`} punchcard />
      <p>相位现象是指同一个序列以略微不同的速度播放，逐渐产生错位。</p>

      <h2>遍历采样库</h2>
      <p>
        用 <code>run</code> 搭配 <code>n</code>，可以快速遍历一个采样库：
      </p>
      <CodeBlock
        code={`samples('bubo:fox')
n(run(8)).s("ftabla")`}
        punchcard
      />
      <p>
        当采样库里的声音都比较相似时，这种写法效果特别好，比如这里的一组塔布拉鼓（tabla）录音。有时你会发现听到的乐句开头并不是在 pattern 开始的地方，这时可以用{' '}
        <code>early</code> 来调整：
      </p>
      <CodeBlock
        code={`samples('bubo:fox')
n(run(8)).s("ftabla").early(2/8)`}
      />
      <p>再加一点随机性：</p>
      <CodeBlock
        code={`samples('bubo:fox')
n(run(8)).s("ftabla").early(2/8)
.sometimes(mul(speed("1.5")))`}
      />

      <h2>磁带音高飘移（Tape Warble）</h2>
      <p>可以像这样模拟磁带的音高飘移效果：</p>
      <CodeBlock
        code={`note("<c4 bb f eb>*8")
.add(note(perlin.range(0,.5))) // <------ warble
.clip(2).s("gm_electric_guitar_clean")`}
      />

      <h2>声音时长（Sound Duration）</h2>
      <p>
        有很多种方式可以改变声音的时长。用 <code>clip</code>：
      </p>
      <CodeBlock
        code={`note("f ab bb c")
.clip("<2 1 .5 .25>")`}
      />
      <p>
        <code>clip</code> 的取值是相对于每个事件本身的时长而言的。也可以用 <code>release</code> 制造重叠：
      </p>
      <CodeBlock
        code={`note("f ab bb c")
.release("<2 1 .5 .25>")`}
      />
      <p>
        这会让每个声音以指定的秒数平滑淡出。我们也可以用 decay 包络让音符变短：
      </p>
      <CodeBlock
        code={`note("f ab bb c")
.decay("<2 1 .5 .25>")`}
      />
      <p>
        当使用采样时，还可以用 <code>.end</code> 按采样长度的比例进行截断：
      </p>
      <CodeBlock code={`s("oh*4").end("<1 .5 .25 .1>")`} />
      <p>对比一下 clip 的效果：</p>
      <CodeBlock code={`s("oh*4").clip("<1 .5 .25 .1>")`} />
      <p>再对比一下 decay：</p>
      <CodeBlock code={`s("oh*4").decay("<1 .5 .25 .1>")`} />

      <h2>波表合成（Wavetable Synthesis）</h2>
      <p>
        用 <code>loop</code> / <code>loopEnd</code> 可以循环一个采样：
      </p>
      <CodeBlock code={`note("<c eb g f>").s("bd").loop(1).loopEnd(.05).gain(.2)`} />
      <p>
        这样就能只播放底鼓采样开头的 5%，把它当作合成器来用！为了简化波表的加载，任何以 <code>wt_</code>{' '}
        开头的采样都会自动循环播放：
      </p>
      <CodeBlock
        code={`samples('github:bubobubobubobubo/dough-waveforms')
note("c eb g bb").s("wt_dbass").clip(2)`}
      />
      <p>在不同波表之间切换也能产生有趣的变化：</p>
      <CodeBlock
        code={`samples('github:bubobubobubobubo/dough-waveforms')
note("c2*8").s("wt_dbass").n(run(8)).fast(2)`}
      />
      <p>……再加上滤波器包络和混响：</p>
      <CodeBlock
        code={`samples('github:bubobubobubobubo/dough-waveforms')
note("c2*8").s("wt_dbass").n(run(8))
.lpf(perlin.range(100,1000).slow(8))
.lpenv(-3).lpa(.1).room(.5).fast(2)`}
      />
    </>
  );
}
