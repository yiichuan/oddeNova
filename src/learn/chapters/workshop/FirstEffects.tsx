import { CodeBlock, Callout, QA, Table } from '../../components';

export default function FirstEffects() {
  return (
    <>
      <p>我们有了声音，有了音符，现在来看看效果！</p>

      <h2>一些基础效果</h2>
      <p><strong>低通滤波器（low-pass filter）</strong></p>
      <CodeBlock code={`note("<[c2 c3]*4 [bb1 bb2]*4 [f2 f3]*4 [eb2 eb3]*4>")
.sound("sawtooth").lpf(800)`} />
      <Callout>
        <p>lpf = low pass filter，低通滤波器</p>
        <ul>
          <li>把 lpf 改成 200，注意声音会变闷。想象一下自己站在关着门的俱乐部外面 🚪。</li>
          <li>现在把门打开……改成 5000，注意声音会变亮 ✨🪩</li>
        </ul>
      </Callout>

      <p><strong>给滤波器加上 pattern</strong></p>
      <CodeBlock code={`note("<[c2 c3]*4 [bb1 bb2]*4 [f2 f3]*4 [eb2 eb3]*4>")
.sound("sawtooth").lpf("200 1000 200 1000")`} />
      <Callout>
        <p>试着加更多数值。</p>
        <p>注意 lpf 里的 pattern 并不会改变整体的节奏。</p>
        <p>之后我们会学到怎么用信号（signal）来自动化这些参数……</p>
      </Callout>

      <p><strong>vowel（元音）</strong></p>
      <CodeBlock code={`note("<[c3,g3,e4] [bb2,f3,d4] [a2,f3,c4] [bb2,g3,eb4]>")
.sound("sawtooth").vowel("<a e i o>")`} />

      <p><strong>gain（音量）</strong></p>
      <CodeBlock code={`$: sound("hh*16").gain("[.25 1]*4")

$: sound("bd*4,[~ sd:1]*2")`} punchcard />
      <Callout>
        <p>节奏的精髓就在于音量的强弱变化！</p>
        <ul>
          <li>删掉 <code>.gain(...)</code>，感受一下变得多平淡。</li>
          <li>用 ctrl+z 撤销把它加回来。</li>
        </ul>
      </Callout>

      <p>把上面这些组合成一小段曲子：</p>
      <CodeBlock code={`$: sound("hh*8").gain("[.25 1]*4")

$: sound("bd*4,[~ sd:1]*2")

$: note("<[c2 c3]*4 [bb1 bb2]*4 [f2 f3]*4 [eb2 eb3]*4>")
.sound("sawtooth").lpf("200 1000 200 1000")

$: note("<[c3,g3,e4] [bb2,f3,d4] [a2,f3,c4] [bb2,g3,eb4]>")
.sound("sawtooth").vowel("<a e i o>")`} />

      <p><strong>用 ADSR 包络塑造音色</strong></p>
      <CodeBlock code={`note("c3 bb2 f3 eb3")
.sound("sawtooth").lpf(600)
.attack(.1)
.decay(.1)
.sustain(.25)
.release(.2)`} />
      <Callout>
        <p>试着搞清楚这些数字分别是做什么的……对比一下：</p>
        <ul>
          <li>attack（起音）：0.5 对比 0</li>
          <li>decay（衰减）：0.5 对比 0</li>
          <li>sustain（延音）：1 对比 0.25 对比 0</li>
          <li>release（释音）：0 对比 0.5 对比 1</li>
        </ul>
        <p>能猜出它们各自的作用吗？</p>
      </Callout>
      <QA question="点击查看答案">
        <ul>
          <li>attack：淡入所需的时间</li>
          <li>decay：从最高点衰减到 sustain 音量所需的时间</li>
          <li>sustain：衰减结束后维持的音量</li>
          <li>release：音符结束后淡出所需的时间</li>
        </ul>
        <figure className="mt-3">
          <img src="/learn-img/adsr.png" alt="ADSR 包络的起音、衰减、延音和释音示意图" className="max-w-full" />
          <figcaption className="mt-1 text-center text-[11px] text-white/40">ADSR 包络</figcaption>
        </figure>
      </QA>

      <p><strong>ADSR 的简写形式</strong></p>
      <CodeBlock code={`note("c3 bb2 f3 eb3")
.sound("sawtooth").lpf(600)
.adsr(".1:.1:.5:.2")`} />

      <p><strong>delay（延迟）</strong></p>
      <CodeBlock code={`$: note("[~ [<[d3,a3,f4]!2 [d3,bb3,g4]!2> ~]]*2")
  .sound("gm_electric_guitar_muted").delay(.5)

$: sound("bd rim").bank("RolandTR707").delay(".5")`} />
      <Callout>
        <p>试试 0 到 1 之间的不同 <code>delay</code> 值。顺带一提，<code>.5</code> 是 <code>0.5</code> 的简写。</p>
        <p>用 <code>.delay(".8:.125")</code> 会怎样？能猜出第二个数字是做什么的吗？</p>
        <p>用 <code>.delay(".8:.06:.8")</code> 会怎样？能猜出第三个数字是做什么的吗？</p>
      </Callout>
      <QA question="点击查看答案">
        <p><code>delay("a:b:c")</code>：</p>
        <ul>
          <li>a：延迟音量</li>
          <li>b：延迟时间</li>
          <li>c：反馈量（数字越小，衰减越快）</li>
        </ul>
      </QA>

      <p><strong>room，也就是混响（reverb）</strong></p>
      <CodeBlock code={`n("<4 [3@3 4] [<2 0> ~@16] ~>")
.scale("D4:minor").sound("gm_accordion:2")
.room(2)`} />
      <Callout>
        <p>试试不同的数值！也可以再加上 delay！</p>
      </Callout>

      <p><strong>一小段 dub 风格曲子</strong></p>
      <CodeBlock code={`$: note("[~ [<[d3,a3,f4]!2 [d3,bb3,g4]!2> ~]]*2")
.sound("gm_electric_guitar_muted").delay(.5)

$: sound("bd rim").bank("RolandTR707").delay(.5)

$: n("<4 [3@3 4] [<2 0> ~@16] ~>")
.scale("D4:minor").sound("gm_accordion:2")
.room(2).gain(.5)`} />
      <p>再加一段贝斯，让它更完整：</p>
      <CodeBlock code={`$: note("[~ [<[d3,a3,f4]!2 [d3,bb3,g4]!2> ~]]*2")
.sound("gm_electric_guitar_muted").delay(.5)

$: sound("bd rim").bank("RolandTR707").delay(.5)

$: n("<4 [3@3 4] [<2 0> ~@16] ~>")
.scale("D4:minor").sound("gm_accordion:2")
.room(2).gain(.4)

$: n("[0 [~ 0] 4 [3 2] [0 ~] [0 ~] <0 2> ~]/2")
.scale("D2:minor")
.sound("sawtooth,triangle").lpf(800)`} />
      <Callout>
        <p>试着在叠放（stack）里某一段末尾加上 <code>.hush()</code>……</p>
      </Callout>

      <p><strong>pan（声像）</strong></p>
      <CodeBlock code={`sound("numbers:1 numbers:2 numbers:3 numbers:4")
.pan("0 0.3 .6 1")`} />

      <p><strong>speed（速度/播放速率）</strong></p>
      <CodeBlock code={`sound("bd rim [~ bd] rim").speed("<1 2 -1 -2>").room(.2)`} />

      <p><strong>fast 与 slow</strong></p>
      <p>我们可以用 <code>fast</code> 和 <code>slow</code> 在迷你记谱法之外改变 pattern 的速度：</p>
      <CodeBlock code={`sound("bd*4,~ rim ~ cp").slow(2)`} />
      <Callout>
        <p>改改 <code>slow</code> 的值，也试着换成 <code>fast</code>。</p>
        <p>如果用 <code>.fast("&lt;1 [2 4]&gt;")</code> 这样的 pattern 会怎样？</p>
      </Callout>
      <p>顺带一提，在迷你记谱法里，<code>fast</code> 就是 <code>*</code>，<code>slow</code> 就是 <code>/</code>。</p>
      <CodeBlock code={`sound("[bd*4,~ rim ~ cp]*<1 [2 4]>")`} />

      <h2>用信号（signals）来调制</h2>
      <p>除了逐步改变数值，我们也可以用信号来控制参数：</p>
      <CodeBlock code={`sound("hh*16").gain(sine)`} punchcard punchcardLabels={false} />
      <Callout>
        <p>基础波形有 <code>sine</code>、<code>saw</code>、<code>square</code>、<code>tri</code> 🌊</p>
        <p>也试试随机信号 <code>rand</code> 和 <code>perlin</code>！</p>
        <p>gain 在 pianoroll 里会用透明度来可视化展示。</p>
      </Callout>

      <p><strong>设定取值范围</strong></p>
      <p>默认情况下，波形在 0 到 1 之间振荡。我们可以用 <code>range</code> 改变这个范围：</p>
      <CodeBlock code={`sound("hh*16").lpf(saw.range(500, 2000))`} />
      <Callout>
        <p>如果把 range 的两个值对调会怎样？</p>
      </Callout>

      <p>我们可以用 slow / fast 改变调制的速度：</p>
      <CodeBlock code={`note("<[c2 c3]*4 [bb1 bb2]*4 [f2 f3]*4 [eb2 eb3]*4>")
  .sound("sawtooth")
  .lpf(sine.range(100, 2000).slow(4))`} />
      <Callout>
        <p>现在整个调制过程要 8 个 cycle 才会重复一次。</p>
      </Callout>

      <h2>回顾总结</h2>
      <Table>
        <thead><tr><th>名称</th><th>示例</th></tr></thead>
        <tbody>
          <tr><td>lpf</td><td><CodeBlock code={`note("c2 c3 c2 c3").s("sawtooth").lpf("<400 2000>")`} /></td></tr>
          <tr><td>vowel</td><td><CodeBlock code={`note("c3 eb3 g3").s("sawtooth").vowel("<a e i o>")`} /></td></tr>
          <tr><td>gain</td><td><CodeBlock code={`s("hh*16").gain("[.25 1]*2")`} /></td></tr>
          <tr><td>delay</td><td><CodeBlock code={`s("bd rim bd cp").delay(.5)`} /></td></tr>
          <tr><td>room</td><td><CodeBlock code={`s("bd rim bd cp").room(.5)`} /></td></tr>
          <tr><td>pan</td><td><CodeBlock code={`s("bd rim bd cp").pan("0 1")`} /></td></tr>
          <tr><td>speed</td><td><CodeBlock code={`s("bd rim bd cp").speed("<1 2 -1 -2>")`} /></td></tr>
          <tr><td>signals</td><td>sine、saw、square、tri、rand、perlin<br /><CodeBlock code={`s("hh*16").gain(saw)`} /></td></tr>
          <tr><td>range</td><td><CodeBlock code={`s("hh*16").lpf(saw.range(200,4000))`} /></td></tr>
        </tbody>
      </Table>
      <p>接下来我们看看 Tidal 里一些更独特的 pattern 效果。</p>
    </>
  );
}
