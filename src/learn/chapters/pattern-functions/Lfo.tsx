import { CodeBlock, Table } from '../../components';

export default function Lfo() {
  return (
    <>
      <p>
        低频振荡器（low frequency oscillator，简称 LFO）是合成器上一种常见的、用来持续调制各种信号的手段。
      </p>
      <p>
        本章内容是 glossing 教程的一个交互式版本：
        <a href="https://www.youtube.com/watch?v=11frBA9L638" target="_blank" rel="noopener noreferrer">
          https://www.youtube.com/watch?v=11frBA9L638
        </a>
      </p>

      <h2>信号（Signals）vs LFO</h2>
      <p>在 Strudel 中，有两种调制的方式：</p>
      <ul>
        <li>信号（signal）—— 用于 pattern 层面的调制</li>
        <li>
          <code>lfo</code>（本章内容）—— 用于音频层面的调制
        </li>
      </ul>

      <h2>使用 LFO</h2>
      <p>
        这里，LFO 会改变 <code>saw</code> 的频率。可以试着加上像 <code>{'//.lfo()'}</code>
        这样的注释来对比效果，再把注释去掉看看区别。
      </p>
      <CodeBlock code={`s("saw").lfo()
  .lpf(800)
  ._spectrum({height: 300, width: 800})`} />
      <p>
        默认情况下，LFO 会调制紧挨在 <code>.lfo()</code> 前面的那个控制参数：
      </p>
      <CodeBlock code={`s("saw")
  .lpf(800).lfo()
  ._spectrum({height: 300, width: 800})`} />
      <p>
        这里，LFO 调制的是低通滤波器 <code>.lpf</code>。
      </p>

      <h2>脱离默认设置</h2>
      <p>
        接下来几节会说明如何给 <code>.lfo</code> 传递参数。类似上面的 <code>._spectrum</code>，
        <code>lfo</code> 几乎所有的配置都存在于一个以 <code>{'{'}</code> 开始、以 <code>{'}'}</code>
        结束的 JSON 对象里。对象内部的所有参数（<code>id</code> 除外）都以 <code>key: value</code>
        的形式书写，并用逗号分隔。
      </p>
      <p>
        文档中会把这些参数称为 <code>config.key</code>，比如下面这一节就是 <code>config.control</code>
        ，但实际使用时按下面的样子写即可。
      </p>

      <h2>Control</h2>
      <p>
        <code>control</code> 决定了要调制哪个参数，这让你可以把 <code>lfo</code>
        放在任意位置，不一定要紧跟在被控制的参数后面。
      </p>
      <p>
        这里，我们把 <code>lfo</code> 放在 <code>s</code> 之后，但它调制的是低通滤波器：
      </p>
      <CodeBlock code={`s("saw")
  .lfo({control:'lpf'})
  .lpf(800)
  ._spectrum({height: 300, width: 800})`} />
      <p>
        你甚至可以影响一些始终存在的参数（即使你没有显式写出它们），比如 <code>gain</code>：
      </p>
      <CodeBlock code={`s("saw")
  .lfo({control:'gain'})
  .lpf(800)
  ._spectrum({height: 300, width: 800})`} />
      <p>
        <code>control</code> 的别名是 <code>c</code>。
      </p>

      <h2>Rate</h2>
      <p>
        <code>rate</code> 决定了 <code>lfo</code> 每秒振荡多少次：
      </p>
      <CodeBlock code={`s("saw")
  .lfo({c:'gain', rate:"<2 4>"})
  .lpf(800)
  ._spectrum({height: 300, width: 800})`} />
      <p>
        <code>rate</code> 的别名是 <code>r</code>。
      </p>

      <h2>Sync</h2>
      <p>
        除了用 <code>rate</code> 以 Hz 为单位来控制频率之外，你还可以用 <code>sync</code>
        让你的 lfo 和其他 pattern 保持同步。
      </p>
      <p>
        <code>sync</code> 用“每个 cycle 多少次”来表示这个频率。
      </p>
      <p>
        试着把下面代码中的 <code>sync: &quot;&lt;2 4 8 0.5 &gt;&quot;</code>
        去掉，你会发现有什么地方不同步了。
      </p>
      <CodeBlock code={`$: s("bd*4").bank("TR909").postgain(0.5)
$: s("saw")
  .lpf(800)
  .lfo({sync: "<2 4 8 0.5 >"})
  ._spectrum({height: 300, width: 800})`} />
      <p>
        如上所示，你可以把 pattern 放进 <code>lfo</code> 的参数中，让参数值随时间变化。
      </p>

      <h2>相对深度（Relative Depth）</h2>
      <p>
        <code>.depth</code> 是相对深度，默认值为 1，表示调制值会在被调制值的上下各波动其一半：
      </p>
      <p>
        比如 depth 为 <code>1</code> 时，会让频率在 32（= 64/2）和 96（= 64 + 64/2）之间振荡。
      </p>
      <CodeBlock code={`s("saw").freq(64)
  .lfo({r: 2, depth: "<1 2 3>"})
  .lpf(800)
  ._spectrum({height: 300, width: 800})`} />
      <p>
        这里的 <code>freq</code> 其实不是必须的，因为这正是默认频率，写出来只是为了方便说明。
      </p>
      <p>
        <code>depth</code> 的别名是 <code>dr</code> 和 <code>dep</code>。
      </p>

      <h2>绝对深度（Absolute Depth）</h2>
      <p>
        <code>depthabs</code> 控制的是绝对调制深度。例如你可以让低通滤波器精确地在上下 250 Hz 范围内调制：
      </p>
      <CodeBlock code={`s("saw")
  .lpf(800)
  .lfo({r: 2, depthabs: "250"})`} />
      <p>
        <code>depthabs</code> 的别名是 <code>da</code>。
      </p>

      <h2>DC 偏移</h2>
      <p>
        如果你不想让调制上下等幅波动，可以用 <code>dcoffset</code> 来移动调制的中心点。默认值是 -0.5，也就是下面两种极端情况的中间点：
      </p>
      <ul>
        <li>dcoffset = 0：所有调制都会增大控制参数（或保持不变）</li>
        <li>dcoffset = -1：所有调制都会减小控制参数（或保持不变）</li>
      </ul>
      <p>其他数值同样可以使用。</p>
      <CodeBlock code={`s("saw")
  .lpf(600)
  .lfo({r: 2, da: "200", dcoffset: "<-0.5 -1 -0.5 0>"})`} />
      <p>
        <code>dcoffset</code> 的绝妙别名是 <code>dc</code>。
      </p>

      <h2>Shape（波形形状）</h2>
      <p>
        你可以用 <code>shape</code> 改变调制的波形。默认是 <code>triangle</code>（三角波），此外也支持其他形状：
      </p>
      <CodeBlock code={`s("saw")
  .lpf(800)
  .lfo({r: 2, shape: "<triangle sine ramp saw square>"}) `} />
      <p>
        可以加上 <code>._spectrum()</code> 在频谱上看到调制的波形形状。
      </p>
      <p>你也可以用数字来指定这些形状：</p>
      <Table>
        <thead>
          <tr>
            <th>形状</th>
            <th>数字</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>triangle</td><td>0</td></tr>
          <tr><td>sine</td><td>1</td></tr>
          <tr><td>ramp</td><td>2</td></tr>
          <tr><td>saw</td><td>3</td></tr>
          <tr><td>square</td><td>4</td></tr>
        </tbody>
      </Table>
      <p>
        这样一来，你就可以用像 <code>irand</code> 这样的函数来生成数字：
      </p>
      <CodeBlock code={`s("saw")
  .lpf(800)
  .lfo({r: 2, shape: irand(4)}) `} />
      <p>
        <code>shape</code> 的别名是 <code>sh</code>。
      </p>

      <h2>为部分形状调整斜度（Skew）</h2>
      <p>
        你可以更细致地影响一部分形状（<code>triangle</code> 和 <code>square</code>）。
      </p>
      <p>默认的 skew 是 0.5，它对这两种形状的作用各不相同。</p>
      <p>
        对 <code>triangle</code> 来说，它会让三角形的顶点向左或向右偏移，0 会让它看起来像
        <code>saw</code>，1 会让它看起来像 <code>ramp</code>。
      </p>
      <p>
        对 <code>square</code> 来说，skew 影响的是脉冲宽度（参见 <code>pulse</code> 和 <code>.pw</code> 的说明）：
      </p>
      <CodeBlock code={`s("saw")
  .lpf(800)
  .lfo({r: 2, sh: "<triangle square>/5",
    skew: "<0 0.25 0.5 0.75 1>"}) `} />
      <p>
        <code>skew</code> 的别名是 <code>sk</code>。
      </p>

      <h2>Curve（曲线）</h2>
      <p>
        你可以改变 lfo 曲线的形状，让它效果更强烈。默认值是 1，写更大的数字（比如 10）会让效果更强烈，
        写 0 到 1 之间的数字则会让效果更弱。这个参数相当于把 lfo 值取该数字次幂，所以过大的数值（比如 10）可能会带来出乎意料的结果。
      </p>
      <CodeBlock code={`s("saw")
  .lpf(800)
  .lfo({r: 2, sh: "<triangle>", curve: "<1.3 1 0.75 1>"}) `} />

      <h2>用 id 引用你的 lfo</h2>
      <p>
        所有的 lfo 都会从 0 开始编号，第一个 lfo 的 <code>id</code> 是 0，第二个是 1，依此类推。
      </p>
      <p>你可以在之后的调用中引用这个编号，从而修改某个特定的 lfo。</p>
      <p>
        <code>id</code> 是写在 <code>lfo()</code> 配置 JSON 对象之外的（这一点和其他参数不同）。
      </p>
      <p>试着把下面的 0 换成 1，听听声音有什么变化。</p>
      <CodeBlock code={`s("saw").lfo().lpf(800)
.lfo({s: "<4 8 0.5>"})
.sometimes(x => x.lfo({dr: "4"},0))`} />
      <p>
        你也可以用 <code>id</code> 参数给你的 lfo 命名，之后按名字引用它。
      </p>
      <CodeBlock code={`s("saw").lfo({}, "lfo_freq_saw").lpf(800)
.lfo({s: "<4 8 0.5>"}, "lfo_lpf")
.sometimes(x => x.lfo({dr: "4"},"<lfo_lpf lfo_freq_saw>"))`} />

      <h2>FX 索引</h2>
      <p>
        如果你用 <code>FX()</code> 来调整效果器的顺序，那么就不需要把 lfo 写在 <code>FX</code>
        内部，而是可以通过它们的 FX 索引（从 0 开始）来引用：
      </p>
      <CodeBlock code={`s("saw").FX(
  distort(3),
  gain(0.3), // 这个的 fx 索引是 1
  lpf(400)
).lfo({s: 16, dr:2, c:"gain", fxi: 1})`} />

      <h2>用 Sub-control 调制其他 LFO</h2>
      <p>
        LFO 可以调制其他 lfo，并且会调制它们的频率（由 <code>r</code> 或 <code>s</code> 给出）：
      </p>
      <CodeBlock code={`s("saw").lpf(400).gain(0.8)
  .lfo({s: 16, dr:2, c:"gain"})
  .lfo({s: 0.3, dc:-1, dr: 0.8})`} />
      <p>
        要调制第一个 lfo 的其他参数（比如 <code>skew</code>、<code>depth</code> 等），可以用
        <code>subControl</code>（别名 <code>sc</code>）来指定：
      </p>
      <CodeBlock code={`s("saw").lpf(400).gain(0.8)
  .lfo({s: 4, dr:2, c:"gain"})
.lfo({s: 0.3, sc: "skew"})`} />
    </>
  );
}
