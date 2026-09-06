import { CodeBlock, Callout, Table } from '../../components';

export default function VisualFeedback() {
  return (
    <>
      <p>Strudel 提供了几个可以给 pattern 加上可视化反馈的函数。</p>

      <h2>迷你记谱法高亮</h2>
      <p>
        当你用「双引号」或反引号写迷你记谱法时，当前正在播放的部分会被高亮显示：
      </p>
      <CodeBlock
        code={`n("<0 2 1 3 2>*8")
.scale("<A1 D2>/4:minor:pentatonic")
.s("supersaw").lpf(300).lpenv("<4 3 2>*4")`}
      />
      <p>你还可以修改高亮颜色，甚至给它加上 pattern：</p>
      <CodeBlock
        code={`n("<0 2 1 3 2>*8")
.scale("<A1 D2>/4:minor:pentatonic")
.s("supersaw").lpf(300).lpenv("<4 3 2>*4")
.color("cyan magenta")`}
      />

      <h2>全局可视化 vs 内联可视化</h2>
      <p>下面这些函数都有两种形式。</p>
      <p>
        <strong>不带前缀</strong>：把可视化渲染到页面背景上：
      </p>
      <CodeBlock code={`note("c a f e").color("white").punchcard()`} />
      <p>
        <strong>带 <code>_</code> 前缀</strong>：把可视化渲染在代码内部，允许同时显示多个可视化：
      </p>
      <CodeBlock code={`note("c a f e").color("white")._punchcard()`} />
      <p>
        这里展示了 <code>punchcard</code> 的两种变体。下面其余的函数也是同样的道理。为了方便阅读，接下来的演示都会使用内联变体。
      </p>

      <h2>打孔卡 / 钢琴卷帘（Punchcard / Pianoroll）</h2>
      <p>
        这两个函数都会渲染出钢琴卷帘风格的可视化。两者唯一的区别是：<code>pianoroll</code> 会直接渲染
        pattern 本身，而 <code>punchcard</code> 还会把之后发生的变换也考虑进去：
      </p>
      <CodeBlock
        code={`note("c a f e").color("white")
._punchcard()
.color("cyan")`}
        autodraw
      />
      <p>
        这里 <code>color</code> 在 <code>_punchcard</code> 之后设置，依然能在可视化里看到效果。而如果用{' '}
        <code>_pianoroll</code>，之后设置的颜色就看不出来了：
      </p>
      <CodeBlock
        code={`note("c a f e").color("white")
._pianoroll()
.color("cyan")`}
        autodraw
      />
      <Callout>
        <p>
          <code>punchcard</code> 相对更省资源，因为它复用了迷你记谱法高亮所使用的同一份数据。
        </p>
      </Callout>
      <p>
        这两个函数的可视化效果都可以通过传入参数来自定义，两者的参数完全相同。下面是所有可传参数的 API 说明。
      </p>
      <p>
        别名：<code>punchcard</code>
      </p>
      <p>
        把 pattern 可视化成滚动的「钢琴卷帘」，显示在编辑器的背景上。想为所有正在运行的 pattern 显示钢琴卷帘，可以用{' '}
        <code>all(pianoroll)</code>；想让钢琴卷帘显示在某个 pattern 的下方，就加 <code>_</code> 前缀，例如{' '}
        <code>sound(&quot;bd sd&quot;)._pianoroll()</code>。
      </p>
      <Table>
        <thead>
          <tr>
            <th>参数</th>
            <th>类型</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>options</td><td>Object</td><td>包含下列所有可选参数的对象，以键值对形式传入</td></tr>
          <tr><td>cycles</td><td>integer</td><td>同时显示的 cycle 数量，默认 4</td></tr>
          <tr><td>playhead</td><td>number</td><td>当前音符在时间轴上的位置，0 到 1，默认 0.5</td></tr>
          <tr><td>vertical</td><td>boolean</td><td>纵向显示卷帘，默认 0</td></tr>
          <tr><td>labels</td><td>boolean</td><td>在每个音符上显示标签（见 label 函数），默认 0</td></tr>
          <tr><td>flipTime</td><td>boolean</td><td>反转卷帘的滚动方向，默认 0</td></tr>
          <tr><td>flipValues</td><td>boolean</td><td>反转音符在数值轴上的相对位置，默认 0</td></tr>
          <tr><td>overscan</td><td>number</td><td>向 cycle 窗口之外多查找 X 个 cycle，以提前显示音符，默认 1</td></tr>
          <tr><td>hideNegative</td><td>boolean</td><td>隐藏时间为负的音符（即 pattern 开始播放之前的），默认 0</td></tr>
          <tr><td>smear</td><td>boolean</td><td>音符留下实心的拖影，默认 0</td></tr>
          <tr><td>fold</td><td>boolean</td><td>音符占满整个数值轴的宽度，默认 0</td></tr>
          <tr><td>active</td><td>string</td><td>当前音符的颜色（十六进制或 CSS 颜色），默认 #FFCA28</td></tr>
          <tr><td>inactive</td><td>string</td><td>非当前音符的颜色（十六进制或 CSS 颜色），默认 #7491D2</td></tr>
          <tr><td>background</td><td>string</td><td>背景颜色（十六进制或 CSS 颜色），默认透明</td></tr>
          <tr><td>playheadColor</td><td>string</td><td>播放头线条的颜色（十六进制或 CSS 颜色），默认白色</td></tr>
          <tr><td>fill</td><td>boolean</td><td>音符用颜色填充（否则只显示标签），默认 0</td></tr>
          <tr><td>fillActive</td><td>boolean</td><td>当前音符用颜色填充，默认 0</td></tr>
          <tr><td>stroke</td><td>boolean</td><td>音符显示彩色边框，默认 0</td></tr>
          <tr><td>strokeActive</td><td>boolean</td><td>当前音符显示彩色边框，默认 0</td></tr>
          <tr><td>hideInactive</td><td>boolean</td><td>只显示当前音符，默认 0</td></tr>
          <tr><td>colorizeInactive</td><td>boolean</td><td>非当前音符也使用音符自身的颜色，默认 1</td></tr>
          <tr><td>fontFamily</td><td>string</td><td>音符标签使用的字体，默认 &apos;monospace&apos;</td></tr>
          <tr><td>minMidi</td><td>integer</td><td>数值轴上显示的最低音符值，默认 10</td></tr>
          <tr><td>maxMidi</td><td>integer</td><td>数值轴上显示的最高音符值，默认 90</td></tr>
          <tr><td>autorange</td><td>boolean</td><td>自动计算 minMidi 和 maxMidi，默认 0</td></tr>
        </tbody>
      </Table>
      <CodeBlock
        code={`note("c2 a2 eb2")
.euclid(5,8)
.s('sawtooth')
.lpenv(4).lpf(300)
.pianoroll({ labels: 1 })`}
      />

      <h2>螺旋（Spiral）</h2>
      <p>显示一个螺旋形的可视化。</p>
      <Table>
        <thead>
          <tr>
            <th>参数</th>
            <th>类型</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>options</td><td>Object</td><td>包含下列所有可选参数的对象，以键值对形式传入</td></tr>
          <tr><td>stretch</td><td>number</td><td>控制每个 cycle 对应的旋转圈数，1 = 1 个 cycle 转 360 度</td></tr>
          <tr><td>size</td><td>number</td><td>螺旋的直径</td></tr>
          <tr><td>thickness</td><td>number</td><td>线条粗细</td></tr>
          <tr><td>cap</td><td>string</td><td>线端样式：butt（默认）、round、square</td></tr>
          <tr><td>inset</td><td>string</td><td>螺旋开始之前的旋转圈数，默认 3</td></tr>
          <tr><td>playheadColor</td><td>string</td><td>播放头的颜色，默认白色</td></tr>
          <tr><td>playheadLength</td><td>number</td><td>播放头的长度（以旋转圈数计），默认 0.02</td></tr>
          <tr><td>playheadThickness</td><td>number</td><td>播放头的粗细，默认与 thickness 相同</td></tr>
          <tr><td>padding</td><td>number</td><td>螺旋周围的留白</td></tr>
          <tr><td>steady</td><td>number</td><td>螺旋相对播放头的稳定程度，1 = 螺旋不动、播放头动</td></tr>
          <tr><td>activeColor</td><td>number</td><td>当前片段的颜色，默认为主题的前景色</td></tr>
          <tr><td>inactiveColor</td><td>number</td><td>非当前片段的颜色，默认为主题的 gutterForeground 色</td></tr>
          <tr><td>colorizeInactive</td><td>boolean</td><td>是否给非当前片段上色，默认 0</td></tr>
          <tr><td>fade</td><td>boolean</td><td>过去和未来的片段是否淡出，默认 1</td></tr>
          <tr><td>logSpiral</td><td>boolean</td><td>螺旋是否为对数螺旋，默认 0</td></tr>
        </tbody>
      </Table>
      <CodeBlock
        code={`note("c2 a2 eb2")
.euclid(5,8)
.s('sawtooth')
.lpenv(4).lpf(300)
._spiral({ steady: .96 })`}
      />

      <h2>示波器（Scope）</h2>
      <p>
        别名：<code>tscope</code>
      </p>
      <p>为音频信号的时域渲染一个示波器。</p>
      <Table>
        <thead>
          <tr>
            <th>参数</th>
            <th>类型</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>config</td><td>object</td><td>可选的配置对象，可用选项如下</td></tr>
          <tr><td>align</td><td>boolean</td><td>为 1 时，波形会对齐到第一个过零点，默认 1</td></tr>
          <tr><td>color</td><td>string</td><td>线条颜色（十六进制或颜色名），默认白色</td></tr>
          <tr><td>thickness</td><td>number</td><td>线条粗细，默认 3</td></tr>
          <tr><td>scale</td><td>number</td><td>缩放 y 轴，默认 0.25</td></tr>
          <tr><td>pos</td><td>number</td><td>相对于屏幕高度的 y 位置，0 = 顶部，1 = 底部</td></tr>
          <tr><td>trigger</td><td>number</td><td>用于对齐波形的振幅值，默认 0</td></tr>
        </tbody>
      </Table>
      <CodeBlock code={`s("sawtooth")._scope()`} />

      <h2>Pitchwheel</h2>
      <p>渲染一个音高圆环，用来可视化一个八度以内的频率。</p>
      <Table>
        <thead>
          <tr>
            <th>参数</th>
            <th>类型</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>hapcircles</td><td>number</td></tr>
          <tr><td>circle</td><td>number</td></tr>
          <tr><td>edo</td><td>number</td></tr>
          <tr><td>root</td><td>string</td></tr>
          <tr><td>thickness</td><td>number</td></tr>
          <tr><td>hapRadius</td><td>number</td></tr>
          <tr><td>mode</td><td>string</td></tr>
          <tr><td>margin</td><td>number</td></tr>
        </tbody>
      </Table>
      <Callout>
        <p>官方文档没有为 pitchwheel 的这几个参数给出说明，这里只保留参数名和类型。</p>
      </Callout>
      <CodeBlock
        code={`n("0 .. 12").scale("C:chromatic")
.s("sawtooth")
.lpf(500)
._pitchwheel()`}
      />

      <h2>频谱（Spectrum）</h2>
      <p>为输入的音频信号渲染一个频谱分析器。</p>
      <Table>
        <thead>
          <tr>
            <th>参数</th>
            <th>类型</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>config</td><td>object</td><td>可选的配置对象，可用选项如下</td></tr>
          <tr><td>thickness</td><td>integer</td><td>线条粗细（单位 px），默认 3</td></tr>
          <tr><td>speed</td><td>integer</td><td>滚动速度，默认 1</td></tr>
          <tr><td>min</td><td>integer</td><td>最小分贝值，默认 -80</td></tr>
          <tr><td>max</td><td>integer</td><td>最大分贝值，默认 0</td></tr>
        </tbody>
      </Table>
      <CodeBlock
        code={`n("<0 4 <2 3> 1>*3")
.off(1/8, add(n(5)))
.off(1/5, add(n(7)))
.scale("d3:minor:pentatonic")
.s('sine')
.dec(.3).room(.5)
._spectrum()`}
      />

      <h2>markcss</h2>
      <p>覆盖高亮事件的 css。注意一定要使用单引号！</p>
      <CodeBlock
        code={`note("c a f e")
.markcss('text-decoration:underline')`}
      />
    </>
  );
}
